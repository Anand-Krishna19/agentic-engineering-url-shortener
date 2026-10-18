/**
 * Compensation effects ledger.
 *
 * Compensation undoes the external effects of completed work with new, recorded actions; it is not
 * rollback of state (ADR-021). Every effect and every compensation is a hash-chained audit event, so
 * the ledger survives a crash and a resumed run can see which effects still need compensating.
 *
 * Requirements: FR-119, FR-120 | ADRs: ADR-020, ADR-021 | Audit: ATTEMPT_FINISHED (effect),
 *               COMPENSATION_STARTED, COMPENSATION_FINISHED
 */
import type { Actor, RunStore } from '../persistence/run-store.js';

export interface Effect {
    readonly effectId: string;
    readonly nodeKey: string;
    readonly description: string;
}

const ENGINE: Actor = { type: 'SYSTEM', id: 'compensation' };

export class CompensationLedger {
    constructor(private readonly store: RunStore) {}

    async recordEffect(runId: string, effect: Effect): Promise<void> {
        await this.store.recordEvent(runId, ENGINE, 'ATTEMPT_FINISHED', effect.nodeKey, `effect applied: ${effect.description}`, { effect: effect.effectId });
    }

    /** Effects with no finished compensation, newest first (undo in reverse order). */
    async outstanding(runId: string): Promise<Effect[]> {
        const applied = await this.store.eventsOf(runId, 'ATTEMPT_FINISHED');
        const done = new Set((await this.store.eventsOf(runId, 'COMPENSATION_FINISHED')).map((e) => String(e.data.effect)));
        return applied
            .filter((e) => typeof e.data.effect === 'string' && !done.has(e.data.effect))
            .map((e) => ({ effectId: String(e.data.effect), nodeKey: e.subject_id, description: '' }))
            .reverse();
    }

    /** Compensates every outstanding effect via `undo`; a crash midway leaves the rest outstanding. */
    async compensate(runId: string, undo: (effect: Effect) => Promise<void>): Promise<string[]> {
        const compensated: string[] = [];
        for (const e of await this.outstanding(runId)) {
            await this.store.recordEvent(runId, ENGINE, 'COMPENSATION_STARTED', e.nodeKey, 'compensating', { effect: e.effectId });
            await undo(e);
            await this.store.recordEvent(runId, ENGINE, 'COMPENSATION_FINISHED', e.nodeKey, 'compensated', { effect: e.effectId });
            compensated.push(e.effectId);
        }
        return compensated;
    }
}
