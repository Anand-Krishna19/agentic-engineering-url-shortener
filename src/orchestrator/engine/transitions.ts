/**
 * Valid state transitions for the orchestration workflow.
 * Per data-model.md: CREATED → RUNNING → SAFE_STOPPED / COMPLETED / CANCELLED
 * Per orchestration-model.md: Node states with entry/exit criteria.
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