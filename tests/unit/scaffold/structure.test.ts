import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');

describe('T001 project scaffold', () => {
  it('[NFR-004] ADR-016 plane and kernel directories exist', () => {
    for (const d of [
      'src/kernel',
      'src/shortener/domain',
      'src/shortener/app',
      'src/shortener/adapters',
      'src/orchestrator/domain',
      'src/orchestrator/governance',
      'src/orchestrator/reliability',
      'src/orchestrator/agents',
      'src/orchestrator/observability',
      'src/orchestrator/adapters',
      'tests',
    ]) {
      expect(existsSync(d), d).toBe(true);
    }
  });

  it('[ADR-001] ESM package on Node >=20 with a committed lock file', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.type).toBe('module');
    expect(pkg.engines.node).toBe('>=20');
    expect(existsSync('package-lock.json')).toBe(true);
  });

  it('[ADR-001] tsconfig is strict', () => {
    const ts = JSON.parse(read('tsconfig.json'));
    expect(ts.compilerOptions.strict).toBe(true);
  });

  it('[NFR-009] npm scripts expose test, lint and typecheck', () => {
    const { scripts } = JSON.parse(read('package.json'));
    expect(scripts.test).toContain('vitest');
    expect(scripts.lint).toContain('eslint');
    expect(scripts.typecheck).toContain('tsc');
  });

  it('[NFR-004] ESLint enforces plane separation and import direction (ADR-016)', () => {
    const cfg = read('eslint.config.js');
    expect(cfg).toContain('no-restricted-imports');
    expect(cfg).toContain('src/shortener');
    expect(cfg).toContain('src/orchestrator');
  });

  it('[ADR-012] Vitest config covers tests/**', () => {
    expect(read('vitest.config.ts')).toContain('tests/**/*.test.ts');
  });
});
