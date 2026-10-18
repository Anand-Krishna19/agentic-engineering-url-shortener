/**
 * Append-only, hash-chained audit writer.
 *
 * Implements: T016. The writer must run inside the same transaction as the state change it records.
 * Requirements: FR-107, FR-130, FR-121, NFR-006
 * ADRs:         ADR-006 (immutable audit), ADR-018 (workflow state persistence)
 * DECs:         DEC-095 (audit tables are INSERT-only)
 */
import { createHash } from 'node:crypto';
import { ZERO_HASH, type AuditRecord } from '../../types/audit.js';
import type { Queryable } from '../../kernel/db/port.ts';
export type NewAuditEvent = Omit<AuditRecord, 'event_id' | 'seq' | 'prev_hash' | 'hash'>;

/**
 * Minimal database connection interface for audit operations.
 * Compatible with the shortener's database adapter to maintain ADR-016 plane separation.
 */
export interface Db {
  withConnection<T>(fn: (conn: Queryable) => Promise<T>): Promise<T>;
}

/** Deterministic JSON: object keys sorted, `undefined` members dropped. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/** SHA-256 over `prev_hash` and the canonical JSON of the event without `event_id` (database-assigned) and `hash`. */
export function computeAuditHash(record: Omit<AuditRecord, 'event_id' | 'hash'>): string {
  return createHash('sha256').update(record.prev_hash).update(canonicalJson(record)).digest('hex');
}

const COLUMNS = [
  'run_id', 'seq', 'occurred_at', 'clock_kind', 'actor_type', 'actor_id', 'role_string', 'credential_id',
  'action', 'subject_type', 'subject_id', 'from_state', 'to_state', 'result', 'reason', 'policy_version',
  'correlation_id', 'causation_id', 'data', 'prev_hash', 'hash',
] as const;

/**
 * Appends the next event of `event.run_id`. Locks the run row so `seq` stays gapless under concurrency.
 * Call inside a transaction together with the state change.
 */
export async function appendAuditEvent(conn: Queryable, event: NewAuditEvent): Promise<AuditRecord> {
  const lock = await conn.query('SELECT run_id FROM workflow_runs WHERE run_id = $1 FOR UPDATE', [event.run_id]);
  if (lock.rows.length === 0) throw new Error(`Cannot audit unknown run ${event.run_id}`);

  const last = await conn.query(
      'SELECT seq, hash FROM audit_events WHERE run_id = $1 ORDER BY seq DESC LIMIT 1',
      [event.run_id],
  );
  const seq = last.rows.length === 0 ? 1 : Number(last.rows[0]!.seq) + 1;
  const prev_hash = last.rows.length === 0 ? ZERO_HASH : String(last.rows[0]!.hash);

  const unsigned = { ...event, seq, prev_hash };
  const hash = computeAuditHash(unsigned);
  const row: Record<string, unknown> = { ...unsigned, hash };

  const values = COLUMNS.map((c) => (c === 'data' && row[c] !== undefined ? JSON.stringify(row[c]) : row[c] ?? null));
  const placeholders = COLUMNS.map((_, i) => `$${i + 1}`).join(', ');
  const inserted = await conn.query(
      `INSERT INTO audit_events (${COLUMNS.join(', ')}) VALUES (${placeholders}) RETURNING event_id`,
      values,
  );
  return { ...unsigned, hash, event_id: String(inserted.rows[0]!.event_id) };
}

export interface ChainVerification {
  readonly valid: boolean;
  readonly events: number;
  /** `seq` of the first event that breaks the chain. */
  readonly brokenAtSeq?: number;
  readonly reason?: string;
}

/** Recomputes the whole chain of a run: gapless `seq`, `ZERO_HASH` start, linked `prev_hash`, matching `hash`. */
export async function verifyAuditChain(conn: Queryable, runId: string): Promise<ChainVerification> {
  const { rows } = await conn.query('SELECT * FROM audit_events WHERE run_id = $1 ORDER BY seq', [runId]);
  let prev = ZERO_HASH;
  let expectedSeq = 1;
  for (const r of rows) {
    const seq = Number(r.seq);
    if (seq !== expectedSeq) return { valid: false, events: rows.length, brokenAtSeq: seq, reason: `seq gap: expected ${expectedSeq}` };
    if (r.prev_hash !== prev) return { valid: false, events: rows.length, brokenAtSeq: seq, reason: 'prev_hash does not link' };
    const record = rowToUnsigned(r);
    if (computeAuditHash(record) !== r.hash) return { valid: false, events: rows.length, brokenAtSeq: seq, reason: 'hash mismatch' };
    prev = String(r.hash);
    expectedSeq += 1;
  }
  return { valid: true, events: rows.length };
}

function rowToUnsigned(r: Record<string, unknown>): Omit<AuditRecord, 'event_id' | 'hash'> {
  const optional = (v: unknown) => (v === null || v === undefined ? undefined : v);
  const occurred = r.occurred_at instanceof Date ? r.occurred_at.toISOString() : String(r.occurred_at);
  return {
    run_id: String(r.run_id),
    seq: Number(r.seq),
    occurred_at: occurred,
    clock_kind: r.clock_kind as AuditRecord['clock_kind'],
    actor_type: r.actor_type as AuditRecord['actor_type'],
    actor_id: optional(r.actor_id) as string | undefined,
    role_string: optional(r.role_string) as string | undefined,
    credential_id: optional(r.credential_id) as string | undefined,
    action: r.action as AuditRecord['action'],
    subject_type: r.subject_type as AuditRecord['subject_type'],
    subject_id: String(r.subject_id),
    from_state: optional(r.from_state) as string | undefined,
    to_state: optional(r.to_state) as string | undefined,
    result: r.result as AuditRecord['result'],
    reason: String(r.reason),
    policy_version: optional(r.policy_version) as string | undefined,
    correlation_id: String(r.correlation_id),
    causation_id: optional(r.causation_id) as string | undefined,
    data: optional(r.data) as Record<string, unknown> | undefined,
    prev_hash: String(r.prev_hash),
  };
}