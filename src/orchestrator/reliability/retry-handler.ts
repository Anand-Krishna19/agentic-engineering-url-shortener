/**
 * Bounded Retry Handler
 *
 * Requirements: FR-117 (bounded retries), FR-118 (exponential backoff), FR-119 (timeout)
 * ADRs: ADR-020 (Reliability and recovery)
 * DECs: DEC-062 (retry bounds and backoff)
 * Tasks: T015 (Recovery and Dynamic Replanning - retry portion)
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
    maxAttempts: 3,
    baseDelayMs: 100,
    maxDelayMs: 5000,
    timeoutMs: 30_000,
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
        const startTime = this.clock.now().getTime();
        let lastError: string | undefined;

        for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
            const elapsed = this.clock.now().getTime() - startTime;

            if (elapsed >= this.config.timeoutMs) {
                return { success: false, attempts: attempt - 1, lastError: `Timeout after ${this.config.timeoutMs}ms`, timedOut: true };
            }

            try {
                const remainingTime = this.config.timeoutMs - elapsed;
                const value = await this.raceWithTimeout(operation(), remainingTime);
                return { success: true, value, attempts: attempt, timedOut: false };
            } catch (error) {
                const err = error as Error;

                if (err.message === 'TIMEOUT_EXCEEDED') {
                    return { success: false, attempts: attempt, lastError: `Timeout after ${this.config.timeoutMs}ms`, timedOut: true };
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