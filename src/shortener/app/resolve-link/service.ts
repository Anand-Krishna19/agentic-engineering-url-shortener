import type { Clock } from '../../../kernel/clock/clock.js';
import { captureRedirect, type AnalyticsStore, type CaptureFailure } from '../../domain/analytics/capture.js';
import { isExpired } from '../../domain/expiry/checker.js';
import { isTransient, problem, type HttpResult } from '../create-link/service.js';

// Redirect resolution (FR-008 to FR-011, FR-012, FR-014; ADR-017, ADR-025). Statuses are only active and
// expired (DEC-039); the single expiry rule is `now >= expires_at` (FR-011).

export interface LinkRecord {
  normalizedUrl: string;
  expiresAt: Date;
}

export interface ResolveStore {
  findLink(code: string): Promise<LinkRecord | null>;
}

export interface ResolveDeps {
  store: ResolveStore;
  analytics: AnalyticsStore;
  /** Log, metric and audit sink for a failed capture. Its own failure is contained. */
  onCaptureFailure: (failure: CaptureFailure & { requestId: string }) => void | Promise<void>;
  clock: Clock;
  /** Override of the 10 s persistence attempt bound (PVT-010), mainly for tests. */
  captureTimeoutMs?: number;
}

export interface ResolveInput {
  /** A well-formed 7-character base62 code; format is checked by the handler. */
  code: string;
  method: string;
  requestId: string;
}

export async function resolveLink(deps: ResolveDeps, input: ResolveInput): Promise<HttpResult> {
  let link: LinkRecord | null;
  try {
    link = await deps.store.findLink(input.code);
  } catch (error) {
    return isTransient(error) ? problem(503, 'persistence_unavailable', input.requestId, 1) : problem(500, 'internal_error', input.requestId);
  }

  if (link === null) return problem(404, 'not_found', input.requestId);
  if (isExpired(link.expiresAt, deps.clock)) return problem(410, 'link_expired', input.requestId);

  // Only a successful redirect is counted. Capture is a single bounded attempt and never throws, so the redirect proceeds.
  await captureRedirect(
    {
      store: deps.analytics,
      clock: deps.clock,
      timeoutMs: deps.captureTimeoutMs,
      onFailure: (failure) => {
        void Promise.resolve(deps.onCaptureFailure({ ...failure, requestId: input.requestId })).catch(() => {});
      },
    },
    input.code,
    input.method,
  );

  return { status: 302, body: '', location: link.normalizedUrl };
}
