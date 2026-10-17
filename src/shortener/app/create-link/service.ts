import type { Clock } from '../../../kernel/clock/clock.js';
import { CodeGenerationExhaustedError } from '../../domain/code/generator.js';
import { ABSENT, resolveExpiry, type CanonicalExpiry } from '../../domain/expiry/checker.js';

// Idempotent link creation (FR-001, FR-015, FR-016, FR-017; DEC-016, DEC-029 to DEC-036; ADR-026, ADR-015).
// All consistency lives in PostgreSQL behind CreateLinkStore; Redis is never needed (it is only an accelerator).

export type Reason =
  | 'invalid_url' | 'url_too_long' | 'unsupported_scheme' | 'forbidden_destination' | 'malformed_request'
  | 'invalid_idempotency_key' | 'expiry_out_of_range' | 'unsupported_expiry_representation'
  | 'idempotency_key_conflict' | 'idempotency_request_in_progress' | 'persistence_unavailable'
  | 'request_superseded' | 'internal_error' | 'not_found' | 'link_expired';

const TITLES: Record<Reason, string> = {
  invalid_url: 'Invalid URL',
  url_too_long: 'URL too long',
  unsupported_scheme: 'Unsupported URL scheme',
  forbidden_destination: 'Forbidden destination',
  malformed_request: 'Malformed request',
  invalid_idempotency_key: 'Invalid Idempotency-Key',
  expiry_out_of_range: 'Expiry out of range',
  unsupported_expiry_representation: 'Relative expiry is not supported',
  idempotency_key_conflict: 'Idempotency key reused with a different request signature',
  idempotency_request_in_progress: 'Request in progress',
  persistence_unavailable: 'Persistence unavailable',
  request_superseded: 'Request superseded',
  internal_error: 'Internal error',
  not_found: 'Not found',
  link_expired: 'Link expired',
};

/** Transport-neutral outcome; the Fastify adapter turns it into a response. `body` is JSON text. */
export interface HttpResult {
  status: number;
  body: string;
  replayed?: boolean;
  /** Redirect target for 302 results (the adapter also sets Cache-Control: no-store). */
  location?: string;
  retryAfterSeconds?: number;
}

/** RFC 9457 problem details; never echoes input and never carries internal detail (FR-019). */
export function problem(status: number, reason: Reason, requestId: string, retryAfterSeconds?: number): HttpResult {
  const body = JSON.stringify({ type: `urn:urlshort:problem:${reason}`, title: TITLES[reason], status, reason, request_id: requestId });
  return { status, body, ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }) };
}

export interface LinkDraft {
  normalizedUrl: string;
  creatorClientId: string;
  createdAt: Date;
  /** Canonical UTC string (keeps sub-millisecond digits). */
  expiresAt: string;
  expirySource: 'SUPPLIED' | 'DEFAULT';
}

export interface StoredResponse {
  status: number;
  body: string;
}

export interface ExistingRecord {
  signature: string;
  state: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  responseStatus: number | null;
  responseBody: string | null;
}

export type ClaimResult = { state: 'claimed' } | { state: 'existing'; record: ExistingRecord };

export interface Created {
  code: string;
  response: StoredResponse;
}

export interface CommitInput {
  clientId: string;
  key: string;
  requestId: string;
  link: LinkDraft;
  buildResponse: (code: string) => StoredResponse;
}

export interface CreateLinkStore {
  /** Claims the key (IN_PROGRESS, 60 s lease) or returns the existing record. Lease-expired and retention-expired records count as absent. */
  claim(i: { clientId: string; key: string; signature: string; requestId: string }): Promise<ClaimResult>;
  /**
   * One transaction: insert the short link (with bounded code-collision retry), then the conditional
   * UPDATE of the record (owner, IN_PROGRESS, lease still valid at the Clock's current time). Zero rows
   * rolls everything back and throws RequestSupersededError (DEC-034).
   */
  commitCreated(i: CommitInput): Promise<Created>;
  createWithoutKey(i: { link: LinkDraft; buildResponse: (code: string) => StoredResponse }): Promise<Created>;
  /** Permanent failure: IN_PROGRESS -> FAILED with the stored failure response (DEC-029). */
  failPermanent(i: { clientId: string; key: string; requestId: string; response: StoredResponse }): Promise<void>;
  /** Transient failure: delete this request's IN_PROGRESS record so the key stays usable (DEC-033). */
  release(i: { clientId: string; key: string; requestId: string }): Promise<void>;
}

