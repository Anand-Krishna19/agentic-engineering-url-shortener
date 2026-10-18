import { describe, it, expect, beforeEach } from 'vitest';
import { OrchestrationStateMachine } from '../../../src/orchestrator/engine/state-machine.js';
import { ApprovalGate } from '../../../src/orchestrator/gates/approval-gate.js';
import { SimulatedClock } from '../../../src/kernel/clock/clock.js';

/**
 * Scenario A: Greenfield Demonstration
 *
 * Objective: Demonstrate a new capability moving through the orchestration system
 * without an artificial clarification gate, proving sequential execution, human
 * approval enforcement, and decision lineage.
 *
 * Refs: Section 24 (Well-Defined Greenfield Requirement Scenario), FR-101, FR-104, FR-114
 */
describe('Scenario A: Greenfield Workflow Execution', () => {
    let clock: SimulatedClock;
    let stateMachine: OrchestrationStateMachine;
    let approvalGate: ApprovalGate;
    const runId = 'greenfield-run-001';
    const policyVersion = 'policy-v1.0';

    beforeEach(() => {
        // Use SimulatedClock for deterministic, auditable timestamps
        clock = new SimulatedClock('2026-10-18T10:00:00.000Z');
        stateMachine = new OrchestrationStateMachine(clock);
        approvalGate = new ApprovalGate(clock);
    });

    it('executes a well-defined requirement end-to-end with enforced human approval', () => {
        // 1. Requirement ingestion & decomposition (CREATED -> RUNNING)
        stateMachine.createRun(runId, policyVersion, {
            requirement: 'Add /healthz endpoint',
            ambiguityCheck: 'PASS',
        });

        let result = stateMachine.transition(runId, 'RUNNING', 'orchestrator', 'Decomposition complete, no ambiguity detected');
        expect(result.success).toBe(true);
        expect(result.run.status).toBe('RUNNING');

        // Advance time for audit realism
        clock.advance(5000);

        // 2. Implementation requires human approval (RUNNING -> AWAITING_APPROVAL)
        result = approvalGate.requestApproval(
            stateMachine,
            runId,
            'arch-review-gate-01',
            'orchestrator',
            'Architecture review required before merging'
        );
        expect(result.success).toBe(true);
        expect(result.run.status).toBe('AWAITING_APPROVAL');

        // 3. Verify workflow is strictly blocked (No inferred approval from silence)
        const runWhilePending = stateMachine.getRun(runId)!;
        expect(runWhilePending.status).toBe('AWAITING_APPROVAL');
        expect(approvalGate.getPendingApprovals()).toHaveLength(1);

        // Advance time
        clock.advance(10000);

        // 4. Human provides explicit, credential-verified approval (AWAITING_APPROVAL -> RUNNING)
        result = approvalGate.processDecision(stateMachine, 'arch-review-gate-01', {
            approver: 'senior-engineer',
            credential: 'test-approver-credential',
            decision: 'APPROVED',
            reason: 'Architecture aligns with ADR-002',
            timestamp: clock.now().toISOString(),
        });
        expect(result.success).toBe(true);
        expect(result.run.status).toBe('RUNNING');
        expect(approvalGate.getPendingApprovals()).toHaveLength(0); // Gate cleared

        // Advance time
        clock.advance(15000);

        // 5. Implementation and testing complete (RUNNING -> COMPLETED)
        result = stateMachine.transition(runId, 'COMPLETED', 'orchestrator', 'All tests passed, contract validated');
        expect(result.success).toBe(true);
        expect(result.run.status).toBe('COMPLETED');

        // 6. Verify Decision Lineage (Audit Evidence)
        // 6. Verify Decision Lineage (Audit Evidence)
        const finalRun = stateMachine.getRun(runId)!;
        expect(finalRun.decisionLineage).toHaveLength(4);

        // Check first transition: CREATED -> RUNNING
        expect(finalRun.decisionLineage[0]!.fromState).toBe('CREATED');
        expect(finalRun.decisionLineage[0]!.toState).toBe('RUNNING');
        expect(finalRun.decisionLineage[0]!.actor).toBe('orchestrator');

        // Check second transition: RUNNING -> AWAITING_APPROVAL
        expect(finalRun.decisionLineage[1]!.fromState).toBe('RUNNING');
        expect(finalRun.decisionLineage[1]!.toState).toBe('AWAITING_APPROVAL');
        expect(finalRun.decisionLineage[1]!.reason).toContain('Architecture review required');

        // Check third transition: AWAITING_APPROVAL -> RUNNING (via approval)
        expect(finalRun.decisionLineage[2]!.fromState).toBe('AWAITING_APPROVAL');
        expect(finalRun.decisionLineage[2]!.toState).toBe('RUNNING');
        expect(finalRun.decisionLineage[2]!.actor).toBe('senior-engineer');
        expect(finalRun.decisionLineage[2]!.reason).toBe('Approved: Architecture aligns with ADR-002');

        // Check fourth transition: RUNNING -> COMPLETED
        expect(finalRun.decisionLineage[3]!.fromState).toBe('RUNNING');
        expect(finalRun.decisionLineage[3]!.toState).toBe('COMPLETED');
        expect(finalRun.decisionLineage[3]!.actor).toBe('orchestrator');
    });

    it('safely rejects unauthorized approval attempts (Security Gate)', () => {
        stateMachine.createRun(runId, policyVersion, {});
        stateMachine.transition(runId, 'RUNNING', 'orchestrator', 'start');
        approvalGate.requestApproval(stateMachine, runId, 'security-gate', 'orchestrator', 'Check');

        // Attacker tries to approve with wrong credential
        const result = approvalGate.processDecision(stateMachine, 'security-gate', {
            approver: 'attacker',
            credential: 'WRONG_CREDENTIAL',
            decision: 'APPROVED',
            reason: 'Trying to bypass',
            timestamp: clock.now().toISOString(),
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid approver credential');

        // Workflow remains blocked
        expect(stateMachine.getRun(runId)!.status).toBe('AWAITING_APPROVAL');
    });

    // Set test credential before scenario runs
    process.env.APPROVER_CREDENTIAL = 'test-approver-credential';
});