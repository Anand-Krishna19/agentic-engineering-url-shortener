# Architecture Decision Records

**Feature**: `001-agentic-sdlc-url-shortener` | **Spec**: v1.13 | **Plan**: Approved v1.1 | **Updated**: 2026-10-16

**This directory is the authoritative source for architectural decisions (DEC-106).** `specs/001-agentic-sdlc-url-shortener/research.md` is background.

**Acceptance mechanism (DEC-103):** each approval creates a Decision Record entry in the specification, and an ADR changes from Proposed to Accepted when its entry is recorded.

**Status: all 27 ADRs are Accepted.** 24 were accepted at the first review (DEC-071 to DEC-094). ADR-003, ADR-014, and ADR-025 were rejected as first proposed (DEC-095 to DEC-097), revised, and accepted on 2026-10-16 (DEC-107 to DEC-109). Further decisions amended some accepted ADRs (listed below).

## Coverage of the 16 areas

| # | Area | ADR |
|---|------|-----|
| 1 | Application architecture | ADR-016 |
| 2 | Programming language and framework | ADR-001, ADR-002 |
| 3 | Persistence strategy | ADR-003, ADR-015 |
| 4 | Short-code generation and collision handling | ADR-017 |
| 5 | Orchestration model | ADR-004 |
| 6 | Workflow state persistence | ADR-018 |
| 7 | Dependency graph representation | ADR-019 |
| 8 | Human approval model | ADR-007 |
| 9 | Retry, fallback, and safe-stop policy | ADR-020 |
| 10 | Rollback versus compensation | ADR-021 |
| 11 | Dynamic replanning | ADR-022 |
| 12 | Observability and audit model | ADR-006, ADR-008 |
| 13 | Testing strategy | ADR-012 |
| 14 | Deployment and local execution model | ADR-023 |
| 15 | Authentication and authorization assumptions | ADR-024 |
| 16 | Analytics consistency | ADR-025 |

Additional material decisions: ADR-005 (agent invocation), ADR-009 (contracts), ADR-010 (clock port), ADR-011 (rate limiting), ADR-013 (scenario provenance), ADR-014 (policy catalogue and readiness), ADR-026 (idempotency), ADR-027 (URL validation).

## ADR inventory (final)

| ID | Title | Status | Decision Record |
|----|-------|--------|-----------------|
| [ADR-001](ADR-001-typescript-on-nodejs.md) | Language and runtime: TypeScript on Node.js (tested on Node 24, "20 or later" supported) | **Accepted** | DEC-071 |
| [ADR-002](ADR-002-fastify-contract-first.md) | Web framework: Fastify, contract-first | **Accepted** | DEC-072 |
| [ADR-003](ADR-003-postgresql-persistence.md) | Persistence: PostgreSQL, one database and one application role per plane | **Accepted** | DEC-107 |
| [ADR-004](ADR-004-custom-orchestration-engine.md) | Orchestration model: small custom engine | **Accepted** | DEC-073 |
| [ADR-005](ADR-005-agent-invocation-port.md) | Agent invocation: AgentPort with two adapters | **Accepted** | DEC-074 |
| [ADR-006](ADR-006-audit-integrity.md) | Audit model: append-only, hash-chained | **Accepted** | DEC-075 |
| [ADR-007](ADR-007-human-approval-model.md) | Human approval model and approver proof | **Accepted** | DEC-076 (amended by DEC-110) |
| [ADR-008](ADR-008-observability-and-measurement-model.md) | Observability and measurement model (MTTR) | **Accepted** | DEC-077 |
| [ADR-009](ADR-009-contract-first-api-and-schema-validation.md) | Contract-first API and schema validation | **Accepted** | DEC-078 |
| [ADR-010](ADR-010-clock-port-and-simulated-time.md) | Clock port and simulated time | **Accepted** | DEC-079 |
| [ADR-011](ADR-011-rate-limiting.md) | Rate limiting: Redis buckets, PostgreSQL fallback | **Accepted** | DEC-080 |
| [ADR-012](ADR-012-test-strategy-and-requirement-gated-evidence.md) | Test strategy and requirement-gated evidence | **Accepted** | DEC-081 |
| [ADR-013](ADR-013-scenario-provenance-and-evidence-modes.md) | Scenario provenance and evidence modes | **Accepted** | DEC-082 |
| [ADR-014](ADR-014-policy-catalogue-and-release-readiness.md) | Policy catalogue and release readiness (a mandatory FAIL always blocks; CONDITIONAL_PASS is a derived disposition) | **Accepted** | DEC-108 |
| [ADR-015](ADR-015-redis-role-and-degraded-mode.md) | Redis role and PostgreSQL-only degraded mode | **Accepted** | DEC-083 (amended by DEC-113) |
| [ADR-016](ADR-016-application-architecture.md) | Application architecture: two planes, ports and adapters | **Accepted** | DEC-084 |
| [ADR-017](ADR-017-short-code-generation-and-collisions.md) | Short-code generation and collision handling | **Accepted** | DEC-085 |
| [ADR-018](ADR-018-workflow-state-persistence.md) | Workflow state, lineage, and artifact persistence | **Accepted** | DEC-086 |
| [ADR-019](ADR-019-dependency-graph-representation.md) | Dependency graph representation (JSON profile) | **Accepted** | DEC-087 |
| [ADR-020](ADR-020-retry-fallback-and-safe-stop-policy.md) | Retry, fallback, and safe-stop policy | **Accepted** | DEC-088 |
| [ADR-021](ADR-021-rollback-versus-compensation.md) | Rollback versus compensation | **Accepted** | DEC-089 |
| [ADR-022](ADR-022-dynamic-replanning.md) | Dynamic replanning (dual gate only on an exact match) | **Accepted** | DEC-090 |
| [ADR-023](ADR-023-local-execution-and-deployment-model.md) | Deployment and local execution model | **Accepted** | DEC-091 (amended by DEC-111 to DEC-113) |
| [ADR-024](ADR-024-authentication-and-authorization-model.md) | Authentication and authorization model | **Accepted** | DEC-092 |
| [ADR-025](ADR-025-analytics-capture-and-consistency.md) | Analytics capture and consistency (single attempt, no retries, fail-open) | **Accepted** | DEC-109 |
| [ADR-026](ADR-026-idempotency-architecture.md) | Idempotency architecture | **Accepted** | DEC-093 |
| [ADR-027](ADR-027-url-validation-and-destination-policy.md) | URL validation and destination policy | **Accepted** | DEC-094 |

