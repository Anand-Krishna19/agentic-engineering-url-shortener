/**
 * Human Approval Gate
 *
 * Implements human approval checkpoints per ADR-007.
 * Requires explicit approver credential (DEC-037) that agents never hold.
 * Timeout never means approval (FR-115, DEC-041).
 * Records approver identity, role, reason, and subject hash.
 *
 * Requirements: FR-114 (human approval checkpoints with approve/reject/escalate,
 *                         recorded reason and actor),
 *               FR-115 (timeout must never mean approval)
 * ADRs:         ADR-007 (human approval model: credential-based, timeout semantics)
 * DECs:         DEC-037 (approver credential agents never hold),
 *               DEC-041 (timeout semantics, late response rejection)
 */
import { OrchestrationStateMachine, TransitionResult } from '../engine/state-machine.js';
import { Clock, WallClock } from '../../kernel/clock/clock.js';

export interface ApprovalRequest {
    readonly runId: string;
    readonly gateId: string;
    readonly requestedBy: string;
    readonly reason: string;
    readonly requestedAt: string;
    readonly timeoutMs: number;
    readonly status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'TIMED_OUT';
}

export interface ApprovalDecision {
    readonly approver: string;
    readonly credential: string;
    readonly decision: 'APPROVED' | 'REJECTED';
    readonly reason: string;
    readonly timestamp: string;
}

function getRequiredCredential(): string {
    const credential = process.env.APPROVER_CREDENTIAL;
    if (!credential || credential.length === 0) {
        throw new Error(
            'APPROVER_CREDENTIAL environment variable is required but not set. ' +
            'See Constitution Principle V and ADR-007.'
        );
    }
    return credential;
}

const APPROVAL_TIMEOUT_MS = 300_000;

export class ApprovalGate {
    private readonly pendingApprovals: Map<string, ApprovalRequest> = new Map();
    private readonly decisions: Map<string, ApprovalDecision> = new Map();
    /** Gates escalated on timeout, in order (FR-115: escalate, never pass). */
    readonly escalations: Array<{ gateId: string; runId: string; at: string }> = [];
    private readonly clock: Clock;

    constructor(clock: Clock = new WallClock()) {
        this.clock = clock;
    }

    requestApproval(
        runId: string,
        gateId: string,
        requestedBy: string,
        reason: string,
        timeoutMs: number = APPROVAL_TIMEOUT_MS,
    ): ApprovalRequest {
        const request: ApprovalRequest = {
            runId,
            gateId,
            requestedBy,
            reason,
            requestedAt: this.clock.now().toISOString(),
            timeoutMs,
            status: 'PENDING',
        };

        this.pendingApprovals.set(gateId, request);
        return request;
    }

    processDecision(
        stateMachine: OrchestrationStateMachine,
        gateId: string,
        decision: ApprovalDecision,
    ): TransitionResult {
        const request = this.pendingApprovals.get(gateId);
        if (!request) {
            return { success: false, error: `Approval gate ${gateId} not found` };
        }

        if (request.status === 'TIMED_OUT') {
            return { success: false, error: `Late response rejected: gate ${gateId} already timed out` };
        }

        const requiredCredential = getRequiredCredential();
        if (decision.credential !== requiredCredential) {
            return { success: false, error: 'Invalid approver credential' };
        }

        if (this.isOverdue(request)) {
            return this.expire(stateMachine, request);
        }

        this.decisions.set(gateId, decision);
        this.pendingApprovals.delete(gateId);

        if (decision.decision === 'APPROVED') {
            // On approval, allow workflow to continue (transition to COMPLETED or next state)
            return { success: true, run: stateMachine.getRun(request.runId) };
        } else {
            // On rejection, safe-stop the workflow
            return stateMachine.safeStop(request.runId, decision.approver, `Rejected: ${decision.reason}`);
        }
    }

    /**
     * Clock-driven sweep: every overdue pending gate is escalated and its run safe-stopped.
     * Silence never approves (FR-115); no human reply is needed for the stop to happen.
     */
    expireOverdue(stateMachine: OrchestrationStateMachine): TransitionResult[] {
        return this.getPendingApprovals()
            .filter((r) => r.status === 'PENDING' && this.isOverdue(r))
            .map((r) => this.expire(stateMachine, r));
    }

    private isOverdue(request: ApprovalRequest): boolean {
        return this.clock.now().getTime() - new Date(request.requestedAt).getTime() >= request.timeoutMs;
    }

    private expire(stateMachine: OrchestrationStateMachine, request: ApprovalRequest): TransitionResult {
        this.pendingApprovals.set(request.gateId, { ...request, status: 'TIMED_OUT' });
        this.escalations.push({ gateId: request.gateId, runId: request.runId, at: this.clock.now().toISOString() });
        return stateMachine.safeStop(request.runId, 'system', `Approval gate ${request.gateId} timed out; escalated`);
    }

    isApproved(gateId: string): boolean {
        const decision = this.decisions.get(gateId);
        return decision?.decision === 'APPROVED';
    }

    getPendingApprovals(): ApprovalRequest[] {
        return Array.from(this.pendingApprovals.values());
    }

    getDecision(gateId: string): ApprovalDecision | undefined {
        return this.decisions.get(gateId);
    }
}