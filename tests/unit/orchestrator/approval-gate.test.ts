import { describe, it, expect, beforeEach } from 'vitest';
import { OrchestrationStateMachine } from '../../../src/orchestrator/engine/state-machine.js';
import { ApprovalGate } from '../../../src/orchestrator/gates/approval-gate.js';

// Set test credential before tests run
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

    it('tracks pending approval requests', () => {
        const request = gate.requestApproval('run-1', 'gate-1', 'agent', 'Architecture review needed');
        expect(request.status).toBe('PENDING');
        expect(request.gateId).toBe('gate-1');
        expect(gate.getPendingApprovals()).toHaveLength(1);
    });

    it('approves with valid credential and allows workflow to continue', () => {
        gate.requestApproval('run-1', 'gate-1', 'agent', 'Need approval');
        const result = gate.processDecision(sm, 'gate-1', {
            approver: 'human-reviewer',
            credential: 'test-credential',
            decision: 'APPROVED',
            reason: 'Looks good',
            timestamp: new Date().toISOString(),
        });
        expect(result.success).toBe(true);
        expect(gate.isApproved('gate-1')).toBe(true);
        expect(gate.getPendingApprovals()).toHaveLength(0);
    });

    it('rejects approval with invalid credential (DEC-058)', () => {
        gate.requestApproval('run-1', 'gate-1', 'agent', 'Need approval');
        const result = gate.processDecision(sm, 'gate-1', {
            approver: 'attacker',
            credential: 'wrong-credential',
            decision: 'APPROVED',
            reason: 'Trying to bypass',
            timestamp: new Date().toISOString(),
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid approver credential');
        expect(gate.isApproved('gate-1')).toBe(false);
    });

    it('safe-stops workflow on rejection', () => {
        gate.requestApproval('run-1', 'gate-1', 'agent', 'Need approval');
        const result = gate.processDecision(sm, 'gate-1', {
            approver: 'human-reviewer',
            credential: 'test-credential',
            decision: 'REJECTED',
            reason: 'Not safe to proceed',
            timestamp: new Date().toISOString(),
        });
        expect(result.success).toBe(true);
        expect(result.run!.status).toBe('SAFE_STOPPED');
    });

    it('does not infer approval from silence', () => {
        gate.requestApproval('run-1', 'gate-1', 'agent', 'Need approval');
        const pending = gate.getPendingApprovals();
        expect(pending).toHaveLength(1);
        expect(pending[0]!.status).toBe('PENDING');
        expect(gate.isApproved('gate-1')).toBe(false);
    });
});