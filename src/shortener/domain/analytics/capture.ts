import type { Clock } from '../../../kernel/clock/clock.js';

// Redirect analytics capture (FR-012, FR-013, FR-014, DEC-007, DEC-097, DEC-104, DEC-109; ADR-025).
// Count and timestamp only. A single attempt, bounded by the general persistence attempt timeout
// (PVT-010), and fail-open: capture can never throw, so it can never block or fail a redirect.

/** Per-attempt persistence timeout (PVT-010). No analytics-specific bound exists (DEC-097). */
export const CAPTURE_TIMEOUT_MS = 10_000;

/** The only analytics fields: no address, agent string, or referrer (FR-013). */
export interface RedirectEvent {
  shortCode: string;
  occurredAt: Date;
}

export interface AnalyticsStore {
  /** Inserts the event and increments the aggregate counter in one transaction. */
  recordRedirect(event: RedirectEvent, signal?: AbortSignal): Promise<void>;
}

/** Sent to the failure reporter (log, metric, application audit event). Never carries error text. */
export interface CaptureFailure {
  shortCode: string;
  reason: 'error' | 'timeout';
}

export interface CaptureDeps {
  store: AnalyticsStore;
  clock: Clock;
  onFailure: (failure: CaptureFailure) => void;
  timeoutMs?: number;
}

export type CaptureOutcome = 'captured' | 'skipped' | 'failed';

/**
 * Call after a successful redirect decision. Only GET requests count (DEC-104); other methods are
 * skipped. Never rejects.
 */
export async function captureRedirect(deps: CaptureDeps, shortCode: string, method: string): Promise<CaptureOutcome> {
  if (method.toUpperCase() !== 'GET') return 'skipped';

  const report = (reason: CaptureFailure['reason']) => {
    try {
      deps.onFailure({ shortCode, reason });
    } catch {
      /* a failing reporter must not affect the redirect */
    }
  };

  const event: RedirectEvent = { shortCode, occurredAt: deps.clock.now() };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), deps.timeoutMs ?? CAPTURE_TIMEOUT_MS);
  });

  try {
    // The async wrapper also contains a synchronous throw from the store.
    const attempt = (async () => {
      await deps.store.recordRedirect(event, controller.signal);
      return 'done' as const;
    })();
    attempt.catch(() => {}); // an attempt that fails after the timeout must not become an unhandled rejection
    const winner = await Promise.race([attempt, timedOut]);
    if (winner === 'timeout') {
      controller.abort();
      report('timeout');
      return 'failed';
    }
    return 'captured';
  } catch {
    report('error');
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}
