# Tasks: Setup (5 tasks only)

| ID | Task | Files | Refs | Depends on |
|----|------|-------|------|------------|
| T001 | Create directory structure: `src/` (kernel, shortener, orchestrator), `tests/`, `docs/` (extends existing `docs/adr/`), `docker/` | `src/`, `tests/`, `docs/`, `docker/` | ADR-016 | none |
| T002 | Initialize `package.json` (ESM, `engines.node >=20`, npm scripts) and strict `tsconfig.json`; commit `package-lock.json` | `package.json`, `tsconfig.json`, `package-lock.json` | ADR-001, PA-012 | T001 |
| T003 | Create `docker-compose.yml`: PostgreSQL 16 (`POSTGRES_USER=app`, `POSTGRES_DB=urlshortener`) and Redis 7.2 (`--save ""`, `--appendonly no`, password), loopback ports, health checks | `docker-compose.yml` | ADR-023, ADR-015, DEC-098, DEC-113 | T001 |
| T004 | Create database initialization scripts: `orchestrator` database; roles `shortener_app` and `orchestrator_app` (DML only, no DDL, no UPDATE/DELETE on audit tables); no persistent migration role | `docker/postgres/init/*.sql` | ADR-003, DEC-095, DEC-113 | T003 |
| T005 | Create basic Fastify server skeleton: `/healthz` and `/readyz` per `shortener.openapi.yaml`, Ajv set to `removeAdditional: false`, `coerceTypes: false`, `useDefaults: false` | `src/shortener/adapters/api/server.ts` | ADR-002, Spec FR-021 | T002 |
