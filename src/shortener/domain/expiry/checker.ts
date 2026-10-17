import type { Clock } from '../../../kernel/clock/clock.js';

// Link expiry (FR-010, FR-011, DEC-006, DEC-023, DEC-024, PA-010; ADR-010).
//
// Canonicalization is clock-independent, so it can feed the idempotency signature (DEC-023). Everything
// that needs the time takes the injected Clock port: the range check, the 30-day default, and the
// expired decision.

/** Sentinel for an omitted `expires_at`; two requests that both omit it match (DEC-023). */
export const ABSENT = 'ABSENT' as const;
export const DEFAULT_EXPIRY_DAYS = 30;
export const MAX_EXPIRY_DAYS = 365;

const MS_PER_DAY = 86_400_000;
const MICROS_PER_DAY = 86_400_000_000n;

/** A supplied expiry as a UTC instant: the canonical string and its exact value in microseconds. */
export interface CanonicalExpiry {
  /** `YYYY-MM-DDTHH:MM:SS[.f]Z`; the fraction only when non-zero, trailing zeros removed. */
  canonical: string;
  epochMicros: bigint;
}

export type ExpiryParseResult = { ok: true; expiry: typeof ABSENT | CanonicalExpiry } | { ok: false; reason: 'malformed_request' };
export type ExpiryRangeResult = { ok: true } | { ok: false; reason: 'expiry_out_of_range' };

export interface ResolvedExpiry {
  /** Canonical UTC string to persist as `expires_at`. */
  expiresAt: string;
  source: 'SUPPLIED' | 'DEFAULT';
}

const malformed = { ok: false, reason: 'malformed_request' } as const;
const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?([Zz]|[+-]\d{2}:\d{2})$/;

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysIn = (y: number, m: number) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;

function format(utcSeconds: number, micros: number): string | null {
  const iso = new Date(utcSeconds * 1000).toISOString(); // YYYY-MM-DDTHH:MM:SS.sssZ, or +YYYYYY for years over 9999
  if (iso[0] === '+' || iso[0] === '-') return null;
  const frac = micros === 0 ? '' : `.${String(micros).padStart(6, '0').replace(/0+$/, '')}`;
  return `${iso.slice(0, 19)}${frac}Z`;
}

/**
 * Parses `expires_at`: omitted means ABSENT; a supplied value must be an absolute RFC 3339 timestamp with
 * an offset. Relative forms and anything else are malformed. More than six fractional digits is rejected,
 * never rounded (PA-010). A leap second (`:60`) is rejected: it has no unambiguous instant.
 * The shape-level reason `malformed_request` is used for all of these (PA-010 sets the precedent).
 */
export function canonicalizeExpiry(input: unknown): ExpiryParseResult {
  if (input === undefined) return { ok: true, expiry: ABSENT };
  if (typeof input !== 'string') return malformed;
  const m = RFC3339.exec(input);
  if (!m) return malformed;

  const [year, month, day, hour, minute, second] = [m[1], m[2], m[3], m[4], m[5], m[6]].map(Number) as [number, number, number, number, number, number];
  const fraction = m[7] ?? '';
  const zone = m[8]!;
  if (fraction.length > 6) return malformed;
  if (month < 1 || month > 12 || day < 1 || day > daysIn(year, month)) return malformed;
  if (hour > 23 || minute > 59 || second > 59) return malformed;

  let offsetSeconds = 0;
  if (zone.toUpperCase() !== 'Z') {
    const oh = Number(zone.slice(1, 3));
    const om = Number(zone.slice(4, 6));
    if (oh > 23 || om > 59) return malformed;
    offsetSeconds = (zone[0] === '-' ? -1 : 1) * (oh * 3600 + om * 60);
  }

  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, 0);
  const utcSeconds = local.getTime() / 1000 - offsetSeconds;
  const micros = Number(fraction.padEnd(6, '0'));
  const canonical = format(utcSeconds, micros);
  if (canonical === null) return malformed; // converts outside years 0000-9999
  return { ok: true, expiry: { canonical, epochMicros: BigInt(utcSeconds) * 1_000_000n + BigInt(micros) } };
}

/** `now < expires_at <= now + 365 days`, judged on the instant with the injected clock (DEC-024). */
export function validateExpiryRange(expiry: CanonicalExpiry, clock: Clock): ExpiryRangeResult {
  const nowMicros = BigInt(clock.now().getTime()) * 1000n;
  const ok = expiry.epochMicros > nowMicros && expiry.epochMicros <= nowMicros + BigInt(MAX_EXPIRY_DAYS) * MICROS_PER_DAY;
  return ok ? { ok: true } : { ok: false, reason: 'expiry_out_of_range' };
}

/**
 * Resolves the value to persist. The 30-day default is computed here, from the injected clock, only
 * after any idempotency signature match and on first execution only (FR-010, DEC-023). A supplied
 * expiry never reads the clock.
 */
export function resolveExpiry(expiry: typeof ABSENT | CanonicalExpiry, clock: Clock): ResolvedExpiry {
  if (expiry !== ABSENT) return { expiresAt: expiry.canonical, source: 'SUPPLIED' };
  const ms = clock.now().getTime() + DEFAULT_EXPIRY_DAYS * MS_PER_DAY;
  const seconds = Math.floor(ms / 1000);
  return { expiresAt: format(seconds, (ms - seconds * 1000) * 1000)!, source: 'DEFAULT' };
}

/**
 * The single expiry rule, used by every read path (FR-011): a link is expired when `now >= expires_at`.
 * At the exact instant the link is already expired, so concurrent readers at the boundary agree.
 */
export function isExpired(expiresAt: Date, clock: Clock): boolean {
  return clock.now().getTime() >= expiresAt.getTime();
}
