/**
 * Bounded Retry Handler
 *
 * Implements transient failure recovery per ADR-020.
 * Bounds: 3 retries after first attempt, 1s doubling backoff, 10s timeout.
 * Distinguishes transient vs permanent failures.
 *
 * Requirements: FR-020 (transient persistence failures use bounded retries
 *                        with defined backoff and timeout)
 * ADRs:         ADR-020 (retry, fallback, and safe-stop policy:
 *                         3 retries, 1s doubling backoff, 10s timeout)
 */
import { Clock, WallClock } from '../../kernel/clock/clock.js';

export interface RetryConfig {
    readonly maxAttempts: number;
    readonly baseDelayMs: number;
    readonly maxDelayMs: number;
    readonly timeoutMs: number;
}

export interface RetryResult<T> {
    readonly success: boolean;
    readonly value?: T;
    readonly attempts: number;
    readonly lastError?: string;
    readonly timedOut: boolean;
}

const DEFAULT_CONFIG: RetryConfig = {
    maxAttempts: 4, // first attempt + 3 retries (ADR-020)
    baseDelayMs: 1000,
    maxDelayMs: 8000,
    timeoutMs: 10_000, // per attempt (ADR-020)
};

export class RetryHandler {
    private readonly config: RetryConfig;
    private readonly clock: Clock;

    constructor(config: Partial<RetryConfig> = {}, clock: Clock = new WallClock()) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.clock = clock;
    }

    async execute<T>(
        operation: () => Promise<T>,
        isTransient: (error: unknown) => boolean = () => true,
    ): Promise<RetryResult<T>> {
        let lastError: string | undefined;

        for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
            const attemptStart = this.clock.now().getTime();

            try {
                const value = await this.raceWithTimeout(operation(), this.config.timeoutMs);
                return { success: true, value, attempts: attempt, timedOut: false };
            } catch (error) {
                const err = error as Error;

                if (err.message === 'TIMEOUT_EXCEEDED' || this.clock.now().getTime() - attemptStart >= this.config.timeoutMs) {
                    return { success: false, attempts: attempt, lastError: `Attempt timeout after ${this.config.timeoutMs}ms`, timedOut: true };
                }

                lastError = err.message || String(error);

                if (!isTransient(error)) {
                    return { success: false, attempts: attempt, lastError: `Permanent failure: ${lastError}`, timedOut: false };
                }

                if (attempt === this.config.maxAttempts) {
                    break;
                }

                const delay = Math.min(this.config.baseDelayMs * Math.pow(2, attempt - 1), this.config.maxDelayMs);
                await this.sleep(delay);
            }
        }

        return { success: false, attempts: this.config.maxAttempts, lastError: `Exhausted ${this.config.maxAttempts} retries: ${lastError}`, timedOut: false };
    }

    private raceWithTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('TIMEOUT_EXCEEDED')), timeoutMs);
            operation.then(
                (val) => { clearTimeout(timer); resolve(val); },
                (err) => { clearTimeout(timer); reject(err); }
            );
        });
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}