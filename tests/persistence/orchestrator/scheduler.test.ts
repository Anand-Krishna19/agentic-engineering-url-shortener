import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SimulatedClock } from '../../../src/kernel/clock/clock.js';
import { pgDatabase } from '../../../src/shortener/adapters/persistence/pg-database.js';
import type { AgentOutcome, AgentPort, AgentTask } from '../../../src/orchestrator/agents/port.js';
import { buildGraph, type NodeSpec } from '../../../src/orchestrator/engine/graph.js';
import { Scheduler } from '../../../src/orchestrator/engine/scheduler.js';
import { verifyAuditChain } from '../../../src/orchestrator/persistence/audit-chain.js';
import { RunStore } from '../../../src/orchestrator/persistence/run-store.js';
import { startPostgres, type TestPostgres } from '../../support/postgres.js';

// Implements: T023 (scheduler, parallel branches, join, conditional skip, branch suspension). Real PostgreSQL.
// Requirements: FR-105, FR-106, FR-113, FR-107 | ADRs: ADR-004, ADR-005, ADR-019 | Spec: orchestration-model.md section 2
const actor = { type: 'HUMAN' as const, id: 'approver-1' };
let server: TestPostgres;
let config: pg.ClientConfig;
let store: RunStore;
let n = 0;

beforeAll(async () => {
  server = await startPostgres(`orch-sched-${process.pid}`);
  config = { ...server.config, user: 'orchestrator_app', password: 'test-orchestrator-pw', database: 'orchestrator' };
  store = new RunStore(pgDatabase(config), new SimulatedClock('2026-01-01T00:00:00.000Z'));
}, 120_000);
afterAll(() => server?.stop());

/** sdlc/1 from N07: fan-out to tests and threat model, per-branch N08..N11, run-level N12 and the N15 join. */
function sdlc(branches: string[]): NodeSpec[] {
  const per = (b: string): NodeSpec[] => [
    { key: `N08_TEST_AUTHOR:${b}`, dependsOn: ['N07_DESIGN'] },
    { key: `N09_IMPLEMENT:${b}`, dependsOn: [`N08_TEST_AUTHOR:${b}`, 'N14_THREAT_MODEL'] },
    { key: `N10_DOCUMENT:${b}`, dependsOn: [`N09_IMPLEMENT:${b}`], skipIf: (c) => (c.noDocs ? 'no documentation change' : undefined) },
    { key: `N11_TEST_RUN:${b}`, dependsOn: [`N09_IMPLEMENT:${b}`] },
  ];
  return [
    { key: 'N07_DESIGN', dependsOn: [] },
    { key: 'N14_THREAT_MODEL', dependsOn: ['N07_DESIGN'] },
    ...branches.flatMap(per),
    { key: 'N12_SECURITY_VALIDATE', dependsOn: branches.map((b) => `N09_IMPLEMENT:${b}`) },
    {
      key: 'N15_VALIDATION_JOIN',
      dependsOn: [...branches.flatMap((b) => [`N10_DOCUMENT:${b}`, `N11_TEST_RUN:${b}`]), 'N12_SECURITY_VALIDATE'],
    },
  ];
}

/** Scripted agent: logs start and end of each node; a node can wait, suspend once, or wait for peers. */
class Script implements AgentPort {
  readonly log: string[] = [];
  readonly suspendOnce = new Set<string>();
  private readonly peers = new Map<string, { need: number; arrived: Promise<void>; hit: () => void; count: number }>();
  /** Nodes in `keys` all block until every one of them has started: only true parallelism gets past this. */
  rendezvous(keys: string[]): void {
    let hit!: () => void;
    const arrived = new Promise<void>((r) => (hit = r));
    const g = { need: keys.length, arrived, hit, count: 0 };
    keys.forEach((k) => this.peers.set(k, g));
  }
  async execute(t: AgentTask): Promise<AgentOutcome> {
    this.log.push(`start ${t.nodeKey}`);
    const g = this.peers.get(t.nodeKey);
    if (g) {
      if (++g.count === g.need) g.hit();
      await Promise.race([g.arrived, new Promise((_, rej) => setTimeout(() => rej(new Error('peers never started: not parallel')), 3000))]);
    }
    await new Promise((r) => setTimeout(r, 5));
    if (this.suspendOnce.delete(t.nodeKey)) {
      this.log.push(`suspend ${t.nodeKey}`);
      return { outcome: 'SUSPENDED', reason: 'material ambiguity' };
    }
    this.log.push(`end ${t.nodeKey}`);
    return { outcome: 'SUCCEEDED' };
  }
}

