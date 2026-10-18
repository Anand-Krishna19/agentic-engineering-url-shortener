/**
 * Orchestration State Transitions
 *
 * Requirements: FR-101 (workflow state), FR-104 (state transitions), FR-106 (dependency evaluation)
 * ADRs: ADR-004 (explicit dependency-graph state machine), ADR-019 (state persistence model)
 * DECs: DEC-045 (state machine design)
 * Tasks: T011 (Workflow State Machine and Execution Engine)
 */

export const WORKFLOW_TRANSITIONS: Record<string, string[]> = {
    CREATED: ['RUNNING', 'CANCELLED'],
    RUNNING: ['AWAITING_APPROVAL', 'SAFE_STOPPED', 'COMPLETED', 'CANCELLED'],
    AWAITING_APPROVAL: ['RUNNING', 'SAFE_STOPPED', 'CANCELLED'],
    SAFE_STOPPED: ['RUNNING', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
};

export const NODE_TRANSITIONS: Record<string, string[]> = {
    PENDING: ['READY', 'SKIPPED'],
    READY: ['RUNNING', 'SKIPPED'],
    RUNNING: ['AWAITING_WORK', 'AWAITING_APPROVAL', 'SUCCEEDED', 'RETRY_WAIT', 'FALLBACK_ACTIVE', 'SUSPENDED'],
    AWAITING_WORK: ['RUNNING', 'SUSPENDED'],
    AWAITING_APPROVAL: ['RUNNING', 'SUSPENDED', 'SKIPPED'],
    SUCCEEDED: [],
    RETRY_WAIT: ['RUNNING', 'FALLBACK_ACTIVE', 'SUSPENDED'],
    FALLBACK_ACTIVE: ['SUCCEEDED', 'SUSPENDED'],
    SUSPENDED: ['READY', 'SKIPPED'],
    SKIPPED: [],
};

export function isValidWorkflowTransition(from: string, to: string): boolean {
    const allowed = WORKFLOW_TRANSITIONS[from];
    if (!allowed) return false;
    return allowed.includes(to);
}

export function isValidNodeTransition(from: string, to: string): boolean {
    const allowed = NODE_TRANSITIONS[from];
    if (!allowed) return false;
    return allowed.includes(to);
}

export function isTerminalState(state: string): boolean {
    return WORKFLOW_TRANSITIONS[state]?.length === 0;
}