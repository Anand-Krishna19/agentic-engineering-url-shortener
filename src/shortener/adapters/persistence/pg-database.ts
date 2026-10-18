import pg from 'pg';
import type { Queryable } from '../../../kernel/db/port.js';

// One connection per unit of work, no pooling (DEC-113: pooling disabled for prototype simplicity).

export interface Db {
  withConnection<T>(fn: (conn: Queryable) => Promise<T>): Promise<T>;
}

export function pgDatabase(config: pg.ClientConfig): Db {
  return {
    async withConnection(fn) {
      const client = new pg.Client(config);
      await client.connect();
      try {
        return await fn(client);
      } finally {
        await client.end().catch(() => {});
      }
    },
  };
}

/** Runs `fn` in a transaction on `conn`: COMMIT on success, ROLLBACK and rethrow on any error. */
export async function withTransaction<T>(conn: Queryable, fn: () => Promise<T>): Promise<T> {
  await conn.query('BEGIN', []);
  try {
    const result = await fn();
    await conn.query('COMMIT', []);
    return result;
  } catch (error) {
    await conn.query('ROLLBACK', []).catch(() => {});
    throw error;
  }
}