async function newRun(): Promise<string> {
  const runId = `sched-${++n}`;
  expect((await store.createRun({ runId, profile: 'sdlc/1', agentMode: 'SCRIPTED' }, actor)).ok).toBe(true);
  return runId;
}
const chain = async (runId: string) => {
  const c = new pg.Client(config);
  await c.connect();
  try { return await verifyAuditChain(c, runId); } finally { await c.end(); }
};

describe('[FR-106][ADR-019] parallel branches and the synchronizing join', () => {
  it('runs fan-out nodes concurrently and starts the join only after every dependency ends', async () => {
    const agent = new Script();
    agent.rendezvous(['N08_TEST_AUTHOR:a', 'N08_TEST_AUTHOR:b', 'N14_THREAT_MODEL']); // all three must overlap
    const runId = await newRun();
    const report = await new Scheduler(store, agent).run(runId, buildGraph(sdlc(['a', 'b'])));
    expect(report).toEqual({ status: 'COMPLETED', suspended: [], blocked: [] });

    const at = (e: string) => agent.log.indexOf(e);
    for (const dep of ['N10_DOCUMENT:a', 'N10_DOCUMENT:b', 'N11_TEST_RUN:a', 'N11_TEST_RUN:b', 'N12_SECURITY_VALIDATE']) {
      expect(at(`end ${dep}`)).toBeLessThan(at('start N15_VALIDATION_JOIN'));
    }
    expect(at('end N07_DESIGN')).toBeLessThan(at('start N14_THREAT_MODEL'));
    expect((await store.loadRun(runId))?.status).toBe('COMPLETED');
    expect(await chain(runId)).toMatchObject({ valid: true });
  });
});

describe('conditional edges', () => {
  it('skips a node with a recorded reason and still lets the join run', async () => {
    const agent = new Script();
    const runId = await newRun();
    const report = await new Scheduler(store, agent).run(runId, buildGraph(sdlc(['a'])), { noDocs: true });
    expect(report.status).toBe('COMPLETED');
    expect(agent.log).not.toContain('start N10_DOCUMENT:a');
    const c = new pg.Client(config);
    await c.connect();
    const r = await c.query("SELECT state, reason FROM workflow_nodes WHERE run_id=$1 AND node_key='N10_DOCUMENT:a'", [runId]);
    await c.end();
    expect(r.rows[0]).toEqual({ state: 'SKIPPED', reason: 'skipped: no documentation change' });
  });
});

describe('[FR-113] suspend only the affected path, then resume from persisted state', () => {
  it('holds one branch and its dependents while independent work continues, then completes after a recorded decision', async () => {
    const agent = new Script();
    agent.suspendOnce.add('N08_TEST_AUTHOR:b');
    const runId = await newRun();
    const graph = buildGraph(sdlc(['a', 'b']));

    const first = await new Scheduler(store, agent).run(runId, graph);
    expect(first.status).toBe('RUNNING');
    expect(first.suspended).toEqual(['N08_TEST_AUTHOR:b']);
    expect(first.blocked).toEqual(expect.arrayContaining(['N09_IMPLEMENT:b', 'N12_SECURITY_VALIDATE', 'N15_VALIDATION_JOIN']));
    expect(agent.log).toContain('end N11_TEST_RUN:a'); // the unaffected branch finished
    expect(agent.log).not.toContain('start N15_VALIDATION_JOIN');

    // New store and scheduler instances: nothing is carried over in memory.
    const store2 = new RunStore(pgDatabase(config), new SimulatedClock('2026-01-01T01:00:00.000Z'));
    const sched2 = new Scheduler(store2, agent);
    await sched2.resume(runId, 'N08_TEST_AUTHOR:b', actor, 'clarification answered');
    const second = await sched2.run(runId, graph);
    expect(second).toEqual({ status: 'COMPLETED', suspended: [], blocked: [] });
    expect(agent.log.filter((e) => e === 'start N08_TEST_AUTHOR:a')).toHaveLength(1); // finished work is not redone
    expect(await chain(runId)).toMatchObject({ valid: true });
  });

  it('never drives a safe-stopped run (DEC-050)', async () => {
    const agent = new Script();
    const runId = await newRun();
    await store.transitionRun(runId, 'RUNNING', actor, 'start');
    await store.transitionRun(runId, 'SAFE_STOPPED', actor, 'stop');
    const report = await new Scheduler(store, agent).run(runId, buildGraph(sdlc(['a'])));
    expect(report.status).toBe('SAFE_STOPPED');
    expect(agent.log).toEqual([]);
  });
});
