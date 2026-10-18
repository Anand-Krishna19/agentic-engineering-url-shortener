/**
 * PostgreSQL-backed workflow run and node store. Every state change and its audit event commit in one
 * transaction; a run resumes from persisted state alone.
 *
 * Implements: T016.
 * Requirements: FR-107, FR-130, FR-121, FR-105, FR-120
 * ADRs:         ADR-018 (workflow state persistence), ADR-006 (immutable audit)
 * DECs:         DEC-050 (SAFE_STOPPED is permanent), DEC-095
 */
import type { Clock } from '../../kernel/clock/clock.js';
import type { Db } from '../../shortener/adapters/persistence/pg-database.js';
import { withTransaction } from '../../shortener/adapters/persistence/pg-database.js';
import type { Queryable } from '../../shortener/adapters/persistence/short-link-repository.js';
import type { ActorType, AuditAction } from '../../types/audit.js';
import type { AgentMode, NodeState, NodeStatus, ScenarioTag, WorkflowRunStatus } from '../../types/orchestration.js';
import { isTerminalWorkflowState, isValidNodeTransition, isValidWorkflowTransition } from '../engine/transitions.js';
import { appendAuditEvent } from './audit-chain.js';

export interface Actor {
  readonly type: ActorType;
  readonly id?: string;
}

export interface PersistedRun {
  readonly runId: string;
  readonly profile: string;
  readonly scenarioTag: ScenarioTag;
  readonly agentMode: AgentMode;
  readonly status: WorkflowRunStatus;
  readonly policyVersion?: string;
  readonly currentPlanVersion?: number;
  readonly terminalReason?: string;
  readonly createdAt: string;
  readonly nodes: NodeStatus[];
}

export interface NewRun {
  runId: string;
  profile: string;
  agentMode: AgentMode;
  scenarioTag?: ScenarioTag;
  policyVersion?: string;
}

export type StoreResult<T> = { ok: true; value: T } | { ok: false; error: string };

export class RunStore {
  constructor(private readonly db: Db, private readonly clock: Clock) {}

  async createRun(input: NewRun, actor: Actor): Promise<StoreResult<PersistedRun>> {
    return this.db.withConnection((conn) =>
      withTransaction(conn, async () => {
        const dup = await conn.query('SELECT 1 FROM workflow_runs WHERE run_id = $1', [input.runId]);
        if (dup.rows.length > 0) return { ok: false as const, error: `Workflow run ${input.runId} already exists` };
        await conn.query(
          `INSERT INTO workflow_runs (run_id, profile, scenario_tag, agent_mode, status, policy_catalogue_version, created_at, clock_kind)
           VALUES ($1, $2, $3, $4, 'CREATED', $5, $6, $7)`,
          [input.runId, input.profile, input.scenarioTag ?? 'NONE', input.agentMode, input.policyVersion ?? null,
            this.clock.now().toISOString(), this.clock.kind],
        );
        await this.audit(conn, input.runId, actor, 'RUN_CREATED', 'RUN', input.runId, 'SUCCESS', 'run created', {
          to: 'CREATED', policyVersion: input.policyVersion,
        });
        return { ok: true as const, value: (await this.load(conn, input.runId))! };
      }),
    );
  }

  /** Moves a run along the approved table. Unknown ids and illegal moves (including out of SAFE_STOPPED) change nothing. */
  async transitionRun(runId: string, to: WorkflowRunStatus, actor: Actor, reason: string): Promise<StoreResult<PersistedRun>> {
    return this.db.withConnection((conn) =>
      withTransaction(conn, async () => {
        const cur = await conn.query('SELECT status FROM workflow_runs WHERE run_id = $1 FOR UPDATE', [runId]);
        if (cur.rows.length === 0) return { ok: false as const, error: `Run ${runId} not found` };
        const from = String(cur.rows[0]!.status);
        if (!isValidWorkflowTransition(from, to)) {
          await this.audit(conn, runId, actor, 'NODE_STATE_CHANGED', 'RUN', runId, 'REJECTED', `invalid transition ${from} -> ${to}`, { from, to });
          return { ok: false as const, error: `Invalid transition: ${from} → ${to}` };
        }
        const now = this.clock.now().toISOString();
        await conn.query(
          `UPDATE workflow_runs SET status = $2,
             terminal_at = CASE WHEN $3 THEN $4::timestamptz ELSE terminal_at END,
             terminal_reason = CASE WHEN $3 THEN $5 ELSE terminal_reason END
           WHERE run_id = $1`,
          [runId, to, isTerminalWorkflowState(to), now, reason],
        );
        const action: AuditAction = to === 'SAFE_STOPPED' ? 'SAFE_STOP_ENTERED' : to === 'RUNNING' ? 'NODE_STATE_CHANGED' : 'RUN_TERMINATED';
        await this.audit(conn, runId, actor, action, 'RUN', runId, 'SUCCESS', reason, undefined, from, to);
        return { ok: true as const, value: (await this.load(conn, runId))! };
      }),
    );
  }

