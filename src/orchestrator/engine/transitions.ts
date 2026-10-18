/**
 * Orchestration State Transitions
 *
 * Implements the approved workflow state model with SAFE_STOPPED as a
 * permanent terminal state. Requirement and ADR citations are populated
 * from the authoritative SpecKit artifacts — see
 * docs/traceability/traceability.md. Do not add identifiers here without
 * verifying them against spec.md, data-model.md, and docs/adr/.
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