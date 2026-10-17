# Tasks: Setup (5 tasks only)

| ID | Task | Files | Refs | Depends on |
|----|------|-------|------|------------|
| T001 | Create directory structure: `src/` (kernel, shortener, orchestrator), `tests/`, `docs/` (extends existing `docs/adr/`), `docker/` | `src/`, `tests/`, `docs/`, `docker/` | ADR-016 | none |
| T002 | Initialize `package.json` (ESM, `engines.node >=20`, npm scripts) and strict `tsconfig.json`; commit `package-lock.json` | `package.json`, `tsconfig.json`, `package-lock.json` | ADR-001, PA-012 | T001 |
| T003 | Create `docker-compose.yml`: PostgreSQL 16 (`POSTGRES_USER=app`, `POSTGRES_DB=urlshortener`) and Redis 7.2 (`--save ""`, `--appendonly no`, password), loopback ports, health checks | `docker-compose.yml` | ADR-023, ADR-015, DEC-098, DEC-113 | T001 |
| T004 | Create database initialization scripts: `orchestrator` database; roles `shortener_app` and `orchestrator_app` (DML only, no DDL, no UPDATE/DELETE on audit tables); no persistent migration role | `docker/postgres/init/*.sql` | ADR-003, DEC-095, DEC-113 | T003 |
| T005 | Create basic Fastify server skeleton: `/healthz` and `/readyz` per `shortener.openapi.yaml`, Ajv set to `removeAdditional: false`, `coerceTypes: false`, `useDefaults: false` | `src/shortener/adapters/api/server.ts` | ADR-002, Spec FR-021 | T002 |

# Tasks: Domain (5 tasks only)

| ID | Task | Files | Refs | Depends on |
|----|------|-------|------|------------|
| T006 | URL validation and normalization, tests first: length 2048, parse, `http`/`https` only, ASCII host, no user info, forbidden destinations, normalization limited to lowercase scheme/host, default-port and fragment removal | `src/shortener/domain/url/`, `tests/unit/url/` | Spec FR-002 to FR-005, DEC-008, PA-006, PA-007, ADR-027 | T005 |
| T007 | Short code generation with collision handling, tests first: CSPRNG base62, length 7, unique index, 3-attempt retry, exhaustion is transient (503, no FAILED record) | `src/shortener/domain/code/`, `tests/unit/code/`, `tests/persistence/code/` | Spec FR-006, FR-007, ASM-015, PA-008, ADR-017 | T004, T005 |
| T008 | Link creation endpoint `POST /v1/links` with idempotency, tests first: canonical signature, IN_PROGRESS/COMPLETED/FAILED, 60 s lease, atomic check-and-commit in PostgreSQL, 409 on signature difference, replay header | `src/shortener/app/create-link/`, `src/shortener/adapters/api/`, `tests/integration/create/` | Spec FR-001, FR-015, FR-016, DEC-016 to DEC-034, ADR-026, ADR-015 | T006, T007, T010 |
| T009 | Redirect resolution endpoint `GET /{short_code}`, tests first: 302 with `no-store`, identical 404 for unknown or malformed, 410 for expired | `src/shortener/app/resolve-link/`, `src/shortener/adapters/api/`, `tests/integration/redirect/` | Spec FR-008, FR-009, DEC-006, DEC-011, ADR-017 | T008, T010 |
| T010 | Expiration logic, tests first: absolute RFC 3339 only, `now < expires_at <= now + 365 days`, 30-day default after signature match, single boundary rule `now >= expires_at` via the Clock port | `src/kernel/clock/`, `src/shortener/domain/expiry/`, `tests/unit/expiry/` | Spec FR-010, FR-011, DEC-023, DEC-024, ADR-010 | T002 |
