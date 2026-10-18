import { describe, it, expect, beforeEach } from 'vitest';
import { OrchestrationStateMachine } from '../../../src/orchestrator/engine/state-machine.js';
import { ApprovalGate } from '../../../src/orchestrator/gates/approval-gate.js';
import { SimulatedClock } from '../../../src/kernel/clock/clock.js';

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
describe('ApprovalGate timeout (FR-115, DEC-041)', () => {
    it('escalates and safe-stops an overdue gate on the Clock with no human reply, and rejects a late decision', () => {
        const clock = new SimulatedClock('2026-01-01T00:00:00.000Z');
        const sm = new OrchestrationStateMachine(clock);
        const gate = new ApprovalGate(clock);
        sm.createRun('run-t', 'policy-v1.0');
        sm.transition('run-t', 'RUNNING', 'system', 'start');
        gate.requestApproval('run-t', 'gate-t', 'agent', 'review', 60_000);

        clock.advance(59_999);
        expect(gate.expireOverdue(sm)).toEqual([]);
        expect(sm.getRun('run-t')?.status).toBe('RUNNING');

        clock.advance(1);
        expect(gate.expireOverdue(sm)).toHaveLength(1);
        expect(sm.getRun('run-t')?.status).toBe('SAFE_STOPPED');
        expect(gate.isApproved('gate-t')).toBe(false);
        expect(gate.escalations).toMatchObject([{ gateId: 'gate-t', runId: 'run-t' }]);

        const late = gate.processDecision(sm, 'gate-t', {
            approver: 'h', credential: 'test-credential', decision: 'APPROVED', reason: 'late', timestamp: clock.now().toISOString(),
        });
        expect(late.success).toBe(false);
        expect(gate.isApproved('gate-t')).toBe(false);
    });
});
