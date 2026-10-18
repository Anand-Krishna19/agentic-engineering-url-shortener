/**
 * Graph scheduler: runs every ready node concurrently and synchronizes joins through dependencies.
 *
 * Implements: T023 (scheduler, parallel branches, join, conditional skip, branch suspension).
 * State is read from and written to the RunStore only, so calling `run` again continues a run from
 * persisted state (resume). Failure classification, retry and compensation are T018 and are not here:
 * an agent error suspends the node with a recorded reason rather than being retried.
 * Requirements: FR-105, FR-106, FR-113 (suspend only the affected path), FR-107, FR-108
 * ADRs:         ADR-004, ADR-005, ADR-018, ADR-019
 * DECs:         DEC-050 (a safe-stopped run is never driven again)
 */
import type { AgentPort } from '../agents/port.js';
import type { Actor, RunStore } from '../persistence/run-store.js';
import type { NodeState, WorkflowRunStatus } from '../../types/orchestration.js';
import { branchOf, readyNodes, type Graph, type NodeSpec } from './graph.js';

export interface RunReport {
  readonly status: WorkflowRunStatus;
  readonly suspended: string[];
  /** Nodes still PENDING because a dependency has not completed. */
  readonly blocked: string[];
}

const ENGINE: Actor = { type: 'SYSTEM', id: 'scheduler' };

export class Scheduler {
  constructor(private readonly store: RunStore, private readonly agent: AgentPort) {}

  async run(runId: string, graph: Graph, ctx: Readonly<Record<string, unknown>> = {}): Promise<RunReport> {
    let run = await this.store.loadRun(runId);
    if (!run) throw new Error(`Run ${runId} not found`);
    if (run.status === 'CREATED') this.must(await this.store.transitionRun(runId, 'RUNNING', ENGINE, 'scheduler start'));
    else if (run.status !== 'RUNNING') return this.report(run.status, new Map(run.nodes.map((n) => [n.node_key, n.state])));

    const known = new Set(run.nodes.map((n) => n.node_key));
    for (const n of graph.nodes) {
      if (!known.has(n.key)) {
        this.must(await this.store.setNodeState(runId, n.key, 'PENDING', ENGINE, 'registered', { branch: branchOf(n.key), blockedBy: [...n.dependsOn] }));
      }
    }

    for (;;) {
      run = (await this.store.loadRun(runId))!;
      const states = new Map(run.nodes.map((n) => [n.node_key, n.state] as const));
      const ready = readyNodes(graph, states);
      if (ready.length === 0) {
        const all = graph.nodes.every((n) => states.get(n.key) === 'SUCCEEDED' || states.get(n.key) === 'SKIPPED');
        if (all) this.must(await this.store.transitionRun(runId, 'COMPLETED', ENGINE, 'all nodes finished'));
        return this.report(all ? 'COMPLETED' : 'RUNNING', states);
      }
      await Promise.all(ready.map((n) => this.execute(runId, n, states.get(n.key)!, ctx)));
    }
  }

  /** A suspended node resumes only through a recorded decision by a named actor. */
  async resume(runId: string, nodeKey: string, actor: Actor, reason: string): Promise<void> {
    this.must(await this.store.setNodeState(runId, nodeKey, 'READY', actor, reason));
  }

  private async execute(runId: string, node: NodeSpec, state: NodeState, ctx: Readonly<Record<string, unknown>>): Promise<void> {
    if (state === 'PENDING') {
      const skip = node.skipIf?.(ctx);
      if (skip !== undefined) {
        this.must(await this.store.setNodeState(runId, node.key, 'SKIPPED', ENGINE, `skipped: ${skip}`));
        return;
      }
      this.must(await this.store.setNodeState(runId, node.key, 'READY', ENGINE, 'dependencies satisfied'));
    }
    this.must(await this.store.setNodeState(runId, node.key, 'RUNNING', ENGINE, 'attempt started', { countAttempt: true }));
    let outcome;
    try {
      outcome = await this.agent.execute({ runId, nodeKey: node.key, branch: branchOf(node.key) }, ctx);
    } catch (e) {
      outcome = { outcome: 'SUSPENDED' as const, reason: `agent error: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (outcome.outcome === 'SUCCEEDED') {
      this.must(await this.store.setNodeState(runId, node.key, 'SUCCEEDED', ENGINE, 'exit criteria met'));
    } else {
      this.must(await this.store.setNodeState(runId, node.key, 'SUSPENDED', ENGINE, outcome.reason));
    }
  }

  private report(status: WorkflowRunStatus, states: ReadonlyMap<string, NodeState>): RunReport {
    const keys = (s: NodeState) => [...states].filter(([, v]) => v === s).map(([k]) => k);
    return { status, suspended: keys('SUSPENDED'), blocked: keys('PENDING') };
  }

  private must<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
    if (!r.ok) throw new Error(r.error);
    return r.value;
  }
}
