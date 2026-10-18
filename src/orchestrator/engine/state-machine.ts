/**
 * Orchestration State Transitions
 *
 * Implements the approved workflow state model with SAFE_STOPPED as a
 * permanent terminal state. Requirement and ADR citations are populated
 * from the authoritative SpecKit artifacts — see
 * docs/traceability/traceability.md. Do not add identifiers here without
 * verifying them against spec.md, data-model.md, and docs/adr/.
 */
import { isValidWorkflowTransition } from './transitions.js';
import { Clock, WallClock } from '../../kernel/clock/clock.js';

export interface WorkflowRun {
    readonly runId: string;
    readonly policyVersion: string;
    readonly status: string;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly context: Record<string, unknown>;
    readonly decisionLineage: DecisionRecord[];
}

export interface DecisionRecord {
    readonly timestamp: string;
    readonly fromState: string;
    readonly toState: string;
    readonly actor: string;
    readonly reason: string;
}

export interface TransitionResult {
    readonly success: boolean;
    readonly run?: WorkflowRun;
    readonly error?: string;
}

export class OrchestrationStateMachine {
    private readonly runs: Map<string, WorkflowRun> = new Map();
    private readonly clock: Clock;

    constructor(clock: Clock = new WallClock()) {
        this.clock = clock;
    }

    createRun(runId: string, policyVersion: string, context: Record<string, unknown> = {}): WorkflowRun {
        if (this.runs.has(runId)) {
            throw new Error(`Workflow run ${runId} already exists`);
        }

        const now = this.clock.now().toISOString();
        const run: WorkflowRun = {
            runId,
            policyVersion,
            status: 'CREATED',
            createdAt: now,
            updatedAt: now,
            context,
            decisionLineage: [],
        };

        this.runs.set(runId, run);
        return run;
    }

    getRun(runId: string): WorkflowRun | undefined {
        return this.runs.get(runId);
    }

    transition(runId: string, toState: string, actor: string, reason: string): TransitionResult {
        const run = this.runs.get(runId);
        if (!run) {
            return { success: false, error: `Run ${runId} not found` };
        }

        if (!isValidWorkflowTransition(run.status, toState)) {
            return { success: false, run, error: `Invalid transition: ${run.status} → ${toState}` };
        }

        const decision: DecisionRecord = {
            timestamp: this.clock.now().toISOString(),
            fromState: run.status,
            toState,
            actor,
            reason,
        };

        const updatedRun: WorkflowRun = {
            ...run,
            status: toState,
            updatedAt: this.clock.now().toISOString(),
            decisionLineage: [...run.decisionLineage, decision],
        };

        this.runs.set(runId, updatedRun);
        return { success: true, run: updatedRun };
    }

    safeStop(runId: string, actor: string, reason: string): TransitionResult {
        return this.transition(runId, 'SAFE_STOPPED', actor, `SAFE-STOP: ${reason}`);
    }

    cancel(runId: string, actor: string, reason: string): TransitionResult {
        return this.transition(runId, 'CANCELLED', actor, reason);
    }
}