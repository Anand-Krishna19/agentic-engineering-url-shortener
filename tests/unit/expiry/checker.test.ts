import { describe, expect, it } from 'vitest';
import { SimulatedClock, type Clock } from '../../../src/kernel/clock/clock.js';
import {
  ABSENT,
  DEFAULT_EXPIRY_DAYS,
  MAX_EXPIRY_DAYS,
  canonicalizeExpiry,
  isExpired,
  resolveExpiry,
  validateExpiryRange,
  type CanonicalExpiry,
} from '../../../src/shortener/domain/expiry/checker.js';

const NOW = '2026-10-17T00:00:00Z';
const canon = (v: unknown): CanonicalExpiry => {
  const r = canonicalizeExpiry(v);
  if (!r.ok || r.expiry === ABSENT) throw new Error(`expected a canonical expiry for ${String(v)}`);
  return r.expiry;
};

describe('T010 canonicalization is absolute RFC 3339 only and clock-independent (FR-010, DEC-023, DEC-024)', () => {
  it('[DEC-023] omission is the explicit sentinel ABSENT; two omissions match', () => {
    expect(canonicalizeExpiry(undefined)).toEqual({ ok: true, expiry: ABSENT });
    expect(canonicalizeExpiry(undefined)).toEqual(canonicalizeExpiry(undefined));
  });

  it('[DEC-023] offset-equivalent instants canonicalize to the same UTC string', () => {
    const z = canon('2027-01-31T12:00:00Z');
    expect(z.canonical).toBe('2027-01-31T12:00:00Z');
    expect(canon('2027-01-31T13:00:00+01:00')).toEqual(z);
    expect(canon('2027-01-31T07:00:00-05:00')).toEqual(z);
    expect(canon('2027-01-31T17:30:00+05:30')).toEqual(z);
    expect(canon('2027-01-31t12:00:00z')).toEqual(z); // RFC 3339 allows lowercase t and z
  });

  it('[DEC-023] a fractional part appears only when non-zero, trailing zeros removed', () => {
    expect(canon('2027-01-31T12:00:00.000Z').canonical).toBe('2027-01-31T12:00:00Z');
    expect(canon('2027-01-31T12:00:00.500Z').canonical).toBe('2027-01-31T12:00:00.5Z');
    expect(canon('2027-01-31T12:00:00.120000Z').canonical).toBe('2027-01-31T12:00:00.12Z');
    expect(canon('2027-01-31T12:00:00.123456Z').canonical).toBe('2027-01-31T12:00:00.123456Z');
    expect(canon('2027-01-31T12:00:00.5Z')).toEqual(canon('2027-01-31T12:00:00.500000Z'));
  });

  it('[DEC-023] an offset that crosses midnight or a year boundary is converted correctly', () => {
    expect(canon('2027-01-01T00:30:00+01:00').canonical).toBe('2026-12-31T23:30:00Z');
    expect(canon('2026-12-31T23:30:00-01:00').canonical).toBe('2027-01-01T00:30:00Z');
  });

  it('[PA-010] more than six fractional digits is rejected, never rounded', () => {
    expect(canonicalizeExpiry('2027-01-31T12:00:00.1234567Z')).toEqual({ ok: false, reason: 'malformed_request' });
  });

  it.each([
    '',
    ' ',
    'tomorrow',
    '2027-01-31',
    '2027-01-31T12:00:00',
    '2027-01-31T12:00Z',
    '2027-01-31 12:00:00Z',
    '1798718400',
    'PT1H',
    '+30d',
    '30',
    '2027-01-31T12:00:00.Z',
    '2027-01-31T12:00:00+0100',
    '2027-01-31T12:00:00 Z',
    ' 2027-01-31T12:00:00Z',
    '2027-01-31T12:00:00Z ',
    '2027-13-01T00:00:00Z',
    '2027-00-10T00:00:00Z',
    '2027-02-29T00:00:00Z',
    '2027-04-31T00:00:00Z',
    '2027-01-32T00:00:00Z',
    '2027-01-31T24:00:00Z',
    '2027-01-31T12:60:00Z',
    '2027-01-31T12:00:60Z',
    '2027-01-31T12:00:00+24:00',
    '2027-01-31T12:00:00+01:60',
    '２０２７-01-31T12:00:00Z',
  ])('[FR-010] %j is malformed_request', (v) => {
    expect(canonicalizeExpiry(v)).toEqual({ ok: false, reason: 'malformed_request' });
  });

  it.each([null, 0, 1798718400, true, {}, [], ['2027-01-31T12:00:00Z']])('[FR-010] non-string %j is malformed_request', (v) => {
    expect(canonicalizeExpiry(v)).toEqual({ ok: false, reason: 'malformed_request' });
  });

  it('[DEC-023] leap day 2028-02-29 is valid, and 2027-02-29 is not', () => {
    expect(canon('2028-02-29T00:00:00Z').canonical).toBe('2028-02-29T00:00:00Z');
  });

  it('[DEC-023] canonicalization takes no clock: it cannot depend on the time', () => {
    expect(canonicalizeExpiry.length).toBe(1);
    const a = canonicalizeExpiry('2027-01-31T12:00:00Z');
    const b = canonicalizeExpiry('2027-01-31T12:00:00Z');
    expect(a).toEqual(b);
  });
});

