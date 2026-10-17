import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ABSENT, canonicalizeExpiry, type CanonicalExpiry } from '../../../src/shortener/domain/expiry/checker.js';
import { canonicalJson, computeSignature } from '../../../src/shortener/domain/idempotency/signature.js';

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const exp = (v: string): CanonicalExpiry => {
  const r = canonicalizeExpiry(v);
  if (!r.ok || r.expiry === ABSENT) throw new Error('bad fixture');
  return r.expiry;
};

describe('T008 canonical JSON (data-model 4.3)', () => {
  it('[DEC-025] sorts keys, no whitespace, nested objects included', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: 'v' } })).toBe('{"a":{"c":"v","d":[3,{"x":2,"y":1}]},"b":1}');
  });

  it('[DEC-025] keys sort by Unicode code point and are case-sensitive', () => {
    expect(canonicalJson({ b: 1, B: 2, a: 3 })).toBe('{"B":2,"a":3,"b":1}');
    expect(canonicalJson({ '\u{1F600}': 1, '～': 2 })).toBe('{"～":2,"\u{1F600}":1}'); // U+FF5E < U+1F600 as code points
  });
});

describe('T008 request signature (FR-015, DEC-016, DEC-023, DEC-025; data-model 4.4)', () => {
  const base = { url: 'https://example.com/a', expiry: ABSENT } as const;

  it('[DEC-025] equals SHA-256 over the canonical JSON of {expiry, metadata, url}, hex encoded', () => {
    expect(computeSignature(base)).toBe(sha('{"expiry":"ABSENT","metadata":{},"url":"https://example.com/a"}'));
    expect(computeSignature(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('[DEC-025] absent metadata equals empty metadata', () => {
    expect(computeSignature({ ...base, metadata: {} })).toBe(computeSignature(base));
  });

  it('[DEC-025] reordered metadata keys give an equal signature; a changed value does not', () => {
    const a = computeSignature({ ...base, metadata: { x: 1, y: { p: 1, q: 2 } } });
    expect(computeSignature({ ...base, metadata: { y: { q: 2, p: 1 }, x: 1 } })).toBe(a);
    expect(computeSignature({ ...base, metadata: { x: 2, y: { p: 1, q: 2 } } })).not.toBe(a);
  });

  it('[DEC-023] offset-equivalent expiries give equal signatures', () => {
    const z = computeSignature({ url: base.url, expiry: exp('2027-01-31T12:00:00Z') });
    expect(computeSignature({ url: base.url, expiry: exp('2027-01-31T13:00:00+01:00') })).toBe(z);
    expect(computeSignature({ url: base.url, expiry: exp('2027-01-31T12:00:00.000Z') })).toBe(z);
  });

  it('[DEC-016] a change in URL, expiry, or metadata changes the signature', () => {
    const s = computeSignature(base);
    expect(computeSignature({ ...base, url: 'https://example.com/b' })).not.toBe(s);
    expect(computeSignature({ ...base, expiry: exp('2027-01-31T12:00:00Z') })).not.toBe(s);
    expect(computeSignature({ ...base, expiry: exp('2027-01-31T12:00:01Z') })).not.toBe(computeSignature({ ...base, expiry: exp('2027-01-31T12:00:00Z') }));
    expect(computeSignature({ ...base, metadata: { k: 'v' } })).not.toBe(s);
  });

  it('[DEC-023] ABSENT is distinct from any supplied instant and the signature takes no clock', () => {
    expect(computeSignature(base)).not.toBe(computeSignature({ ...base, expiry: exp('2027-01-31T12:00:00Z') }));
    expect(computeSignature.length).toBe(1);
  });
});
