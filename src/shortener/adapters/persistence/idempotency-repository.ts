import type { Clock } from '../../../kernel/clock/clock.js';
import { RequestSupersededError, type CreateLinkStore, type ExistingRecord } from '../../app/create-link/service.js';
import { insertWithUniqueCode, type RandomInt } from '../../domain/code/generator.js';
import { withTransaction, type Db } from './pg-database.js';
import { insertShortLink, type Queryable } from './short-link-repository.js';

// PostgreSQL store for idempotent creation (ADR-003, ADR-026, ADR-015, DEC-067). The database is the only
// authority; every time value comes from the Clock port and is passed as a parameter, never `now()` (ADR-010).

const LEASE_MS = 60_000; // DEC-030
const RETENTION_MS = 86_400_000; // DEC-031: 24 h from the terminal state

export interface StoreOptions {
  randomInt?: RandomInt;
}

export function pgCreateLinkStore(db: Db, clock: Clock, opts: StoreOptions = {}): CreateLinkStore {
  const insertLink = (c: Queryable, link: Parameters<CreateLinkStore['createWithoutKey']>[0]['link']) =>
    insertWithUniqueCode(
      async (code) => {
        const inserted = await insertShortLink(c, {
          short_code: code,
          normalized_url: link.normalizedUrl,
          creator_client_id: link.creatorClientId,
          created_at: link.createdAt,
          expires_at: link.expiresAt,
          expiry_source: link.expirySource,
        });
        return inserted ? { inserted: true as const, value: code } : { inserted: false as const };
      },
      { randomInt: opts.randomInt },
    );

  return {
    async claim({ clientId, key, signature, requestId }) {
      return db.withConnection(async (c) => {
        for (let attempt = 0; attempt < 3; attempt++) {
          const now = clock.now();
          // Lazy reaper: a lease-expired IN_PROGRESS or retention-expired terminal record counts as absent.
          await c.query(
            `DELETE FROM idempotency_records
              WHERE client_id = $1 AND idempotency_key = $2
                AND ((state = 'IN_PROGRESS' AND lease_expires_at <= $3)
                  OR (state <> 'IN_PROGRESS' AND retention_until <= $3))`,
            [clientId, key, now],
          );
          const inserted = await c.query(
            `INSERT INTO idempotency_records (client_id, idempotency_key, signature, state, request_id, lease_expires_at)
             VALUES ($1, $2, $3, 'IN_PROGRESS', $4, $5)
             ON CONFLICT (client_id, idempotency_key) DO NOTHING`,
            [clientId, key, signature, requestId, new Date(now.getTime() + LEASE_MS)],
          );
          if (inserted.rowCount === 1) return { state: 'claimed' as const };
          const found = await c.query(
            `SELECT signature, state, response_status, response_body
               FROM idempotency_records WHERE client_id = $1 AND idempotency_key = $2`,
            [clientId, key],
          );
          const row = found.rows[0];
          if (row) {
            const record: ExistingRecord = {
              signature: row.signature as string,
              state: row.state as ExistingRecord['state'],
              responseStatus: (row.response_status as number | null) ?? null,
              responseBody: (row.response_body as string | null) ?? null,
            };
            return { state: 'existing' as const, record };
          }
          // The conflicting record vanished between the insert and the select (released or reaped): try again.
        }
        throw new Error('idempotency claim did not settle');
      });
    },

    async commitCreated({ clientId, key, requestId, link, buildResponse }) {
      return db.withConnection((c) =>
        withTransaction(c, async () => {
          const { code } = await insertLink(c, link);
          const response = buildResponse(code);
          // $now is read here, at commit time: a slow request must be judged against the current time (LIM-002).
          const now = clock.now();
          const updated = await c.query(
            `UPDATE idempotency_records
                SET state = 'COMPLETED', short_code = $4, response_status = $5, response_body = $6,
                    terminal_at = $7, retention_until = $8, lease_expires_at = NULL
              WHERE client_id = $1 AND idempotency_key = $2 AND request_id = $3
                AND state = 'IN_PROGRESS' AND lease_expires_at > $7`,
            [clientId, key, requestId, code, response.status, response.body, now, new Date(now.getTime() + RETENTION_MS)],
          );
          if (updated.rowCount !== 1) throw new RequestSupersededError(); // rolls back the link insert
          return { code, response };
        }),
      );
    },

    async createWithoutKey({ link, buildResponse }) {
      return db.withConnection(async (c) => {
        const { code } = await insertLink(c, link);
        return { code, response: buildResponse(code) };
      });
    },

    async failPermanent({ clientId, key, requestId, response }) {
      await db.withConnection(async (c) => {
        const now = clock.now();
        await c.query(
          `UPDATE idempotency_records
              SET state = 'FAILED', response_status = $4, response_body = $5,
                  terminal_at = $6, retention_until = $7, lease_expires_at = NULL
            WHERE client_id = $1 AND idempotency_key = $2 AND request_id = $3 AND state = 'IN_PROGRESS'`,
          [clientId, key, requestId, response.status, response.body, now, new Date(now.getTime() + RETENTION_MS)],
        );
      });
    },

    async release({ clientId, key, requestId }) {
      await db.withConnection(async (c) => {
        await c.query(
          `DELETE FROM idempotency_records
            WHERE client_id = $1 AND idempotency_key = $2 AND request_id = $3 AND state = 'IN_PROGRESS'`,
          [clientId, key, requestId],
        );
      });
    },
  };
}