describe('T010 range check: now < expires_at <= now + 365 days (DEC-024)', () => {
  const clock = new SimulatedClock(NOW);
  const check = (v: string) => validateExpiryRange(canon(v), clock);

  it('[DEC-024] the bounds are 30 days default and 365 days maximum', () => {
    expect(DEFAULT_EXPIRY_DAYS).toBe(30);
    expect(MAX_EXPIRY_DAYS).toBe(365);
  });

  it('[DEC-024] the lower bound is exclusive, to the microsecond', () => {
    expect(check('2026-10-17T00:00:00Z')).toEqual({ ok: false, reason: 'expiry_out_of_range' });
    expect(check('2026-10-16T23:59:59.999999Z')).toEqual({ ok: false, reason: 'expiry_out_of_range' });
    expect(check('2026-10-17T00:00:00.000001Z')).toEqual({ ok: true });
  });

  it('[DEC-024] the upper bound is inclusive: exactly now + 365 days passes, one microsecond more fails', () => {
    expect(check('2027-10-17T00:00:00Z')).toEqual({ ok: true });
    expect(check('2027-10-17T00:00:00.000001Z')).toEqual({ ok: false, reason: 'expiry_out_of_range' });
  });

  it('[DEC-024] timezone offsets are judged as instants, not as local wall times', () => {
    expect(check('2026-10-17T01:00:00+01:00')).toEqual({ ok: false, reason: 'expiry_out_of_range' }); // == now
    expect(check('2026-10-17T01:00:01+01:00')).toEqual({ ok: true });
    expect(check('2027-10-17T01:00:00+01:00')).toEqual({ ok: true }); // == now + 365d
  });

  it('[ADR-010] the range depends on the injected clock, not the wall clock', () => {
    const later = new SimulatedClock('2027-06-01T00:00:00Z');
    expect(validateExpiryRange(canon('2027-01-31T12:00:00Z'), later)).toEqual({ ok: false, reason: 'expiry_out_of_range' });
    expect(validateExpiryRange(canon('2027-01-31T12:00:00Z'), clock)).toEqual({ ok: true });
  });

  it('[DEC-024] far-past and far-future values are out of range', () => {
    expect(check('1999-01-01T00:00:00Z')).toEqual({ ok: false, reason: 'expiry_out_of_range' });
    expect(check('9999-12-31T23:59:59Z')).toEqual({ ok: false, reason: 'expiry_out_of_range' });
  });
});

