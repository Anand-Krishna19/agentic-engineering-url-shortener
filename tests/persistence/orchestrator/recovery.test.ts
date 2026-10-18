import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SimulatedClock } from '../../../src/kernel/clock/clock.js';
import { pgDatabase } from '../../../src/shortener/adapters/persistence/pg-database.js';
import type { AgentOutcome, AgentPort, AgentTask } from '../../../src/orchestrator/agents/port.js';
import { buildGraph } from '../../../src/orchestrator/engine/graph.js';
import { Scheduler } from '../../../src/orchestrator/engine/scheduler.js';
import { verifyAuditChain } from '../../../src/orchestrator/persistence/audit-chain.js';
import { RunStore } from '../../../src/orchestrator/persistence/run-store.js';
import { CompensationLedger } from '../../../src/orchestrator/reliability/compensation-ledger.js';
import { startPostgres, type TestPostgres } from '../../support/postgres.js';

// Implements: T018 (compensation effects ledger), T018/T023 resume after crash. Real PostgreSQL.
// Requirements: FR-107, FR-119, FR-120 | ADRs: ADR-018, ADR-021
const actor = { type: 'SYSTEM' as const, id: 'engine' };
let server: TestPostgres;
let config: pg.ClientConfig;
const freshStore = () => new RunStore(pgDatabase(config), new SimulatedClock('2026-01-01T00:00:00.000Z'));

beforeAll(async () => {
  server = await startPostgres(`orch-recovery-${process.pid}`);
  config = { ...server.config, user: 'orchestrator_app', password: 'test-orchestrator-pw', database: 'orchestrator' };
}, 120_000);
afterAll(() => server?.stop());

class Log implements AgentPort {
  readonly ran: string[] = [];
  constructor(private readonly dieAt?: string) {}
  async execute(t: AgentTask): Promise<AgentOutcome> {
    this.ran.push(t.nodeKey);
    return t.nodeKey === this.dieAt ? { outcome: 'SUSPENDED', reason: 'process lost' } : { outcome: 'SUCCEEDED' };
  }
}
const chain = async (runId: string) => {
  const c = new pg.Client(config);
  await c.connect();
  try { return await verifyAuditChain(c, runId); } finally { await c.end(); }
};

describe('[FR-107][ADR-018] resume after a simulated crash', () => {
  it('a new process continues from the database without re-running finished nodes', async () => {
    await freshStore().createRun({ runId: 'crash-1', profile: 'sdlc/1', agentMode: 'SCRIPTED' }, actor);
    const nodes = [{ key: 'N07_DESIGN', dependsOn: [] }, { key: 'N14_THREAT_MODEL', dependsOn: ['N07_DESIGN'] }, { key: 'N12_SECURITY_VALIDATE', dependsOn: ['N14_THREAT_MODEL'] }];

    const before = new Log('N14_THREAT_MODEL'); // process stops mid-run after the first node
    const stalled = await new Scheduler(freshStore(), before).run('crash-1', buildGraph(nodes));
    expect(stalled.status).toBe('RUNNING');
    expect(before.ran).toEqual(['N07_DESIGN', 'N14_THREAT_MODEL']);

    const after = new Log(); // new store, new scheduler, no shared memory
    const next = new Scheduler(freshStore(), after);
    await next.resume('crash-1', 'N14_THREAT_MODEL', { type: 'HUMAN', id: 'op-1' }, 'restarted');
    const report = await next.run('crash-1', buildGraph(nodes));
    expect(after.ran).toEqual(['N14_THREAT_MODEL', 'N12_SECURITY_VALIDATE']);
    expect(report.status).toBe('COMPLETED');
    expect(await chain('crash-1')).toMatchObject({ valid: true });
  });
});

describe('[FR-119][ADR-021] compensation effects ledger', () => {
  it('keeps outstanding effects across a crash and compensates them newest first, once', async () => {
    await freshStore().createRun({ runId: 'comp-1', profile: 'sdlc/1', agentMode: 'SCRIPTED' }, actor);
    const ledger = new CompensationLedger(freshStore());
    await ledger.recordEffect('comp-1', { effectId: 'e1', nodeKey: 'N09', description: 'wrote file' });
    await ledger.recordEffect('comp-1', { effectId: 'e2', nodeKey: 'N10', description: 'opened PR' });

    const resumed = new CompensationLedger(freshStore()); // after crash
    const undone: string[] = [];
    expect((await resumed.outstanding('comp-1')).map((e) => e.effectId)).toEqual(['e2', 'e1']);
    expect(await resumed.compensate('comp-1', async (e) => { undone.push(e.effectId); })).toEqual(['e2', 'e1']);
    expect(undone).toEqual(['e2', 'e1']);
    expect(await resumed.outstanding('comp-1')).toEqual([]);
    expect(await resumed.compensate('comp-1', async () => { throw new Error('must not run again'); })).toEqual([]);
    expect(await chain('comp-1')).toMatchObject({ valid: true });
  });
});
