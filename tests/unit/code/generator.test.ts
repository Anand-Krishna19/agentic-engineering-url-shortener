import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CodeGenerationExhaustedError,
  MAX_CODE_ATTEMPTS,
  SHORT_CODE_ALPHABET,
  SHORT_CODE_LENGTH,
  generateShortCode,
  insertWithUniqueCode,
  isShortCode,
  type InsertOutcome,
} from '../../../src/shortener/domain/code/generator.js';

/** Deterministic RandomInt that emits the given codes character by character. */
function randomFrom(codes: string[]) {
  const chars = codes.join('');
  let i = 0;
  const calls: number[] = [];
  const fn = (max: number) => {
    calls.push(max);
    const c = chars[i++ % chars.length]!;
    return SHORT_CODE_ALPHABET.indexOf(c);
  };
  return Object.assign(fn, { calls });
}

describe('T007 code format (FR-007, ASM-015, ADR-017)', () => {
  it('[FR-007] alphabet is exactly base62 (A-Z, a-z, 0-9), 62 distinct symbols; length is 7', () => {
    expect(SHORT_CODE_ALPHABET).toHaveLength(62);
    expect(new Set(SHORT_CODE_ALPHABET).size).toBe(62);
    expect(SHORT_CODE_ALPHABET).toMatch(/^[A-Za-z0-9]{62}$/);
    expect(SHORT_CODE_LENGTH).toBe(7);
  });

  it('[FR-007] every generated code is 7 base62 characters', () => {
    for (let i = 0; i < 1000; i++) expect(generateShortCode()).toMatch(/^[0-9A-Za-z]{7}$/);
  });

  it('[FR-007] all 62 symbols occur, and both cases (case-sensitive alphabet)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i++) for (const c of generateShortCode()) seen.add(c);
    expect(seen.size).toBe(62);
  });

  it('[FR-007] draws one uniform integer in [0, 62) per character through the injected source', () => {
    const rnd = randomFrom(['AbC0z9Q']);
    expect(generateShortCode(rnd)).toBe('AbC0z9Q');
    expect(rnd.calls).toEqual(new Array(7).fill(62));
  });

  it('[FR-007] the default random source is node:crypto, never Math.random', () => {
    const src = readFileSync('src/shortener/domain/code/generator.ts', 'utf8');
    expect(src).toMatch(/from 'node:crypto'/);
    expect(src).not.toMatch(/Math\.random/);
  });

  it('[ADR-017] isShortCode accepts exactly 7 base62 characters, case-sensitively', () => {
    expect(isShortCode('Ab3Zz09')).toBe(true);
    expect(isShortCode('abc1234')).toBe(true);
    for (const bad of ['', 'Ab3Zz0', 'Ab3Zz098', 'Ab3Zz0!', 'Ab3Zz0_', 'Ab3 Zz0', 'Ab3Zz09\n', 'Ab3Zz0é', 'Ａb3Zz09']) {
      expect(isShortCode(bad), JSON.stringify(bad)).toBe(false);
    }
    for (const bad of [undefined, null, 1234567, {}, ['Ab3Zz09']]) expect(isShortCode(bad)).toBe(false);
  });
});

describe('T007 collision handling (FR-006, FR-007, PA-008, ADR-017)', () => {
  const ok = (value: string): InsertOutcome<string> => ({ inserted: true, value });
  const taken: InsertOutcome<string> = { inserted: false };

  it('[FR-007] the bound is exactly 3 attempts', () => {
    expect(MAX_CODE_ATTEMPTS).toBe(3);
  });

  it('[FR-007] succeeds on the first attempt when the code is free', async () => {
    const r = await insertWithUniqueCode(async (code) => ok(`stored:${code}`), { randomInt: randomFrom(['AAAAAAA']) });
    expect(r).toEqual({ code: 'AAAAAAA', value: 'stored:AAAAAAA', attempts: 1 });
  });

  it('[FR-007] on a collision retries with a new code and succeeds', async () => {
    const tried: string[] = [];
    const r = await insertWithUniqueCode(
      async (code) => {
        tried.push(code);
        return tried.length === 1 ? taken : ok(code);
      },
      { randomInt: randomFrom(['AAAAAAA', 'BBBBBBB']) },
    );
    expect(tried).toEqual(['AAAAAAA', 'BBBBBBB']);
    expect(r).toEqual({ code: 'BBBBBBB', value: 'BBBBBBB', attempts: 2 });
  });

  it('[FR-007] succeeds on the third (last) attempt', async () => {
    let n = 0;
    const r = await insertWithUniqueCode(async (code) => (++n < 3 ? taken : ok(code)), {
      randomInt: randomFrom(['AAAAAAA', 'BBBBBBB', 'CCCCCCC']),
    });
    expect(r.attempts).toBe(3);
    expect(r.code).toBe('CCCCCCC');
  });

  it('[FR-007][PA-008] after 3 collisions it stops and fails with a transient error', async () => {
    const tried: string[] = [];
    const p = insertWithUniqueCode(
      async (code) => {
        tried.push(code);
        return taken;
      },
      { randomInt: randomFrom(['AAAAAAA', 'BBBBBBB', 'CCCCCCC', 'DDDDDDD']) },
    );
    await expect(p).rejects.toBeInstanceOf(CodeGenerationExhaustedError);
    expect(tried).toEqual(['AAAAAAA', 'BBBBBBB', 'CCCCCCC']); // never a fourth attempt
    const err = (await p.then(
      () => undefined,
      (e: unknown) => e,
    )) as CodeGenerationExhaustedError;
    expect(err.transient).toBe(true); // 503, no FAILED idempotency record (PA-008, DEC-033)
    expect(err.attempts).toBe(3);
    for (const t of tried) expect(err.message).not.toContain(t); // the error never echoes a code
  });

  it('[FR-007] a non-collision failure propagates immediately without retrying', async () => {
    let calls = 0;
    const boom = new Error('connection terminated');
    await expect(
      insertWithUniqueCode(async () => {
        calls++;
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(calls).toBe(1);
  });

  it('[FR-006] each attempt uses a freshly generated code from the default CSPRNG', async () => {
    const tried: string[] = [];
    await expect(
      insertWithUniqueCode(async (code) => {
        tried.push(code);
        return taken;
      }),
    ).rejects.toBeInstanceOf(CodeGenerationExhaustedError);
    expect(tried).toHaveLength(3);
    expect(new Set(tried).size).toBe(3);
    for (const t of tried) expect(isShortCode(t)).toBe(true);
  });
});
