/**
 * PostgreSQL Database Implementation
 *
 * Implements the Database port using node-postgres.
 */
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { Database, setDatabase } from './port.js';

export class PostgresDatabase implements Database {
    private pool: Pool;

    constructor(connectionString?: string) {
        this.pool = new Pool({
            connectionString: connectionString || process.env.DATABASE_URL,
        });
    }

    async query<T extends QueryResultRow = QueryResultRow>(
        text: string,
        params?: unknown[],
    ): Promise<{ rows: T[]; rowCount: number }> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await this.pool.query<T>(text, params as any[]);
        return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    }

    async getClient(): Promise<PoolClient> {
        return this.pool.connect();
    }

    getPool(): Pool {
        return this.pool;
    }

    async close(): Promise<void> {
        await this.pool.end();
    }
}

export function initializeDatabase(connectionString?: string): Database {
    const db = new PostgresDatabase(connectionString);
    setDatabase(db);
    return db;
}