## Amendments to accepted ADRs

| ADR | Amendment | Record |
|-----|-----------|--------|
| ADR-001 | Tests run on the installed Node 24.22.0 ("20 or later" supported; Node 20 and 22 not tested). The human's message also mentioned provisioning Node 22; the final instruction "test on 24" is applied | DEC-071 |
| ADR-003, ADR-023 | Database `urlshortener` plus `orchestrator`; bootstrap role `app` used only by `migrate`; no external pooler with a small fixed driver pool | DEC-113 |
| ADR-007 | CLI credentials from environment variables only | DEC-110 |
| ADR-015 | Redis runs with persistence disabled, a password, and a health check | DEC-113 |
| ADR-023 | Final report at `evidence/final-report.md`; evidence unlimited and committed to GitHub | DEC-111, DEC-112 |

## Interpretations applied to the new settings (all confirmed by the human on 2026-10-16)

These were applied so that the new settings do not break accepted ADRs. They are listed in DEC-110 and DEC-113 and in ADR-007 and ADR-023.

1. The credential **secret** needs its own environment variables (`APPROVER_CREDENTIAL`, `AGENT_CREDENTIAL`, `READER_CREDENTIAL`), because `APPROVER_IDENTITY` is an identity, not a secret.
2. `POSTGRES_USER=app` is a **superuser** in the official image, so it is the bootstrap role for `migrate` only; services use `shortener_app` and `orchestrator_app`.
3. `POSTGRES_DB=urlshortener` is the application plane's database; the `orchestrator` database is created in addition.
4. "Connection pooling disabled" means no external pooler; the `pg` driver keeps a small fixed pool (confirmed: at most 10 per process), since one connection would serialize requests and defeat the concurrency tests.
5. Redis "default configuration, no persistence" means the default image configuration plus `--save ""` and `--appendonly no`, and the password ADR-015 requires.
6. Evidence committed to GitHub is covered by the secret scan.

## Decisions safely deferrable

Signed approvals and audit events (BL-03); OpenTelemetry (BL-02); a model-provider API adapter (BL-01); Schemathesis and `oasdiff` (BL-04, BL-06); isolated session identities (BL-05); a destination reputation port (BL-07); sharded analytics counters; retry jitter, pool tuning, TLS and multi-node concerns; the JSON Schema for the workflow profile (authored in slice S4, DEC-102).

## Conflicts with the plan

All previously listed conflicts are resolved (DEC-071, DEC-095 to DEC-097, DEC-106). No conflict with the approved specification's requirements was found.

## Missing information: remaining

- Exact image tags and digests (the latest PostgreSQL 16.x patch, Redis 7.2.x), fixed at CP-1.
- Scenario B metadata: permitted characters, the unit of "characters" (code points or bytes), and where metadata is returned; deferred to the Scenario B workflow.
- The JSON Schema for the `sdlc/1` profile, authored in slice S4.
- The driver pool size (confirmed: at most 10 per process).
