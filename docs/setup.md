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
| T002 | Done | `tests/unit/compose/compose.test.ts` (red: 7 failed, file missing; then passed). Later verified with `docker compose up --wait`: both services healthy; Redis `save` empty and `appendonly no`. |
| T003 | Done | `tests/persistence/schema/schema.test.ts` (red: hook failed, SQL files missing, 11 skipped; then 11 passed against a real postgres:16.2-alpine container). Mutation check: removing the audit REVOKE made 2 tests fail. Compose test extended (red 1 failed, then passed). |
| T004 | Done | `tests/unit/server/health.test.ts` (red: module `src/server.ts` missing, whole file failed; then 16 passed). `/healthz`, `/readyz`, `/metrics` per contract; Ajv strict settings (ADR-002); JSON logs with server-minted `request_id`, no peer address. `/metrics` is a comment-only stub (no collectors). |

## Local dependencies (T002)

1. `cp .env.example .env` and replace the placeholder passwords.
2. `docker compose up -d` starts PostgreSQL 16.2 and Redis 7.2 on loopback (5432, 6379).
3. `docker compose ps` shows health status. Redis is ephemeral (`--save ""`, `--appendonly no`).

## Database initialization (T003)

`docker/init-db/001-schema.sql` creates both planes' schema; `002-roles.sql` creates `shortener_app` and `orchestrator_app` (DML only; audit tables INSERT-only; each role may connect only to its own database). Scripts run once, on first start of an empty data volume. No migration role exists (DEC-095); schema changes mean re-initializing the disposable local volume. Database `urlshortener` (DEC-113) is the shortener database that `data-model.md` calls `shortener`. Scope so far: application-plane tables plus `workflow_runs` and `audit_events`; the other control-plane tables arrive with the orchestrator tasks.

Image tags are the human-confirmed examples from DEC-098. The authoring note recommends the latest 16.x patch; the exact tags and digests were deferred to CP-1 and are not yet recorded.

## Server skeleton (T004)

Files: `src/server.ts` (`buildServer`, `start`), `src/health.ts`, `src/logger.ts` (paths per approved tasks.md). `start()` binds to 127.0.0.1:8080 by default. There is no npm start script yet. `/readyz` reports ready with an empty checks map until persistence checks are registered by later tasks. The client-supplied `X-Request-Id` header is ignored; the server mints the correlation ID.
