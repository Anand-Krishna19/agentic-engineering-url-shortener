import { describe, it, expect, beforeEach } from 'vitest';
import { OrchestrationStateMachine } from '../../../src/orchestrator/engine/state-machine.js';
import { ApprovalGate } from '../../../src/orchestrator/gates/approval-gate.js';
import { SimulatedClock } from '../../../src/kernel/clock/clock.js';

// Set test credential before scenario runs
process.env.APPROVER_CREDENTIAL = 'test-credential';

/**
 * Prototype Validation: In-Memory State Machine Transitions
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
        clock = new SimulatedClock('2026-10-18T10:00:00.000Z');
        stateMachine = new OrchestrationStateMachine(clock);
        approvalGate = new ApprovalGate(clock);
    });

    it('executes a well-defined requirement end-to-end with enforced human approval', () => {
        // 1. Requirement ingestion & decomposition (CREATED → RUNNING)
        stateMachine.createRun(runId, policyVersion, {
            requirement: 'Add /healthz endpoint',
            ambiguityCheck: 'PASS',
        });

        let result = stateMachine.transition(runId, 'RUNNING', 'orchestrator', 'Decomposition complete, no ambiguity detected');
        expect(result.success).toBe(true);
        expect(result.run!.status).toBe('RUNNING');

        clock.advance(5000);

        // 2. Request human approval (tracked separately, workflow remains RUNNING)
        const approvalRequest = approvalGate.requestApproval(
            runId,
            'arch-review-gate-01',
            'orchestrator',
            'Architecture review required before merging'
        );
        expect(approvalRequest.status).toBe('PENDING');
        expect(approvalGate.getPendingApprovals()).toHaveLength(1);

        // Workflow remains RUNNING (not corrupted to AWAITING_APPROVAL)
        expect(stateMachine.getRun(runId)!.status).toBe('RUNNING');

        clock.advance(10000);

        // 3. Human provides explicit, credential-verified approval
        result = approvalGate.processDecision(stateMachine, 'arch-review-gate-01', {
            approver: 'senior-engineer',
            credential: 'test-credential',
            decision: 'APPROVED',
            reason: 'Architecture aligns with ADR-002',
            timestamp: clock.now().toISOString(),
        });
        expect(result.success).toBe(true);
        expect(approvalGate.isApproved('arch-review-gate-01')).toBe(true);
        expect(approvalGate.getPendingApprovals()).toHaveLength(0);

        clock.advance(15000);

        // 4. Implementation and testing complete (RUNNING → COMPLETED)
        result = stateMachine.transition(runId, 'COMPLETED', 'orchestrator', 'All tests passed, contract validated');
        expect(result.success).toBe(true);
        expect(result.run!.status).toBe('COMPLETED');

        // 5. Verify Decision Lineage (Audit Evidence)
        const finalRun = stateMachine.getRun(runId)!;
        expect(finalRun.decisionLineage).toHaveLength(2); // CREATED→RUNNING, RUNNING→COMPLETED

        // Check first transition: CREATED → RUNNING
        expect(finalRun.decisionLineage[0]!.fromState).toBe('CREATED');
        expect(finalRun.decisionLineage[0]!.toState).toBe('RUNNING');
        expect(finalRun.decisionLineage[0]!.actor).toBe('orchestrator');

        // Check second transition: RUNNING → COMPLETED
        expect(finalRun.decisionLineage[1]!.fromState).toBe('RUNNING');
        expect(finalRun.decisionLineage[1]!.toState).toBe('COMPLETED');
        expect(finalRun.decisionLineage[1]!.actor).toBe('orchestrator');

        // 6. Verify approval decision is recorded separately
        const approvalDecision = approvalGate.getDecision('arch-review-gate-01');
        expect(approvalDecision).toBeDefined();
        expect(approvalDecision!.approver).toBe('senior-engineer');
        expect(approvalDecision!.decision).toBe('APPROVED');
    });

    it('safely rejects unauthorized approval attempts (Security Gate)', () => {
        stateMachine.createRun(runId, policyVersion, {});
        stateMachine.transition(runId, 'RUNNING', 'orchestrator', 'start');
        approvalGate.requestApproval(runId, 'security-gate', 'orchestrator', 'Check');

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

        // Approval is not granted
        expect(approvalGate.isApproved('security-gate')).toBe(false);
    });

    it('safe-stops workflow when approval is rejected', () => {
        stateMachine.createRun(runId, policyVersion, {});
        stateMachine.transition(runId, 'RUNNING', 'orchestrator', 'start');
        approvalGate.requestApproval(runId, 'safety-gate', 'orchestrator', 'Safety check');

        const result = approvalGate.processDecision(stateMachine, 'safety-gate', {
            approver: 'safety-officer',
            credential: 'test-credential',
            decision: 'REJECTED',
            reason: 'Unsafe condition detected',
            timestamp: clock.now().toISOString(),
        });

        expect(result.success).toBe(true);
        expect(result.run!.status).toBe('SAFE_STOPPED');
    });
});