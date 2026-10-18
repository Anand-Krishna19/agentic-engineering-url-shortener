import { OrchestrationStateMachine } from '../src/orchestrator/engine/state-machine.js';
import { ApprovalGate } from '../src/orchestrator/gates/approval-gate.js';
import { SimulatedClock } from '../src/kernel/clock/clock.js';
import * as fs from 'fs';
import * as path from 'path';

process.env.APPROVER_CREDENTIAL = 'test-credential';

async function main() {
    const clock = new SimulatedClock('2026-10-18T10:00:00.000Z');
    const sm = new OrchestrationStateMachine(clock);
    const gate = new ApprovalGate(clock);
    const runId = 'scn-a-greenfield-001';

    // 1. Ingest
    sm.createRun(runId, 'v1.14', { requirement: 'Add /healthz endpoint' });
    sm.transition(runId, 'RUNNING', 'orchestrator', 'Decomposition complete');
    clock.advance(5000);

    // 2. Gate
    gate.requestApproval(runId, 'G-ARCH', 'orchestrator', 'Architecture review');
    clock.advance(10000);

    // 3. Approve
    gate.processDecision(sm, 'G-ARCH', {
        approver: 'human-candidate',
        credential: 'test-credential',
        decision: 'APPROVED',
        reason: 'Aligns with ADR-002',
        timestamp: clock.now().toISOString(),
    });
    clock.advance(15000);

    // 4. Complete
    sm.transition(runId, 'COMPLETED', 'orchestrator', 'All tests passed');

    // 5. Dump Evidence
    const evidenceDir = path.join(process.cwd(), 'evidence', 'scn-a-greenfield');
    fs.mkdirSync(evidenceDir, { recursive: true });

    const run = sm.getRun(runId)!;
    fs.writeFileSync(
        path.join(evidenceDir, 'run_state.json'),
        JSON.stringify({ runId, status: run.status, context: run.context }, null, 2)
    );
    fs.writeFileSync(
        path.join(evidenceDir, 'decision_lineage.json'),
        JSON.stringify(run.decisionLineage, null, 2)
    );
    fs.writeFileSync(
        path.join(evidenceDir, 'approval_record.json'),
        JSON.stringify(gate.getDecision('G-ARCH'), null, 2)
    );

    console.log('✅ SCN-A Evidence bundle generated in ./evidence/scn-a-greenfield/');
}

main().catch(console.error);