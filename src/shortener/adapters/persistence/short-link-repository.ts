// Short link persistence (ADR-003: `pg`, hand-written parameterized SQL behind a repository, no ORM).

/** Anything with a pg-style `query`: a Client, a transaction client, or a test double. */
export interface Queryable {
  query(text: string, values: unknown[]): Promise<{ rowCount: number | null }>;
}

export interface NewShortLink {
  short_code: string;
  normalized_url: string;
  creator_client_id: string;
  expires_at: Date;
  expiry_source: 'SUPPLIED' | 'DEFAULT';
}

/**
 * Inserts a link. Returns false, and changes nothing, when the code already exists (active or
 * expired: codes are never reassigned, FR-006). `ON CONFLICT DO NOTHING` is used instead of catching
 * a unique violation so a collision does not abort an enclosing transaction.
 */
export async function insertShortLink(db: Queryable, link: NewShortLink): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO short_links (short_code, normalized_url, creator_client_id, expires_at, expiry_source)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (short_code) DO NOTHING`,
    [link.short_code, link.normalized_url, link.creator_client_id, link.expires_at, link.expiry_source],
  );
  return result.rowCount === 1;
}
