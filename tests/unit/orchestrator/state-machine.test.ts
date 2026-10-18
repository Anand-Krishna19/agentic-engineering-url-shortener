import { describe, it, expect, beforeEach } from 'vitest';
import { OrchestrationStateMachine } from '../../../src/orchestrator/engine/state-machine.js';
import { isValidWorkflowTransition, isValidNodeTransition, isTerminalState } from '../../../src/orchestrator/engine/transitions.js';

describe('OrchestrationStateMachine (FR-101, FR-104, ADR-004, ADR-019)', () => {
    let sm: OrchestrationStateMachine;

    beforeEach(() => {
        sm = new OrchestrationStateMachine();
    });

    describe('state creation', () => {
        it('creates a workflow run in CREATED state', () => {
            const run = sm.createRun('run-1', 'policy-v1.0');
            expect(run.status).toBe('CREATED');
            expect(run.runId).toBe('run-1');
            expect(run.policyVersion).toBe('policy-v1.0');
        });

        it('rejects duplicate run IDs', () => {
            sm.createRun('run-1', 'policy-v1.0');
            expect(() => sm.createRun('run-1', 'policy-v1.0')).toThrow('already exists');
        });
    });

    describe('valid transitions', () => {
        it('transitions CREATED → RUNNING', () => {
            sm.createRun('run-1', 'policy-v1.0');
            const result = sm.transition('run-1', 'RUNNING', 'system', 'Starting execution');
            expect(result.success).toBe(true);
            expect(result.run.status).toBe('RUNNING');
        });

        it('transitions RUNNING → COMPLETED', () => {
            sm.createRun('run-1', 'policy-v1.0');
            sm.transition('run-1', 'RUNNING', 'system', 'start');
            const result = sm.transition('run-1', 'COMPLETED', 'system', 'All tasks done');
            expect(result.success).toBe(true);
            expect(result.run.status).toBe('COMPLETED');
        });

        it('transitions RUNNING → SAFE_STOPPED', () => {
            sm.createRun('run-1', 'policy-v1.0');
            sm.transition('run-1', 'RUNNING', 'system', 'start');
            const result = sm.safeStop('run-1', 'system', 'Unsafe condition detected');
            expect(result.success).toBe(true);
            expect(result.run.status).toBe('SAFE_STOPPED');
        });

        it('transitions SAFE_STOPPED → RUNNING (resumption)', () => {
            sm.createRun('run-1', 'policy-v1.0');
            sm.transition('run-1', 'RUNNING', 'system', 'start');
            sm.safeStop('run-1', 'system', 'pause');
            const result = sm.transition('run-1', 'RUNNING', 'human', 'Resuming after review');
            expect(result.success).toBe(true);
            expect(result.run.status).toBe('RUNNING');
        });
    });

    describe('invalid transitions (exit gate enforcement)', () => {
        it('rejects CREATED → COMPLETED (must go through RUNNING)', () => {
            sm.createRun('run-1', 'policy-v1.0');
            const result = sm.transition('run-1', 'COMPLETED', 'system', 'skip');
            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid transition');
        });

        it('rejects COMPLETED → RUNNING (terminal state)', () => {
            sm.createRun('run-1', 'policy-v1.0');
            sm.transition('run-1', 'RUNNING', 'system', 'start');
            sm.transition('run-1', 'COMPLETED', 'system', 'done');
            const result = sm.transition('run-1', 'RUNNING', 'system', 'restart');
            expect(result.success).toBe(false);
        });

        it('rejects transition on non-existent run', () => {
            const result = sm.transition('nonexistent', 'RUNNING', 'system', 'test');
            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
        });
    });

    describe('decision lineage', () => {
        it('records full decision history', () => {
            sm.createRun('run-1', 'policy-v1.0');
            sm.transition('run-1', 'RUNNING', 'system', 'start');
            sm.safeStop('run-1', 'human', 'manual stop');
            sm.transition('run-1', 'RUNNING', 'human', 'resume');

            const run = sm.getRun('run-1')!;
            expect(run.decisionLineage).toHaveLength(3);
            expect(run.decisionLineage[0].fromState).toBe('CREATED');
            expect(run.decisionLineage[0].toState).toBe('RUNNING');
            expect(run.decisionLineage[1].toState).toBe('SAFE_STOPPED');
            expect(run.decisionLineage[2].toState).toBe('RUNNING');
        });
    });
});

describe('transition rules', () => {
    it('validates workflow transitions correctly', () => {
        expect(isValidWorkflowTransition('CREATED', 'RUNNING')).toBe(true);
        expect(isValidWorkflowTransition('CREATED', 'COMPLETED')).toBe(false);
        expect(isValidWorkflowTransition('RUNNING', 'AWAITING_APPROVAL')).toBe(true);
        expect(isValidWorkflowTransition('COMPLETED', 'RUNNING')).toBe(false);
    });

    it('validates node transitions correctly', () => {
        expect(isValidNodeTransition('PENDING', 'READY')).toBe(true);
        expect(isValidNodeTransition('RUNNING', 'SUCCEEDED')).toBe(true);
        expect(isValidNodeTransition('SUCCEEDED', 'RUNNING')).toBe(false);
    });

    it('identifies terminal states', () => {
        expect(isTerminalState('COMPLETED')).toBe(true);
        expect(isTerminalState('CANCELLED')).toBe(true);
        expect(isTerminalState('RUNNING')).toBe(false);
    });
});