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

const REQUIRED_CREDENTIAL = 'APPROVER_CREDENTIAL';
const APPROVAL_TIMEOUT_MS = 300_000; // 5 minutes

export class ApprovalGate {
    private readonly pendingApprovals: Map<string, ApprovalRequest> = new Map();
    private readonly decisions: Map<string, ApprovalDecision> = new Map();
    private readonly clock: Clock;

    constructor(clock: Clock = new WallClock()) {
        this.clock = clock;
    }

    requestApproval(
        stateMachine: OrchestrationStateMachine,
        runId: string,
        gateId: string,
        requestedBy: string,
        reason: string,
    ): TransitionResult {
        const request: ApprovalRequest = {
            runId,
            gateId,
            requestedBy,
            reason,
            requestedAt: this.clock.now().toISOString(),
            status: 'PENDING',
        };

        this.pendingApprovals.set(gateId, request);
        return stateMachine.transition(runId, 'AWAITING_APPROVAL', 'system', `Approval gate ${gateId}: ${reason}`);
    }

    processDecision(
        stateMachine: OrchestrationStateMachine,
        gateId: string,
        decision: ApprovalDecision,
    ): TransitionResult {
        const request = this.pendingApprovals.get(gateId);
        if (!request) {
            const run = stateMachine.getRun('unknown');
            return {
                success: false,
                run: run ?? { runId: 'unknown', policyVersion: '', status: 'CREATED', createdAt: '', updatedAt: '', context: {}, decisionLineage: [] },
                error: `Approval gate ${gateId} not found`,
            };
        }

        if (decision.credential !== REQUIRED_CREDENTIAL) {
            return { success: false, run: stateMachine.getRun(request.runId)!, error: 'Invalid approver credential' };
        }

        const elapsed = this.clock.now().getTime() - new Date(request.requestedAt).getTime();
        if (elapsed > APPROVAL_TIMEOUT_MS) {
            this.pendingApprovals.set(gateId, { ...request, status: 'TIMED_OUT' });
            return stateMachine.safeStop(request.runId, 'system', `Approval gate ${gateId} timed out`);
        }

        this.decisions.set(gateId, decision);
        this.pendingApprovals.delete(gateId);

        if (decision.decision === 'APPROVED') {
            return stateMachine.transition(request.runId, 'RUNNING', decision.approver, `Approved: ${decision.reason}`);
        } else {
            return stateMachine.safeStop(request.runId, decision.approver, `Rejected: ${decision.reason}`);
        }
    }

    getPendingApprovals(): ApprovalRequest[] {
        return Array.from(this.pendingApprovals.values());
    }

    getDecision(gateId: string): ApprovalDecision | undefined {
        return this.decisions.get(gateId);
    }
}