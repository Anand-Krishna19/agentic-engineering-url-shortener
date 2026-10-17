// Orchestration workflow state types (FR-101, FR-102, FR-107; ADR-018).
// Vocabularies mirror contracts/schemas/workflow-state.schema.json and docker/init-db/001-schema.sql;
// tests/unit/types/types.test.ts fails on drift. Interface fields keep the schema's snake_case so an
// inspection view serializes directly.
//
// IN_PROGRESS / COMPLETED / FAILED are idempotency-record states (FR-015 to FR-018, data-model.md 5.1),
// not workflow states. They belong to T008 and are intentionally absent here.

export type RunId = string;
/** Policy catalogue version evaluated by a run, for example `v1.0` (FR-101, DEC-048). */
export type PolicyVersion = string;

export const WORKFLOW_RUN_STATUSES = ['CREATED', 'RUNNING', 'SAFE_STOPPED', 'COMPLETED', 'CANCELLED'] as const;
export type WorkflowRunStatus = (typeof WORKFLOW_RUN_STATUSES)[number];

/** SAFE_STOPPED is permanent (DEC-050); the stopped run is never modified. */
export const TERMINAL_RUN_STATUSES = ['SAFE_STOPPED', 'COMPLETED', 'CANCELLED'] as const satisfies readonly WorkflowRunStatus[];

export const isWorkflowRunStatus = (v: unknown): v is WorkflowRunStatus =>
  typeof v === 'string' && (WORKFLOW_RUN_STATUSES as readonly string[]).includes(v);

/** Node (stage) states, orchestration-model.md section 3.1. */
export const NODE_STATES = [
  'PENDING',
  'READY',
  'RUNNING',
  'AWAITING_WORK',
  'RETRY_WAIT',
  'AWAITING_APPROVAL',
  'SUSPENDED',
  'SUCCEEDED',
  'FAILED_PERMANENT',
  'FALLBACK_ACTIVE',
  'COMPENSATING',
  'COMPENSATED',
  'STALE',
  'SKIPPED',
  'CANCELLED',
] as const;
export type NodeState = (typeof NODE_STATES)[number];

export const SCENARIO_TAGS = ['SCN-A', 'SCN-B', 'SCN-C', 'TEST', 'NONE'] as const;
export type ScenarioTag = (typeof SCENARIO_TAGS)[number];

export const AGENT_MODES = ['LIVE_EXTERNAL', 'SCRIPTED', 'MIXED'] as const;
export type AgentMode = (typeof AGENT_MODES)[number];

export const RELEASE_OUTCOMES = ['READY', 'NOT_READY'] as const;
export type ReleaseOutcome = (typeof RELEASE_OUTCOMES)[number];

export const CLOCK_KINDS = ['WALL', 'SIMULATED'] as const;
export type ClockKind = (typeof CLOCK_KINDS)[number];

export const GATE_KEYS = ['G-AMB', 'G-ARCH', 'G-CODE', 'G-SEC', 'G-DESTR', 'G-EXC', 'G-RISK', 'G-REL', 'G-FINAL', 'G-CHG'] as const;
export type GateKey = (typeof GATE_KEYS)[number];

export const GATE_STATES = ['OPEN', 'APPROVED', 'REJECTED', 'ESCALATED', 'TIMED_OUT', 'SAFE_STOPPED', 'SUPERSEDED'] as const;
export type GateState = (typeof GATE_STATES)[number];

export const ARTIFACT_VERSION_STATUSES = ['DRAFT', 'SUBMITTED', 'REVIEWED', 'APPROVED', 'STALE', 'SUPERSEDED'] as const;
export type ArtifactVersionStatus = (typeof ARTIFACT_VERSION_STATUSES)[number];

export interface NodeStatus {
  node_key: string;
  state: NodeState;
  attempt_count: number;
  branch?: string;
  blocked_by?: string[];
  suspended_reason?: string;
  stale_reason?: string;
  skip_reason?: string;
}

export interface GateStatus {
  gate_id: string;
  gate_key: GateKey;
  state: GateState;
  deadline_at?: string | null;
  clock_kind?: ClockKind;
}

export interface ArtifactVersionSummary {
  version_id: string;
  kind: string;
  version_no: number;
  status: ArtifactVersionStatus;
  content_hash: string;
}

/** Read-only inspection view of a run (FR-102). Inspection never changes state. */
export interface WorkflowState {
  run_id: RunId;
  profile: string;
  scenario_tag: ScenarioTag;
  agent_mode: AgentMode;
  status: WorkflowRunStatus;
  release_outcome?: ReleaseOutcome | null;
  terminal_reason?: string | null;
  plan_version: number;
  policy_catalogue_version: PolicyVersion;
  parent_run_id?: RunId | null;
  created_at: string;
  terminal_at?: string | null;
  nodes: NodeStatus[];
  gates: GateStatus[];
  blocked_paths?: string[];
  pending_approvals?: string[];
  artifact_versions?: ArtifactVersionSummary[];
  decision_ids?: string[];
}

export const WORKFLOW_STATE_FIELDS = [
  'run_id',
  'profile',
  'scenario_tag',
  'agent_mode',
  'status',
  'release_outcome',
  'terminal_reason',
  'plan_version',
  'policy_catalogue_version',
  'parent_run_id',
  'created_at',
  'terminal_at',
  'nodes',
  'gates',
  'blocked_paths',
  'pending_approvals',
  'artifact_versions',
  'decision_ids',
] as const satisfies readonly (keyof WorkflowState)[];

/** One located violation found while checking a payload against the OpenAPI contract (ADR-009). */
export interface ContractViolation {
  /** JSON pointer to the offending value, for example `/status`. */
  path: string;
  message: string;
}

export interface ContractValidationResult {
  valid: boolean;
  errors: ContractViolation[];
}