  /** Registers a node (default PENDING) or moves it along NODE_TRANSITIONS. */
  async setNodeState(
    runId: string, nodeKey: string, to: NodeState, actor: Actor, reason: string,
    opts: { branch?: string; blockedBy?: string[]; countAttempt?: boolean } = {},
  ): Promise<StoreResult<NodeStatus>> {
    return this.db.withConnection((conn) =>
      withTransaction(conn, async () => {
        const run = await conn.query('SELECT status FROM workflow_runs WHERE run_id = $1 FOR UPDATE', [runId]);
        if (run.rows.length === 0) return { ok: false as const, error: `Run ${runId} not found` };
        const cur = await conn.query('SELECT state FROM workflow_nodes WHERE run_id = $1 AND node_key = $2', [runId, nodeKey]);
        const now = this.clock.now().toISOString();
        let from: string | undefined;
        if (cur.rows.length === 0) {
          if (to !== 'PENDING') return { ok: false as const, error: `Node ${nodeKey} must be registered as PENDING` };
          await conn.query(
            'INSERT INTO workflow_nodes (run_id, node_key, state, branch, blocked_by, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
            [runId, nodeKey, to, opts.branch ?? null, JSON.stringify(opts.blockedBy ?? []), now],
          );
        } else {
          from = String(cur.rows[0]!.state);
          if (!isValidNodeTransition(from, to)) {
            await this.audit(conn, runId, actor, 'NODE_STATE_CHANGED', 'NODE', nodeKey, 'REJECTED', `invalid node transition ${from} -> ${to}`, { from, to }, from, to);
            return { ok: false as const, error: `Invalid node transition: ${from} → ${to}` };
          }
          await conn.query(
            `UPDATE workflow_nodes SET state = $3, reason = $4, updated_at = $5,
               attempt_count = attempt_count + $6 WHERE run_id = $1 AND node_key = $2`,
            [runId, nodeKey, to, reason, now, opts.countAttempt ? 1 : 0],
          );
        }
        await this.audit(conn, runId, actor, 'NODE_STATE_CHANGED', 'NODE', nodeKey, 'SUCCESS', reason, undefined, from, to);
        const run2 = (await this.load(conn, runId))!;
        return { ok: true as const, value: run2.nodes.find((n) => n.node_key === nodeKey)! };
      }),
    );
  }

  /** Resume: rebuilds a run purely from the database. */
  async loadRun(runId: string): Promise<PersistedRun | undefined> {
    return this.db.withConnection((conn) => this.load(conn, runId));
  }

  private async audit(
    conn: Queryable, runId: string, actor: Actor, action: AuditAction, subjectType: 'RUN' | 'NODE',
    subjectId: string, result: 'SUCCESS' | 'REJECTED', reason: string, data?: Record<string, unknown>,
    from?: string, to?: string,
  ): Promise<void> {
    await appendAuditEvent(conn, {
      run_id: runId,
      occurred_at: this.clock.now().toISOString(),
      clock_kind: this.clock.kind,
      actor_type: actor.type,
      actor_id: actor.id,
      action,
      subject_type: subjectType,
      subject_id: subjectId,
      from_state: from,
      to_state: to,
      result,
      reason,
      correlation_id: runId,
      data,
    });
  }

  private async load(conn: Queryable, runId: string): Promise<PersistedRun | undefined> {
    const r = await conn.query('SELECT * FROM workflow_runs WHERE run_id = $1', [runId]);
    if (r.rows.length === 0) return undefined;
    const row = r.rows[0]!;
    const n = await conn.query('SELECT * FROM workflow_nodes WHERE run_id = $1 ORDER BY node_key', [runId]);
    const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
    return {
      runId,
      profile: String(row.profile),
      scenarioTag: row.scenario_tag as ScenarioTag,
      agentMode: row.agent_mode as AgentMode,
      status: row.status as WorkflowRunStatus,
      policyVersion: row.policy_catalogue_version === null ? undefined : String(row.policy_catalogue_version),
      currentPlanVersion: row.current_plan_version === null ? undefined : Number(row.current_plan_version),
      terminalReason: row.terminal_reason === null ? undefined : String(row.terminal_reason),
      createdAt: iso(row.created_at),
      nodes: n.rows.map((x) => ({
        node_key: String(x.node_key),
        state: x.state as NodeState,
        attempt_count: Number(x.attempt_count),
        branch: x.branch === null ? undefined : String(x.branch),
        blocked_by: x.blocked_by as string[],
      })),
    };
  }
}
