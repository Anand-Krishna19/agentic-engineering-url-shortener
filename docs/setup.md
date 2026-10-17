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
| T005 | Done | `tests/unit/types/types.test.ts` (red: modules missing; then 15 passed). Drift tests compare every exported vocabulary with `workflow-state.schema.json`, `audit-event.schema.json` and the T003 CHECK constraints. Mutation check: adding a bogus status failed 3 tests. IN_PROGRESS/COMPLETED/FAILED are idempotency states and are defined with T008, not here (tasks.md correction 2026-10-18). |
| T006 | Done | `tests/unit/url/validator.test.ts` (red: module missing; then 125 passed). Mutation checks: removing the userinfo rule failed 6 tests; removing the 100.64.0.0/10 range failed 2. Full suite 181 passed; lint and typecheck clean. |
| T007 | Done | `tests/unit/code/generator.test.ts` (13) and `tests/persistence/code/repository.test.ts` (8, real postgres:16.2-alpine as shortener_app). Red: modules missing. Mutation checks: allowing a 4th attempt failed 3 tests; removing ON CONFLICT failed 6. Full suite 202 passed; lint and typecheck clean. |
| T010 | Done | `tests/unit/clock` (8), `tests/unit/expiry` (57), `tests/unit/analytics` (22) tests; red: `clock.ts` missing, all three files failed. Mutation checks: lower-bound `>` to `>=` failed 2; `now >= expires_at` to `>` failed 3; counting HEAD failed 5. Full suite 289 passed; lint and typecheck clean. |
| T008 | Done | `tests/unit/idempotency/signature.test.ts` (8) and `tests/integration/create/handler.test.ts` (62, real Fastify + postgres:16.2-alpine as shortener_app). Red: modules missing. Mutation checks: removing the lease condition failed 1; the signature comparison 2; the transient release 2; URL validation 10. Full suite 359 passed; lint and typecheck clean. |
| T009 | Done | `tests/integration/redirect/handler.test.ts` (22, real Fastify + postgres:16.2-alpine as shortener_app). Red: `redirect-repository.js` missing. Mutation checks: removing the code-format check failed 1; the expiry check 6; the Location wire encoding 1. Full suite 381 passed; lint and typecheck clean. |

## Local dependencies (T002)

1. `cp .env.example .env` and replace the placeholder passwords.
2. `docker compose up -d` starts PostgreSQL 16.2 and Redis 7.2 on loopback (5432, 6379).
3. `docker compose ps` shows health status. Redis is ephemeral (`--save ""`, `--appendonly no`).

## Database initialization (T003)

`docker/init-db/001-schema.sql` creates both planes' schema; `002-roles.sql` creates `shortener_app` and `orchestrator_app` (DML only; audit tables INSERT-only; each role may connect only to its own database). Scripts run once, on first start of an empty data volume. No migration role exists (DEC-095); schema changes mean re-initializing the disposable local volume. Database `urlshortener` (DEC-113) is the shortener database that `data-model.md` calls `shortener`. Scope so far: application-plane tables plus `workflow_runs` and `audit_events`; the other control-plane tables arrive with the orchestrator tasks.

Image tags are the human-confirmed examples from DEC-098. The authoring note recommends the latest 16.x patch; the exact tags and digests were deferred to CP-1 and are not yet recorded.

## Server skeleton (T004)

Files: `src/server.ts` (`buildServer`, `start`), `src/health.ts`, `src/logger.ts` (paths per approved tasks.md). `start()` binds to 127.0.0.1:8080 by default. There is no npm start script yet. `/readyz` reports ready with an empty checks map until persistence checks are registered by later tasks. The client-supplied `X-Request-Id` header is ignored; the server mints the correlation ID.

## URL validation (T006)

`validateUrl(raw, { publicBaseUrl })` in `src/shortener/domain/url/validator.ts` returns `{ ok: true, normalized }` or `{ ok: false, reason }` with reason `url_too_long`, `invalid_url`, `unsupported_scheme` or `forbidden_destination`, checked in the ADR-027 order. It is synchronous and never resolves DNS (residual risk R-18, DNS rebinding, is not detected). The stored form is built from the raw input with exactly three changes (lowercase scheme and host, default port removed, fragment removed); the URL class is used only to validate and to canonicalize IP forms for the destination check.

Interpretation notes: `scheme:` URLs without `//` (for example `https:example.com`) are `invalid_url`; a `%` in the host is `invalid_url`; non-ASCII characters in the path or query are stored as supplied (no re-encoding, per data-model.md 4.1), which T009 must handle when it emits the `Location` header.

## Short codes (T007)

`src/shortener/domain/code/generator.ts`: `generateShortCode` (7 characters, base62, `node:crypto` `randomInt`), `isShortCode`, and `insertWithUniqueCode`, which retries a collision with a fresh code up to 3 attempts and then throws `CodeGenerationExhaustedError` (`transient: true`). The creation handler (T008) must map that error to HTTP 503 with reason `persistence_unavailable` and must not write a FAILED idempotency record (PA-008, DEC-033).

`src/shortener/adapters/persistence/short-link-repository.ts` (not in T007 Files column; needed by its persistence test) inserts with `ON CONFLICT (short_code) DO NOTHING`, so a collision neither throws nor aborts an enclosing transaction. The unique index and the binary collation come from T003. Persistence tests need Docker; they start a throwaway container.