/** The commit found the record no longer owned by this request or its lease expired (DEC-034, DEC-062). */
export class RequestSupersededError extends Error {
  constructor() {
    super('request superseded');
    this.name = 'RequestSupersededError';
  }
}

const TRANSIENT_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE']);

/** Transient: bounded code retries exhausted, connection-class and serialization/deadlock database errors. */
export function isTransient(error: unknown): boolean {
  if (error instanceof CodeGenerationExhaustedError) return true;
  const e = error as { code?: unknown; message?: unknown } | null;
  const code = typeof e?.code === 'string' ? e.code : '';
  if (TRANSIENT_CODES.has(code) || /^(08|53|57|40)/.test(code)) return true;
  return /connection terminated|timeout|timed out/i.test(String(e?.message ?? ''));
}

export interface CreateLinkDeps {
  store: CreateLinkStore;
  clock: Clock;
  publicBaseUrl: string;
}

export interface CreationInput {
  clientId: string;
  /** Present only when the client sent a valid Idempotency-Key. */
  key?: string;
  signature: string;
  normalizedUrl: string;
  expiry: typeof ABSENT | CanonicalExpiry;
  requestId: string;
}

const RETRY_AFTER_SECONDS = 1;

/** Runs after every validation-class check has passed, so no rejection can leave an idempotency record. */
export async function executeCreation(deps: CreateLinkDeps, input: CreationInput): Promise<HttpResult> {
  const { store, clock } = deps;
  const base = deps.publicBaseUrl.replace(/\/+$/, '');
  const unavailable = () => problem(503, 'persistence_unavailable', input.requestId, RETRY_AFTER_SECONDS);

  const draft = (): { link: LinkDraft; buildResponse: (code: string) => StoredResponse } => {
    // The default expiry is resolved here: after any signature match, on first execution only (DEC-023).
    const { expiresAt, source } = resolveExpiry(input.expiry, clock);
    const link: LinkDraft = {
      normalizedUrl: input.normalizedUrl,
      creatorClientId: input.clientId,
      createdAt: clock.now(),
      expiresAt,
      expirySource: source,
    };
    const buildResponse = (code: string): StoredResponse => ({
      status: 201,
      body: JSON.stringify({
        short_code: code,
        short_url: `${base}/${code}`,
        original_url: link.normalizedUrl,
        created_at: link.createdAt.toISOString(),
        expires_at: link.expiresAt,
      }),
    });
    return { link, buildResponse };
  };

  if (input.key === undefined) {
    try {
      const { response } = await store.createWithoutKey(draft());
      return { status: response.status, body: response.body };
    } catch (error) {
      return isTransient(error) ? unavailable() : problem(500, 'internal_error', input.requestId);
    }
  }

  const ident = { clientId: input.clientId, key: input.key, requestId: input.requestId };

  let claim: Awaited<ReturnType<CreateLinkStore['claim']>>;
  try {
    claim = await store.claim({ ...ident, signature: input.signature });
  } catch (error) {
    return isTransient(error) ? unavailable() : problem(500, 'internal_error', input.requestId);
  }

  if (claim.state === 'existing') {
    const { record } = claim;
    if (record.signature !== input.signature) return problem(409, 'idempotency_key_conflict', input.requestId);
    if (record.state === 'IN_PROGRESS') return problem(409, 'idempotency_request_in_progress', input.requestId);
    return { status: record.responseStatus!, body: record.responseBody!, replayed: true };
  }

  try {
    const { response } = await store.commitCreated({ ...ident, ...draft() });
    return { status: response.status, body: response.body };
  } catch (error) {
    if (error instanceof RequestSupersededError) {
      return problem(503, 'request_superseded', input.requestId, RETRY_AFTER_SECONDS); // record untouched, no mapping
    }
    if (isTransient(error)) {
      await store.release(ident).catch(() => {}); // the lease will expire anyway if this fails
      return unavailable();
    }
    const failure = problem(500, 'internal_error', input.requestId);
    await store.failPermanent({ ...ident, response: { status: failure.status, body: failure.body } }).catch(() => {});
    return failure;
  }
}
