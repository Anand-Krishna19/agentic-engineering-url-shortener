import type { Clock } from '../../../kernel/clock/clock.js';
import type { ResolveStore } from '../../app/resolve-link/service.js';
import type { AnalyticsStore, CaptureFailure } from '../../domain/analytics/capture.js';
import { withTransaction, type Db } from './pg-database.js';

// PostgreSQL adapters for redirect resolution and analytics (ADR-003, ADR-025). Time values are Clock
// parameters, never `now()` (ADR-010).

export function pgResolveStore(db: Db): ResolveStore {
  return {
    findLink: (code) =>
      db.withConnection(async (c) => {
        const { rows } = await c.query('SELECT normalized_url, expires_at FROM short_links WHERE short_code = $1', [code]);
        const row = rows[0];
        return row ? { normalizedUrl: row.normalized_url as string, expiresAt: row.expires_at as Date } : null;
      }),
  };
}

/** The event row and the aggregate counter commit in one transaction (ADR-025, DEC-055). */
export function pgAnalyticsStore(db: Db): AnalyticsStore {
  return {
    recordRedirect: (event) =>
      db.withConnection((c) =>
        withTransaction(c, async () => {
          await c.query('INSERT INTO redirect_events (short_code, occurred_at) VALUES ($1, $2)', [event.shortCode, event.occurredAt]);
          await c.query(
            `INSERT INTO redirect_counters (short_code, redirect_count) VALUES ($1, 1)
             ON CONFLICT (short_code) DO UPDATE SET redirect_count = redirect_counters.redirect_count + 1`,
            [event.shortCode],
          );
        }),
      ),
  };
}

/** Writes the application audit event for a failed capture (FR-014, DEC-007). Carries no error text. */
export function pgCaptureFailureAuditor(db: Db, clock: Clock): (failure: CaptureFailure & { requestId: string }) => Promise<void> {
  return (failure) =>
    db.withConnection(async (c) => {
      await c.query(
        `INSERT INTO app_audit_events (occurred_at, request_id, correlation_id, action, subject, result, reason)
         VALUES ($1, $2, $2, 'analytics_capture_failed', $3, 'FAILURE', $4)`,
        [clock.now(), failure.requestId, failure.shortCode, failure.reason],
      );
    });
}
