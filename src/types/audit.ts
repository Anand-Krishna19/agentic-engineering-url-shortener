// Audit record types (FR-130; ADR-006). Mirrors contracts/schemas/audit-event.schema.json and the
// audit_events table in docker/init-db/001-schema.sql; tests/unit/types/types.test.ts fails on drift.
// Records are append-only and hash-chained per run.

import type { ClockKind, PolicyVersion, RunId } from './orchestration.js';

export const ACTOR_TYPES = ['HUMAN', 'AGENT', 'SYSTEM'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const AUDIT_RESULTS = ['SUCCESS', 'FAILURE', 'DENIED', 'REJECTED', 'NOOP'] as const;
export type AuditResult = (typeof AUDIT_RESULTS)[number];

export const AUDIT_ACTIONS = [
  'RUN_CREATED', 'REQUIREMENT_INGESTED', 'PLAN_VERSION_CREATED', 'NODE_STATE_CHANGED',
  'ATTEMPT_STARTED', 'ATTEMPT_FINISHED', 'RETRY_SCHEDULED', 'FALLBACK_APPLIED',
  'COMPENSATION_STARTED', 'COMPENSATION_FINISHED', 'SAFE_STOP_ENTERED', 'RUN_RESUMED',
  'REPLAN_PROPOSED', 'REPLAN_APPLIED', 'APPROVAL_REQUESTED', 'APPROVAL_RECORDED',
  'APPROVAL_DENIED', 'APPROVAL_TIMEOUT', 'APPROVAL_ESCALATED', 'LATE_RESPONSE_REJECTED',
  'AMBIGUITY_DETECTED', 'CLARIFICATION_REQUESTED', 'CLARIFICATION_ANSWERED',
  'DECISION_RECORDED', 'ASSUMPTION_RECORDED', 'ARTIFACT_VERSION_CREATED', 'ARTIFACT_MARKED_STALE',
  'POLICY_EVALUATED', 'EXCEPTION_REQUESTED', 'EXCEPTION_DECIDED', 'EXCEPTION_EXPIRED',
  'CHANGE_REQUESTED', 'CHANGE_DECIDED', 'WORK_ITEM_OFFERED', 'WORK_ITEM_SUBMITTED',
  'AGENT_ACTION_DENIED', 'FAILURE_DETECTED', 'RECOVERY_STARTED', 'RECOVERY_COMPLETED',
  'RELEASE_READINESS_DETERMINED', 'RUN_TERMINATED', 'AUDIT_CHAIN_VERIFIED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_SUBJECT_TYPES = [
  'RUN', 'NODE', 'ATTEMPT', 'ARTIFACT', 'GATE', 'APPROVAL', 'AMBIGUITY', 'CLARIFICATION',
  'DECISION', 'POLICY', 'EXCEPTION', 'CHANGE', 'WORK_ITEM', 'FAILURE', 'AUDIT',
] as const;
export type AuditSubjectType = (typeof AUDIT_SUBJECT_TYPES)[number];

/** `prev_hash` of the first event of a run. */
export const ZERO_HASH = '0'.repeat(64);

export interface AuditRecord {
  event_id: string;
  run_id: RunId;
  /** Gapless per run, starting at 1. */
  seq: number;
  occurred_at: string;
  clock_kind: ClockKind;
  actor_type: ActorType;
  actor_id?: string;
  role_string?: string;
  /** Identifier of the credential used, never the secret (DEC-037). */
  credential_id?: string;
  action: AuditAction;
  subject_type: AuditSubjectType;
  subject_id: string;
  from_state?: string;
  to_state?: string;
  result: AuditResult;
  reason: string;
  policy_version?: PolicyVersion;
  correlation_id: string;
  causation_id?: string;
  /** Structured details. Never holds secrets or credentials. */
  data?: Record<string, unknown>;
  prev_hash: string;
  /** SHA-256 over `prev_hash` and the canonical JSON of this event without the `hash` field. */
  hash: string;
}

export const AUDIT_RECORD_FIELDS = [
  'event_id', 'run_id', 'seq', 'occurred_at', 'clock_kind', 'actor_type', 'actor_id', 'role_string',
  'credential_id', 'action', 'subject_type', 'subject_id', 'from_state', 'to_state', 'result', 'reason',
  'policy_version', 'correlation_id', 'causation_id', 'data', 'prev_hash', 'hash',
] as const satisfies readonly (keyof AuditRecord)[];

export const AUDIT_REQUIRED_FIELDS = [
  'event_id', 'run_id', 'seq', 'occurred_at', 'clock_kind', 'actor_type', 'action', 'subject_type',
  'subject_id', 'result', 'reason', 'correlation_id', 'prev_hash', 'hash',
] as const satisfies readonly (keyof AuditRecord)[];
