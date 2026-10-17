import tseslint from 'typescript-eslint';

const restrict = (patterns) => ({
  'no-restricted-imports': ['error', { patterns }],
});

// ADR-016: planes share no domain code; adapters depend on domain, never the reverse.
export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/', '.claude/'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/shortener/**/*.ts'],
    rules: restrict([
      { group: ['**/orchestrator/**'], message: 'src/shortener must not import src/orchestrator (ADR-016).' },
    ]),
  },
  {
    files: ['src/orchestrator/**/*.ts'],
    rules: restrict([
      { group: ['**/shortener/**'], message: 'src/orchestrator must not import src/shortener (ADR-016).' },
    ]),
  },
  {
    files: ['src/shortener/domain/**/*.ts', 'src/orchestrator/domain/**/*.ts'],
    rules: restrict([
      { group: ['**/adapters/**'], message: 'Domain must not depend on adapters (ADR-016).' },
      { group: ['**/orchestrator/**', '**/shortener/**'], message: 'Planes share no domain code (ADR-016).' },
    ]),
  },
  {
    files: ['src/kernel/**/*.ts'],
    rules: restrict([
      { group: ['**/shortener/**', '**/orchestrator/**'], message: 'Kernel must not depend on a plane (ADR-016).' },
    ]),
  },
);
