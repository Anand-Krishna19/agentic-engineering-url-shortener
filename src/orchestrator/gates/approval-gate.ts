/**
 * Human Approval Gate
 *
 * Requirements: FR-114 (human approval gates), FR-115 (explicit credential verification), FR-116 (timeout escalation)
 * ADRs: ADR-007 (Human approval model)
 * DECs: DEC-058 (credential verification, no hard-coded secrets)
 * Tasks: T012 (Human Approval Gates with safe-stop)
 */
import { OrchestrationStateMachine, TransitionResult } from '../engine/state-machine.js';
import { Clock, WallClock } from '../../kernel/clock/clock.js';

export interface ApprovalRequest {
    readonly runId: string;
    readonly gateId: string;
    readonly requestedBy: string;
    readonly reason: string;
    readonly requestedAt: string;
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
    private readonly clock: Clock;

    constructor(clock: Clock = new WallClock()) {
        this.clock = clock;
    }

    requestApproval(
        runId: string,
        gateId: string,
        requestedBy: string,
        reason: string,
    ): ApprovalRequest {
        const request: ApprovalRequest = {
            runId,
            gateId,
            requestedBy,
            reason,
            requestedAt: this.clock.now().toISOString(),
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

        const requiredCredential = getRequiredCredential();
        if (decision.credential !== requiredCredential) {
            return { success: false, error: 'Invalid approver credential' };
        }

        const elapsed = this.clock.now().getTime() - new Date(request.requestedAt).getTime();
        if (elapsed > APPROVAL_TIMEOUT_MS) {
            this.pendingApprovals.set(gateId, { ...request, status: 'TIMED_OUT' });
            return stateMachine.safeStop(request.runId, 'system', `Approval gate ${gateId} timed out`);
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