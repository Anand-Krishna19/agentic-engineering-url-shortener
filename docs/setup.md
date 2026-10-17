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
| T002 | Done (static validation only) | `tests/unit/compose/compose.test.ts` (red: 7 failed, missing file; then 7 passed); `docker compose --env-file .env.example config` resolves. Containers were NOT started: the Docker daemon was not running, so health checks are unexercised. |

## Local dependencies (T002)

1. `cp .env.example .env` and replace the placeholder passwords.
2. `docker compose up -d` starts PostgreSQL 16.2 and Redis 7.2 on loopback (5432, 6379).
3. `docker compose ps` shows health status. Redis is ephemeral (`--save ""`, `--appendonly no`).

Image tags are the human-confirmed examples from DEC-098. The authoring note recommends the latest 16.x patch; the exact tags and digests were deferred to CP-1 and are not yet recorded.
