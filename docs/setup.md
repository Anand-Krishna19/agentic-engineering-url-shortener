# Setup and validation

Requires Node.js 20 or later (ADR-001).

| Command | Purpose |
|---------|---------|
| `npm ci` | Install from the committed lock file |
| `npm test` | Vitest (all levels, ADR-012) |
| `npm run lint` | ESLint, including ADR-016 plane and import-direction rules |
| `npm run typecheck` | `tsc --noEmit`, strict |

## Implementation status

| Task | Status | Evidence |
|------|--------|----------|
| T001 | Done | `tests/unit/scaffold/structure.test.ts` (red run recorded before implementation: 5 failed, 1 passed; then 6 passed), lint and typecheck clean |
