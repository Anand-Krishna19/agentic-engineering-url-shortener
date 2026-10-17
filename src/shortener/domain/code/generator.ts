import { randomInt as cryptoRandomInt } from 'node:crypto';

// Short code generation and collision handling (FR-006, FR-007, ASM-015, PA-008, DEC-085, ADR-017).
// Codes are 7 characters of case-sensitive base62 drawn from a CSPRNG; uniqueness is enforced by the
// database unique index, and a collision is recovered by a bounded retry with a new code.

export const SHORT_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export const SHORT_CODE_LENGTH = 7;
/** Bound on insert attempts per creation (ADR-017). */
export const MAX_CODE_ATTEMPTS = 3;

/** Returns a uniformly distributed integer in [0, maxExclusive). */
export type RandomInt = (maxExclusive: number) => number;

const defaultRandomInt: RandomInt = (max) => cryptoRandomInt(max);

export function generateShortCode(randomInt: RandomInt = defaultRandomInt): string {
  let code = '';
  for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
    code += SHORT_CODE_ALPHABET[randomInt(SHORT_CODE_ALPHABET.length)];
  }
  return code;
}

/** True only for exactly 7 base62 characters; anything else is answered like an unknown code (ADR-017). */
export const isShortCode = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9A-Za-z]{7}$/.test(value);

/**
 * Every attempt collided. Transient: the caller reports 503 and creates no FAILED idempotency
 * record, so the Idempotency-Key stays usable (PA-008, DEC-033). The message never echoes a code.
 */
export class CodeGenerationExhaustedError extends Error {
  readonly transient = true as const;

  constructor(readonly attempts: number) {
    super(`short code generation exhausted after ${attempts} attempts`);
    this.name = 'CodeGenerationExhaustedError';
  }
}

/** Result of one insert attempt: `inserted: false` means the code is already taken. */
export type InsertOutcome<T> = { inserted: true; value: T } | { inserted: false };

export interface UniqueCodeOptions {
  randomInt?: RandomInt;
}

/**
 * Generates a code and calls `tryInsert` with it, retrying with a fresh code on a collision, at most
 * MAX_CODE_ATTEMPTS times. Any error thrown by `tryInsert` propagates immediately (no retry).
 */
export async function insertWithUniqueCode<T>(
  tryInsert: (code: string) => Promise<InsertOutcome<T>>,
  opts: UniqueCodeOptions = {},
): Promise<{ code: string; value: T; attempts: number }> {
  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateShortCode(opts.randomInt);
    const outcome = await tryInsert(code);
    if (outcome.inserted) return { code, value: outcome.value, attempts: attempt };
  }
  throw new CodeGenerationExhaustedError(MAX_CODE_ATTEMPTS);
}
