import { canonicalizeExpiry, validateExpiryRange } from '../../domain/expiry/checker.js';
import { computeSignature } from '../../domain/idempotency/signature.js';
import { validateUrl } from '../../domain/url/validator.js';
import { executeCreation, problem, type CreateLinkDeps, type HttpResult } from './service.js';

// POST /v1/links: request validation in the approved order (data-model.md 2.3), then idempotent creation.
// Everything here runs before any idempotency record exists (validation-class, DEC-033, DEC-036).

export interface CreateLinkRequest {
  body: unknown;
  /** Raw header value; absent, or any value that is not one valid string, is judged here. */
  idempotencyKey: string | string[] | undefined;
  clientId: string;
  requestId: string;
}

const KEY_PATTERN = /^[\x21-\x7E]{1,128}$/; // 1 to 128 visible ASCII characters (PA-004)
// DEC-024: relative expiry fields ("ttl_seconds, expires_in, or similar") are unsupported, not merely unknown.
const RELATIVE_EXPIRY_FIELD = /^(ttl|expires_in|expires_after|expiry_(seconds|minutes|hours|days)|ttl_(seconds|minutes|hours|days))$/;

export async function handleCreateLink(deps: CreateLinkDeps, req: CreateLinkRequest): Promise<HttpResult> {
  const reject = (reason: Parameters<typeof problem>[1]) => problem(400, reason, req.requestId);

  let key: string | undefined;
  if (req.idempotencyKey !== undefined) {
    if (typeof req.idempotencyKey !== 'string' || !KEY_PATTERN.test(req.idempotencyKey)) return reject('invalid_idempotency_key');
    key = req.idempotencyKey;
  }

  // Request shape: a JSON object with only `url` and `expires_at`.
  const body = req.body;
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return reject('malformed_request');
  const fields = body as Record<string, unknown>;
  const names = Object.keys(fields);
  if (names.some((n) => RELATIVE_EXPIRY_FIELD.test(n))) return reject('unsupported_expiry_representation');
  if (names.some((n) => n !== 'url' && n !== 'expires_at')) return reject('malformed_request');
  if (typeof fields.url !== 'string') return reject('malformed_request');

  // URL checks, in order: length, parse, scheme, host, user info, control characters, destination policy.
  const url = validateUrl(fields.url, { publicBaseUrl: deps.publicBaseUrl });
  if (!url.ok) return reject(url.reason);

  // Expiry: absolute RFC 3339 only, then now < expires_at <= now + 365 days.
  const parsed = canonicalizeExpiry('expires_at' in fields ? fields.expires_at : undefined);
  if (!parsed.ok) return reject(parsed.reason);
  if (typeof parsed.expiry !== 'string') {
    const range = validateExpiryRange(parsed.expiry, deps.clock);
    if (!range.ok) return reject(range.reason);
  }

  return executeCreation(deps, {
    clientId: req.clientId,
    key,
    signature: computeSignature({ url: url.normalized, expiry: parsed.expiry }),
    normalizedUrl: url.normalized,
    expiry: parsed.expiry,
    requestId: req.requestId,
  });
}
