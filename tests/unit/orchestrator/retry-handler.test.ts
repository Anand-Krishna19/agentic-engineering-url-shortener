import { describe, it, expect } from 'vitest';
import { RetryHandler } from '../../../src/orchestrator/reliability/retry-handler.js';
import { SimulatedClock } from '../../../src/kernel/clock/clock.js';

describe('RetryHandler (FR-117, FR-118, FR-119, ADR-020)', () => {
    it('succeeds on first attempt', async () => {
        const handler = new RetryHandler();
        const result = await handler.execute(() => Promise.resolve('success'));
        expect(result.success).toBe(true);
        expect(result.value).toBe('success');
        expect(result.attempts).toBe(1);
    });

    it('retries on transient failure and succeeds', async () => {
        const handler = new RetryHandler({ maxAttempts: 3, baseDelayMs: 10 });
        let attempts = 0;
        const result = await handler.execute(() => {
            attempts++;
            if (attempts < 3) throw new Error('transient');
            return Promise.resolve('recovered');
        });
        expect(result.success).toBe(true);
        expect(result.value).toBe('recovered');
        expect(result.attempts).toBe(3);
    });

    it('exhausts bounded retries (max 3)', async () => {
        const handler = new RetryHandler({ maxAttempts: 3, baseDelayMs: 10 });
        const result = await handler.execute(() => {
            throw new Error('always fails');
        });
        expect(result.success).toBe(false);
        expect(result.attempts).toBe(3);
        expect(result.lastError).toContain('Exhausted 3 retries');
    });

    it('does not retry permanent failures', async () => {
        const handler = new RetryHandler({ maxAttempts: 3, baseDelayMs: 10 });
        const result = await handler.execute(
            () => { throw new Error('permanent'); },
            () => false, // classify as permanent
        );
        expect(result.success).toBe(false);
        expect(result.attempts).toBe(1);
        expect(result.lastError).toContain('Permanent failure');
    });

    it('enforces total timeout before starting next attempt using SimulatedClock', async () => {
        const simulatedClock = new SimulatedClock(new Date());
        const handler = new RetryHandler({ timeoutMs: 50, baseDelayMs: 10, maxAttempts: 3 }, simulatedClock);

        let attempts = 0;
        const result = await handler.execute(async () => {
            attempts++;
            if (attempts === 1) {
                // Simulate time passing during the first attempt
                simulatedClock.advance(60); // Advance clock past the 50ms timeout
                throw new Error('transient failure');
            }
            return Promise.resolve('done');
        });

        // The first attempt fails. Before starting attempt 2, the handler checks
        // elapsed time (60ms > 50ms) and correctly times out.
        expect(result.timedOut).toBe(true);
        expect(result.success).toBe(false);
        expect(result.attempts).toBe(1);
    });

    it('applies exponential backoff', async () => {
        const handler = new RetryHandler({ maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 1000 });
        const timestamps: number[] = [];
        await handler.execute(() => {
            timestamps.push(Date.now());
            if (timestamps.length < 3) throw new Error('fail');
            return Promise.resolve('done');
        });
        if (timestamps.length >= 3) {
            const delay1 = timestamps[1] - timestamps[0];
            const delay2 = timestamps[2] - timestamps[1];
            expect(delay2).toBeGreaterThanOrEqual(delay1);
        }
    });
});