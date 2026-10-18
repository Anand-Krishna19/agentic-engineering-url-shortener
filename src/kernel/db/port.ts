/**
 * Database Port - Shared infrastructure for both application and control planes.
 *
 * ADR-016: The kernel contains only minimal shared infrastructure.
 * Both the shortener (application plane) and orchestrator (control plane)
 * use this port to access PostgreSQL.
 */
import type { Pool, PoolClient } from 'pg';

/**
 * Minimal database connection interface for query operations.
 * Shared between planes to ensure structural compatibility without cross-plane imports.
 */
export interface Queryable {
    query(
        text: string,
        params?: unknown[],
    ): Promise<{ rowCount: number | null; rows: Record<string, unknown>[] }>;
}

export interface Database extends Queryable {
    getClient(): Promise<PoolClient>;
    getPool(): Pool;
}

let databaseInstance: Database | null = null;

export function setDatabase(db: Database): void {
    databaseInstance = db;
}

export function getDatabase(): Database {
    if (!databaseInstance) {
        throw new Error('Database not initialized. Call setDatabase() first.');
    }
    return databaseInstance;
}