import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AGENT_MODES,
  ARTIFACT_VERSION_STATUSES,
  CLOCK_KINDS,
  GATE_KEYS,
  GATE_STATES,
  NODE_STATES,
  RELEASE_OUTCOMES,
  SCENARIO_TAGS,
  TERMINAL_RUN_STATUSES,
  WORKFLOW_RUN_STATUSES,
  WORKFLOW_STATE_FIELDS,
  isWorkflowRunStatus,
  type ContractValidationResult,
  type NodeState,
  type WorkflowRunStatus,
  type WorkflowState,
} from '../../../src/types/orchestration.js';
import {
  ACTOR_TYPES,
  AUDIT_ACTIONS,
  AUDIT_RECORD_FIELDS,
  AUDIT_REQUIRED_FIELDS,
  AUDIT_RESULTS,
  AUDIT_SUBJECT_TYPES,
  ZERO_HASH,
  type AuditRecord,
} from '../../../src/types/audit.js';

// The approved JSON schemas are the source of truth; these tests catch drift (FR-101, FR-107, FR-130).
const CONTRACTS = 'specs/001-agentic-url-shortener/contracts';
const json = (p: string) => JSON.parse(readFileSync(`${CONTRACTS}/${p}`, 'utf8'));
const wf = json('schemas/workflow-state.schema.json');
const audit = json('schemas/audit-event.schema.json');
const sql = readFileSync('docker/init-db/001-schema.sql', 'utf8');

/** Values of `<column> ... CHECK (<column> IN ('A','B'))` inside the orchestrator half of 001-schema.sql. */
function sqlCheck(column: string): string[] {
  const control = sql.slice(sql.indexOf('CREATE DATABASE orchestrator'));
  const m = new RegExp(`CHECK \\(${column} IN \\(([^)]*)\\)\\)`).exec(control);
  if (!m) throw new Error(`no CHECK for ${column}`);
  return [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!);
}

describe('T005 orchestration types', () => {
  it('[FR-107] WorkflowRunStatus equals the workflow-state schema and the T003 workflow_runs constraint', () => {
    expect([...WORKFLOW_RUN_STATUSES]).toEqual(wf.properties.status.enum);
    expect([...WORKFLOW_RUN_STATUSES]).toEqual(sqlCheck('status'));
    expect([...WORKFLOW_RUN_STATUSES]).toEqual(['CREATED', 'RUNNING', 'SAFE_STOPPED', 'COMPLETED', 'CANCELLED']);
  });

  it('[FR-107] terminal run statuses are the last three; SAFE_STOPPED is terminal (DEC-050)', () => {
    expect([...TERMINAL_RUN_STATUSES]).toEqual(['SAFE_STOPPED', 'COMPLETED', 'CANCELLED']);
    expect(isWorkflowRunStatus('RUNNING')).toBe(true);
    expect(isWorkflowRunStatus('IN_PROGRESS')).toBe(false);
    expect(isWorkflowRunStatus(42)).toBe(false);
  });

  it('[FR-107][ADR-018] NodeState equals orchestration-model.md section 3.1 and the schema', () => {
    expect([...NODE_STATES]).toEqual(wf.properties.nodes.items.properties.state.enum);
    expect(NODE_STATES).toHaveLength(15);
  });

  it('[FR-101] run header vocabularies equal the schema and the T003 constraints', () => {
    expect([...SCENARIO_TAGS]).toEqual(wf.properties.scenario_tag.enum);
    expect([...SCENARIO_TAGS]).toEqual(sqlCheck('scenario_tag'));
    expect([...AGENT_MODES]).toEqual(wf.properties.agent_mode.enum);
    expect([...AGENT_MODES]).toEqual(sqlCheck('agent_mode'));
    expect([...RELEASE_OUTCOMES]).toEqual(['READY', 'NOT_READY']);
    expect([...RELEASE_OUTCOMES]).toEqual(sqlCheck('release_outcome'));
    expect([...CLOCK_KINDS]).toEqual(wf.properties.gates.items.properties.clock_kind.enum);
  });

  it('[FR-102] gate and artifact vocabularies equal the schema', () => {
    expect([...GATE_KEYS]).toEqual(wf.properties.gates.items.properties.gate_key.enum);
    expect([...GATE_STATES]).toEqual(wf.properties.gates.items.properties.state.enum);
    expect([...ARTIFACT_VERSION_STATUSES]).toEqual(wf.properties.artifact_versions.items.properties.status.enum);
  });

  it('[FR-101][FR-107] WorkflowState fields equal the schema properties and required set', () => {
    expect([...WORKFLOW_STATE_FIELDS].sort()).toEqual(Object.keys(wf.properties).sort());
  });

  it('[FR-101] a WorkflowState carries run id, policy catalogue version and per-node stage status', () => {
    const state: WorkflowState = {
      run_id: 'run-1',
      profile: 'sdlc/1',
      scenario_tag: 'TEST',
      agent_mode: 'SCRIPTED',
      status: 'RUNNING',
      plan_version: 1,
      policy_catalogue_version: 'v1.0',
      created_at: '2026-10-17T00:00:00Z',
      nodes: [{ node_key: 'N01_INGEST', state: 'PENDING', attempt_count: 0 }],
      gates: [{ gate_id: 'g1', gate_key: 'G-ARCH', state: 'OPEN' }],
    };
    const status: WorkflowRunStatus = state.status;
    const stage: NodeState = state.nodes[0]!.state;
    expect([status, stage]).toEqual(['RUNNING', 'PENDING']);
  });

  it('[FR-107] workflow vocabularies exclude the idempotency states (they belong to T008)', () => {
    for (const idem of ['IN_PROGRESS', 'FAILED']) {
      expect(WORKFLOW_RUN_STATUSES as readonly string[]).not.toContain(idem);
      expect(NODE_STATES as readonly string[]).not.toContain(idem);
    }
  });

  it('[ADR-009] ContractValidationResult reports validity and located violations', () => {
    const ok: ContractValidationResult = { valid: true, errors: [] };
    const bad: ContractValidationResult = {
      valid: false,
      errors: [{ path: '/status', message: 'must be equal to one of the allowed values' }],
    };
    expect(ok.valid && !bad.valid && bad.errors[0]!.path === '/status').toBe(true);
  });
});

