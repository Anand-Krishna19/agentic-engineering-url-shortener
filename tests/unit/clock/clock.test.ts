import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { SimulatedClock, WallClock, type Clock } from '../../../src/kernel/clock/clock.js';

describe('T010 Clock port (ADR-010)', () => {
  it('[ADR-010] WallClock reports kind WALL and the current time', () => {
    const c: Clock = new WallClock();
    expect(c.kind).toBe('WALL');
    const before = Date.now();
    const t = c.now().getTime();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(Date.now());
  });

  it('[ADR-010] SimulatedClock reports kind SIMULATED and only moves when told to', () => {
    const c = new SimulatedClock('2026-10-17T00:00:00Z');
    expect(c.kind).toBe('SIMULATED');
    expect(c.now().toISOString()).toBe('2026-10-17T00:00:00.000Z');
    expect(c.now().toISOString()).toBe('2026-10-17T00:00:00.000Z');
    c.advance(90_000);
    expect(c.now().toISOString()).toBe('2026-10-17T00:01:30.000Z');
    c.set('2027-01-01T00:00:00Z');
    expect(c.now().toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('[ADR-010] now() returns a copy: mutating it cannot move the clock', () => {
    const c = new SimulatedClock('2026-10-17T00:00:00Z');
    c.now().setUTCFullYear(2000);
    expect(c.now().toISOString()).toBe('2026-10-17T00:00:00.000Z');
  });

  it('[ADR-010] SimulatedClock rejects an invalid start time', () => {
    expect(() => new SimulatedClock('not a date')).toThrow();
  });
});

describe('T010 ESLint enforces the Clock port (ADR-010)', () => {
  const eslint = new ESLint();
  const lint = async (code: string, filePath: string) => (await eslint.lintText(code, { filePath }))[0]!.messages;

  it('[ADR-010] Date.now() and new Date() are rejected in application code', async () => {
    for (const code of ['export const a = Date.now();\n', 'export const b = new Date();\n']) {
      const msgs = await lint(code, 'src/shortener/domain/expiry/x.ts');
      expect(msgs.some((m) => m.ruleId === 'no-restricted-syntax'), code).toBe(true);
    }
  });

  it('[ADR-010] parsing or constructing a Date from a value is allowed', async () => {
    const msgs = await lint('export const a = new Date(0);\nexport const b = new Date("2026-01-01T00:00:00Z");\n', 'src/shortener/domain/expiry/x.ts');
    expect(msgs.filter((m) => m.ruleId === 'no-restricted-syntax')).toEqual([]);
  });

  it('[ADR-010] the wall-clock adapter is the one place allowed to read the clock', async () => {
    const msgs = await lint('export const a = new Date();\nexport const b = Date.now();\n', 'src/kernel/clock/clock.ts');
    expect(msgs.filter((m) => m.ruleId === 'no-restricted-syntax')).toEqual([]);
  });

  it('[ADR-010] the shipped clock module itself passes lint', async () => {
    const [res] = await eslint.lintFiles(['src/kernel/clock/clock.ts']);
    expect(res!.messages).toEqual([]);
  });
});