## Expiry, Clock port and analytics (T010)

`src/kernel/clock/clock.ts`: `Clock` port, `WallClock` (the only place allowed to read the wall clock) and `SimulatedClock`. ESLint (`no-restricted-syntax` in `eslint.config.js`) rejects `Date.now()` and `new Date()` with no arguments everywhere else under `src/` (ADR-010).

`src/shortener/domain/expiry/checker.ts`: `canonicalizeExpiry` is clock-independent (omitted is the sentinel `ABSENT`; a supplied value must be absolute RFC 3339 with an offset and is converted to a UTC canonical string; more than six fractional digits is rejected, PA-010). `validateExpiryRange` enforces `now < expires_at <= now + 365 days` to the microsecond. `resolveExpiry` computes the 30-day default only when called, from the Clock. `isExpired` is the single rule `now >= expires_at`.

`src/shortener/domain/analytics/capture.ts`: `captureRedirect` records the short code and the Clock timestamp only, for GET requests only, in a single attempt bounded by 10 s (PVT-010), and never throws (fail-open). The failure reporter receives the code and a reason (`error` or `timeout`), never error text. The store adapter (counter plus event in one transaction) arrives with T009.

Interpretation notes: every malformed `expires_at` (not a string, not RFC 3339, no offset, impossible date, leap second) is `malformed_request`, extending PA-010; out of range is `expiry_out_of_range`. T008 must call `canonicalizeExpiry` for the signature, `validateExpiryRange` before any idempotency record exists, and `resolveExpiry` only after a signature match. Expiry values read back from PostgreSQL as a JavaScript `Date` lose sub-millisecond digits, so `isExpired` can differ from the exact microsecond by under 1 ms.

## Link creation (T008)

`POST /v1/links` is registered when `buildServer` receives `createLink` deps (store, Clock, public base URL, `resolveClient`). Layers: `adapters/api/create-link.ts` (HTTP, problem+json), `app/create-link/handler.ts` (validation in data-model 2.3 order: Idempotency-Key, shape, URL, expiry), `app/create-link/service.ts` (idempotent creation and failure classification), `adapters/persistence/idempotency-repository.ts` (PostgreSQL), `domain/idempotency/signature.ts` (canonical signature).

Atomic check-and-commit (DEC-034, ADR-026): one transaction inserts the link (bounded code retry) and runs a conditional `UPDATE idempotency_records` that requires the owning `request_id`, state `IN_PROGRESS` and `lease_expires_at > $now`, with `$now` read from the Clock at commit time. Zero rows rolls the transaction back and returns 503 `request_superseded` with `Retry-After: 1`. Redis is not used: PostgreSQL-only mode is complete on its own and Redis stays an optional accelerator (ADR-015, DEC-067).

Outcomes: validation rejections are 400 and create no record (DEC-033); same key and signature replays with `Idempotency-Replayed: true`; same key with a different signature is 409 `idempotency_key_conflict`; same signature still IN_PROGRESS is 409 `idempotency_request_in_progress`; transient failures (exhausted code retries, connection-class database errors) delete the record and return 503 `persistence_unavailable`; any other failure stores FAILED and returns 500 `internal_error` (replayed for 24 h, DEC-029).

Not in T008 (follow-ups): client resolution by session token or address hash and token issuance (ASM-012; the route takes an injected `resolveClient`), rate limiting (FR-022), bounded retry with backoff and the per-attempt timeout for persistence calls (FR-020, PVT-010), application audit events for conflicts, and a bulk reaper (expired records are only removed lazily, per key). Interpretations: relative expiry fields are matched by the pattern in `handler.ts`; a missing or non-object body is `malformed_request`; a permanent failure is any error that is not transient.

## Redirect resolution (T009)

`GET /{short_code}` is registered when `buildServer` receives `resolveLink` deps. A code that is not exactly 7 base62 characters (any case change counts) is answered with the same 404 problem as an unknown code, without a database lookup; a path the router cannot match (too long, extra segments) gets the same 404 (FR-009). A found link is judged by the single rule `now >= expires_at` against the injected Clock (FR-011): active gives 302 with `Location` and `Cache-Control: no-store`, expired gives 410 `link_expired`. A transient lookup failure is 503 `persistence_unavailable` with `Retry-After: 1`; any other failure is 500 `internal_error`.

Analytics (T010 domain code, wired here): only a successful redirect for a GET request is captured, as one bounded attempt (10 s, PVT-010) that never blocks the redirect. The event row and the counter upsert commit in one transaction. A failed or timed-out capture writes an `analytics_capture_failed` row to `app_audit_events` (code, request id and reason only, no error text). HEAD requests answer 302 but are not counted (DEC-104). Residual: a capture that times out may still commit later, so the counter is a lower bound only when captures actually fail; no failure metric exists yet because `/metrics` is still the T004 stub.

Interpretation notes: non-ASCII characters in a stored URL are percent-encoded as UTF-8 in the `Location` header only (the stored value is unchanged); the 404 handler is registered app-wide when this route is enabled, so unknown paths return the problem 404; `maxParamLength` is raised so over-long codes reach the handler. Reserved-route overlap: the 7-character codes `healthz` and `metrics` are valid base62 but `/healthz` and `/metrics` win the routing, so a link given one of those codes could not be resolved. The odds are about two in 3.5 trillion, and the generator does not exclude them yet.