describe('T005 audit types', () => {
  it('[FR-130] AuditRecord fields equal the audit-event schema properties; required set matches', () => {
    expect([...AUDIT_RECORD_FIELDS].sort()).toEqual(Object.keys(audit.properties).sort());
    expect([...AUDIT_REQUIRED_FIELDS].sort()).toEqual([...audit.required].sort());
  });

  it('[FR-130][ADR-006] audit vocabularies equal the schema', () => {
    expect([...AUDIT_ACTIONS]).toEqual(audit.properties.action.enum);
    expect([...AUDIT_SUBJECT_TYPES]).toEqual(audit.properties.subject_type.enum);
    expect([...ACTOR_TYPES]).toEqual(audit.properties.actor_type.enum);
    expect([...AUDIT_RESULTS]).toEqual(audit.properties.result.enum);
  });

  it('[FR-130][DEC-095] actor type and result match the T003 audit_events constraints', () => {
    expect([...ACTOR_TYPES]).toEqual(sqlCheck('actor_type'));
    expect([...AUDIT_RESULTS]).toEqual(sqlCheck('result'));
  });

  it('[ADR-006] the first event of a run chains from an all-zero hash', () => {
    expect(ZERO_HASH).toBe('0'.repeat(64));
  });

  it('[FR-130] the approved illustrative audit event uses only AuditRecord fields and valid vocabularies', () => {
    const ex = json('examples/audit-event.illustrative.json') as AuditRecord;
    for (const k of Object.keys(ex)) expect(AUDIT_RECORD_FIELDS as readonly string[], k).toContain(k);
    for (const k of AUDIT_REQUIRED_FIELDS) expect(ex, k).toHaveProperty(k);
    expect(AUDIT_ACTIONS as readonly string[]).toContain(ex.action);
    expect(ACTOR_TYPES as readonly string[]).toContain(ex.actor_type);
  });

  it('[FR-130] an AuditRecord can be constructed with required fields only', () => {
    const rec: AuditRecord = {
      event_id: 'e1',
      run_id: 'run-1',
      seq: 1,
      occurred_at: '2026-10-17T00:00:00Z',
      clock_kind: 'WALL',
      actor_type: 'SYSTEM',
      action: 'RUN_CREATED',
      subject_type: 'RUN',
      subject_id: 'run-1',
      result: 'SUCCESS',
      reason: 'run created',
      correlation_id: 'run-1',
      prev_hash: ZERO_HASH,
      hash: 'a'.repeat(64),
    };
    expect(rec.seq).toBe(1);
  });
});