describe('T010 default resolution happens once, after the signature match (FR-010, DEC-023)', () => {
  const clockAt = (iso: string) => new SimulatedClock(iso);

  it('[FR-010] ABSENT resolves to now + 30 days, recorded as DEFAULT', () => {
    expect(resolveExpiry(ABSENT, clockAt(NOW))).toEqual({ expiresAt: '2026-11-16T00:00:00Z', source: 'DEFAULT' });
  });

  it('[FR-010] the default keeps the clock instant precision and is computed from the injected clock', () => {
    expect(resolveExpiry(ABSENT, clockAt('2026-10-17T00:00:00.123Z'))).toEqual({
      expiresAt: '2026-11-16T00:00:00.123Z',
      source: 'DEFAULT',
    });
    expect(resolveExpiry(ABSENT, clockAt('2026-12-15T08:00:00Z')).expiresAt).toBe('2027-01-14T08:00:00Z');
  });

  it('[FR-010] a supplied expiry is persisted as its canonical string and never reads the clock', () => {
    let reads = 0;
    const spy: Clock = {
      kind: 'SIMULATED',
      now: () => {
        reads++;
        return new Date(0);
      },
    };
    expect(resolveExpiry(canon('2027-01-31T13:00:00+01:00'), spy)).toEqual({ expiresAt: '2027-01-31T12:00:00Z', source: 'SUPPLIED' });
    expect(reads).toBe(0);
  });

  it('[DEC-023] two resolutions at different times differ for ABSENT only: the default is not part of the signature', () => {
    const a = resolveExpiry(ABSENT, clockAt(NOW)).expiresAt;
    const b = resolveExpiry(ABSENT, clockAt('2026-10-18T00:00:00Z')).expiresAt;
    expect(a).not.toBe(b);
    expect(canonicalizeExpiry(undefined)).toEqual({ ok: true, expiry: ABSENT }); // identical before and after the clock moved
  });

  it('[FR-010] a resolved default always passes the range check', () => {
    const clock = clockAt(NOW);
    const { expiresAt } = resolveExpiry(ABSENT, clock);
    expect(validateExpiryRange(canon(expiresAt), clock)).toEqual({ ok: true });
  });
});

describe('T010 expired decision: one rule, now >= expires_at (FR-010, FR-011)', () => {
  const expiresAt = new Date('2026-11-16T00:00:00.000Z');

  it('[FR-011] exactly at the expiry instant the link is expired', () => {
    expect(isExpired(expiresAt, new SimulatedClock('2026-11-16T00:00:00.000Z'))).toBe(true);
  });

  it('[FR-011] one millisecond before the instant it is still active; one after it is expired', () => {
    expect(isExpired(expiresAt, new SimulatedClock('2026-11-15T23:59:59.999Z'))).toBe(false);
    expect(isExpired(expiresAt, new SimulatedClock('2026-11-16T00:00:00.001Z'))).toBe(true);
  });

  it('[FR-011] the decision is consistent for repeated and concurrent evaluations at the boundary', async () => {
    const clock = new SimulatedClock('2026-11-16T00:00:00.000Z');
    const decisions = await Promise.all(Array.from({ length: 200 }, async () => isExpired(expiresAt, clock)));
    expect(new Set(decisions)).toEqual(new Set([true]));
    clock.set('2026-11-15T23:59:59.999Z');
    const before = await Promise.all(Array.from({ length: 200 }, async () => isExpired(expiresAt, clock)));
    expect(new Set(before)).toEqual(new Set([false]));
  });

  it('[FR-010] a default link is active until exactly 30 days after creation and expired from then on', () => {
    const created = new SimulatedClock(NOW);
    const { expiresAt: stored } = resolveExpiry(ABSENT, created);
    const at = new Date(stored);
    created.set('2026-11-15T23:59:59.999Z');
    expect(isExpired(at, created)).toBe(false);
    created.set('2026-11-16T00:00:00Z');
    expect(isExpired(at, created)).toBe(true);
  });

  it('[ADR-010] the decision uses the injected clock only', () => {
    const farFuture = new Date('2999-01-01T00:00:00Z');
    expect(isExpired(farFuture, new SimulatedClock('2026-01-01T00:00:00Z'))).toBe(false);
    expect(isExpired(new Date('2000-01-01T00:00:00Z'), new SimulatedClock('1999-01-01T00:00:00Z'))).toBe(false);
  });
});
