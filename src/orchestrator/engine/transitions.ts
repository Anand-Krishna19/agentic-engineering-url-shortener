/**
 * Orchestration Workflow State Transitions
 *
 * Implements the approved workflow state model from data-model.md §workflow_runs:
 * CREATED → RUNNING → {SAFE_STOPPED, COMPLETED, CANCELLED}
 * Terminal states: SAFE_STOPPED, COMPLETED, CANCELLED
 * SAFE_STOPPED is permanent (DEC-050): no transitions out.
 *
 * Requirements: FR-104 (stage entry/exit criteria enforcement),
 *               FR-105 (explicit dependency-based ordering, not linear chain)
 * ADRs:         ADR-004 (custom in-process orchestration engine)
 * DECs:         DEC-050 (SAFE_STOPPED is permanent, recovery is a new run)
 */

export const WORKFLOW_TRANSITIONS: Record<string, string[]> = {
    CREATED: ['RUNNING', 'CANCELLED'],
    RUNNING: ['SAFE_STOPPED', 'COMPLETED', 'CANCELLED'],
    SAFE_STOPPED: [],  // DEC-050: SAFE_STOPPED is permanent, no transitions out
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

export function isTerminalWorkflowState(state: string): boolean {
    return WORKFLOW_TRANSITIONS[state]?.length === 0;
}