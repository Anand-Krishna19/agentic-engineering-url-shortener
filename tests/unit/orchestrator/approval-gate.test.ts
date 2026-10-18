import { describe, it, expect, beforeEach } from 'vitest';
import { OrchestrationStateMachine } from '../../../src/orchestrator/engine/state-machine.js';
import { ApprovalGate } from '../../../src/orchestrator/gates/approval-gate.js';

// CRITICAL: Set the environment variable for tests BEFORE importing or using the gate
process.env.APPROVER_CREDENTIAL = 'test-credential';

describe('ApprovalGate (FR-114, FR-115, FR-116, ADR-007, DEC-058)', () => {
    let sm: OrchestrationStateMachine;
    let gate: ApprovalGate;

    beforeEach(() => {
        sm = new OrchestrationStateMachine();
        gate = new ApprovalGate();
        sm.createRun('run-1', 'policy-v1.0');
        sm.transition('run-1', 'RUNNING', 'system', 'start');
    });

    it('blocks progression by transitioning to AWAITING_APPROVAL', () => {
        const result = gate.requestApproval(sm, 'run-1', 'gate-1', 'agent', 'Architecture review needed');
        expect(result.success).toBe(true);
        expect(result.run.status).toBe('AWAITING_APPROVAL');
    });

    it('resumes on valid approval with correct credential', () => {
        gate.requestApproval(sm, 'run-1', 'gate-1', 'agent', 'Need approval');
        const result = gate.processDecision(sm, 'gate-1', {
            approver: 'human-reviewer',
            credential: 'test-credential', // MUST MATCH process.env.APPROVER_CREDENTIAL
            decision: 'APPROVED',
            reason: 'Looks good',
            timestamp: new Date().toISOString(),
        });
        expect(result.success).toBe(true);
        expect(result.run.status).toBe('RUNNING');
    });

    it('rejects approval with invalid credential (DEC-058)', () => {
        gate.requestApproval(sm, 'run-1', 'gate-1', 'agent', 'Need approval');
        const result = gate.processDecision(sm, 'gate-1', {
            approver: 'attacker',
            credential: 'wrong-credential', // DOES NOT MATCH
            decision: 'APPROVED',
            reason: 'Trying to bypass',
            timestamp: new Date().toISOString(),
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid approver credential');
    });

    it('safe-stops on rejection', () => {
        gate.requestApproval(sm, 'run-1', 'gate-1', 'agent', 'Need approval');
        const result = gate.processDecision(sm, 'gate-1', {
            approver: 'human-reviewer',
            credential: 'test-credential', // MUST MATCH process.env.APPROVER_CREDENTIAL
            decision: 'REJECTED',
            reason: 'Not safe to proceed',
            timestamp: new Date().toISOString(),
        });
        expect(result.success).toBe(true);
        expect(result.run.status).toBe('SAFE_STOPPED');
    });

    it('does not infer approval from silence', () => {
        gate.requestApproval(sm, 'run-1', 'gate-1', 'agent', 'Need approval');
        const pending = gate.getPendingApprovals();
        expect(pending).toHaveLength(1);
        expect(pending[0]!.status).toBe('PENDING');
        const run = sm.getRun('run-1')!;
        expect(run.status).toBe('AWAITING_APPROVAL');
    });
});