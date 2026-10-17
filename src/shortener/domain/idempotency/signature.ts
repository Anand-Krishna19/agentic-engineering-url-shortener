import { createHash } from 'node:crypto';
import { ABSENT, type CanonicalExpiry } from '../expiry/checker.js';

// Request signature (FR-015, DEC-016, DEC-023, DEC-025; data-model.md 4.3 and 4.4).
// It never reads the clock: the default expiry is resolved only after a signature match.

const byCodePoint = (a: string, b: string): number => {
  const x = Array.from(a);
  const y = Array.from(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i]!.codePointAt(0)! - y[i]!.codePointAt(0)!;
    if (d !== 0) return d;
  }
  return x.length - y.length;
};

/** Canonical JSON: keys sorted by Unicode code point, UTF-8, no insignificant whitespace. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort(byCodePoint)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export interface SignatureInput {
  /** The FR-002 normalized URL, never the raw input (DEC-025). */
  url: string;
  expiry: typeof ABSENT | CanonicalExpiry;
  /** Absent and empty both canonicalize to `{}`. Before CR-001 every request carries `{}`. */
  metadata?: Record<string, unknown>;
}

export function computeSignature(input: SignatureInput): string {
  const canonical = canonicalJson({
    expiry: input.expiry === ABSENT ? ABSENT : input.expiry.canonical,
    metadata: input.metadata ?? {},
    url: input.url,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
