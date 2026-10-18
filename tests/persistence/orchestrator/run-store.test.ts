import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SimulatedClock } from '../../../src/kernel/clock/clock.js';
import { pgDatabase } from '../../../src/shortener/adapters/persistence/pg-database.js';
import { verifyAuditChain } from '../../../src/orchestrator/persistence/audit-chain.js';
import { RunStore } from '../../../src/orchestrator/persistence/run-store.js';
import { startPostgres, type TestPostgres } from '../../support/postgres.js';

// Implements: T016. Real PostgreSQL, orchestrator database, orchestrator_app role.
// Requirements: FR-107, FR-130, FR-121, NFR-006 | ADRs: ADR-018, ADR-006 | DECs: DEC-050, DEC-095
const actor = { type: 'SYSTEM' as const, id: 'engine' };
let server: TestPostgres;
let config: pg.ClientConfig;
let store: RunStore;
let clock: SimulatedClock;

beforeAll(async () => {
  server = await startPostgres(`orch-store-${process.pid}`);
  config = { ...server.config, user: 'orchestrator_app', password: 'test-orchestrator-pw', database: 'orchestrator' };
  clock = new SimulatedClock('2026-01-01T00:00:00.000Z');
  store = new RunStore(pgDatabase(config), clock);
}, 120_000);

afterAll(() => server?.stop());

const raw = async <T>(fn: (c: pg.Client) => Promise<T>) => {
  const c = new pg.Client(config);
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
};

describe('[FR-107][ADR-018] persisted run state', () => {
  it('creates a run and resumes it from the database alone', async () => {
    const created = await store.createRun({ runId: 'r-resume', profile: 'sdlc/1', agentMode: 'SCRIPTED', policyVersion: 'p1' }, actor);
    expect(created.ok).toBe(true);
    await store.transitionRun('r-resume', 'RUNNING', actor, 'start');
    await store.setNodeState('r-resume', 'n1', 'PENDING', actor, 'registered');
    await store.setNodeState('r-resume', 'n1', 'READY', actor, 'deps met');
    await store.setNodeState('r-resume', 'n1', 'RUNNING', actor, 'go', { countAttempt: true });

    const fresh = new RunStore(pgDatabase(config), clock); // a new instance holds no memory
    const run = await fresh.loadRun('r-resume');
    expect(run?.status).toBe('RUNNING');
    expect(run?.policyVersion).toBe('p1');
    expect(run?.nodes).toEqual([expect.objectContaining({ node_key: 'n1', state: 'RUNNING', attempt_count: 1 })]);
  });

  it('rejects an unknown run id and a duplicate run without creating anything', async () => {
    expect((await store.transitionRun('nope', 'RUNNING', actor, 'x')).ok).toBe(false);
    expect(await store.loadRun('nope')).toBeUndefined();
    expect((await store.createRun({ runId: 'r-resume', profile: 'p', agentMode: 'SCRIPTED' }, actor)).ok).toBe(false);
  });

  it('[DEC-050] SAFE_STOPPED is permanent', async () => {
    await store.createRun({ runId: 'r-safe', profile: 'sdlc/1', agentMode: 'SCRIPTED' }, actor);
    await store.transitionRun('r-safe', 'RUNNING', actor, 'start');
    expect((await store.transitionRun('r-safe', 'SAFE_STOPPED', actor, 'timeout')).ok).toBe(true);
    const back = await store.transitionRun('r-safe', 'RUNNING', actor, 'try resume');
    expect(back).toEqual({ ok: false, error: expect.stringContaining('Invalid transition') });
    expect((await store.loadRun('r-safe'))?.status).toBe('SAFE_STOPPED');
  });
});

describe('[FR-130][ADR-006] hash-chained audit', () => {
  it('has gapless seq, ZERO_HASH start and a verifiable chain, rejected moves included', async () => {
    await store.createRun({ runId: 'r-chain', profile: 'sdlc/1', agentMode: 'SCRIPTED' }, actor);
    await store.transitionRun('r-chain', 'RUNNING', actor, 'start');
    await store.transitionRun('r-chain', 'CREATED' as never, actor, 'illegal');
    await store.transitionRun('r-chain', 'COMPLETED', actor, 'done');

    const rows = await raw((c) => c.query('SELECT seq, prev_hash, result FROM audit_events WHERE run_id = $1 ORDER BY seq', ['r-chain']));
    expect(rows.rows.map((r) => r.seq)).toEqual([1, 2, 3, 4]);
    expect(rows.rows[0]!.prev_hash).toBe('0'.repeat(64));
    expect(rows.rows[2]!.result).toBe('REJECTED');
    const v = await raw((c) => verifyAuditChain(c, 'r-chain'));
    expect(v).toEqual({ valid: true, events: 4 });
  });

  it('detects tampering made outside the application role', async () => {
    const admin = new pg.Client({ ...server.config, user: 'app', password: 'test-admin-pw', database: 'orchestrator' });
    await admin.connect();
    try {
      await admin.query('ALTER TABLE audit_events DISABLE TRIGGER audit_events_no_mutation');
      await admin.query("UPDATE audit_events SET reason = 'edited' WHERE run_id = 'r-chain' AND seq = 2");
      await admin.query('ALTER TABLE audit_events ENABLE TRIGGER audit_events_no_mutation');
    } finally { await admin.end(); }
    const v = await raw((c) => verifyAuditChain(c, 'r-chain'));
    expect(v).toMatchObject({ valid: false, brokenAtSeq: 2, reason: 'hash mismatch' });
  });

  it('keeps seq gapless under concurrent writers', async () => {
    await store.createRun({ runId: 'r-conc', profile: 'sdlc/1', agentMode: 'SCRIPTED' }, actor);
    await Promise.all(['a', 'b', 'c', 'd', 'e'].map((k) => store.setNodeState('r-conc', k, 'PENDING', actor, 'reg')));
    const v = await raw((c) => verifyAuditChain(c, 'r-conc'));
    expect(v).toEqual({ valid: true, events: 6 });
  });
});
