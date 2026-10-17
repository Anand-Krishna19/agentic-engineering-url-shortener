// Short link persistence (ADR-003: `pg`, hand-written parameterized SQL behind a repository, no ORM).

/** Anything with a pg-style `query`: a Client, a transaction client, or a test double. */
export interface Queryable {
  query(text: string, values: unknown[]): Promise<{ rowCount: number | null; rows: Record<string, unknown>[] }>;
}

export interface NewShortLink {
  short_code: string;
  normalized_url: string;
  creator_client_id: string;
  /** Supplied by the Clock port: the database never defaults it with now() (ADR-010). */
  created_at: Date;
  /** A Date, or a canonical UTC string when sub-millisecond digits must be kept (DEC-023). */
  expires_at: Date | string;
  expiry_source: 'SUPPLIED' | 'DEFAULT';
}

/**
 * Inserts a link. Returns false, and changes nothing, when the code already exists (active or
 * expired: codes are never reassigned, FR-006). `ON CONFLICT DO NOTHING` is used instead of catching
 * a unique violation so a collision does not abort an enclosing transaction.
 */
export async function insertShortLink(db: Queryable, link: NewShortLink): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO short_links (short_code, normalized_url, creator_client_id, created_at, expires_at, expiry_source)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (short_code) DO NOTHING`,
    [link.short_code, link.normalized_url, link.creator_client_id, link.created_at, link.expires_at, link.expiry_source],
  );
  return result.rowCount === 1;
}
