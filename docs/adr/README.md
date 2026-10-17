# Architecture Decision Records

**Feature**: `001-agentic-sdlc-url-shortener` | **Spec**: v1.12 | **Plan**: Approved v1.1 | **Updated**: 2026-10-16

**This directory is the authoritative source for architectural decisions (DEC-106).** `specs/001-agentic-sdlc-url-shortener/research.md` is background.

**Acceptance mechanism (DEC-103):** each approval creates a Decision Record entry in the specification, and an ADR changes from Proposed to Accepted when its entry is recorded.

**Status summary:** **24 Accepted** (DEC-071 to DEC-094). **3 Proposed (revised)**, rejected as first proposed and revised, awaiting re-approval: ADR-003 (DEC-095), ADR-014 (DEC-096), ADR-025 (DEC-097). Nothing is marked Accepted without its Decision Record entry.

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

## 1. ADR inventory (final)

| ID | Title | Status | Decision Record |
|----|-------|--------|-----------------|
| [ADR-001](ADR-001-typescript-on-nodejs.md) | Language and runtime: TypeScript on Node.js (tested on Node 22) | **Accepted** | DEC-071 |
| [ADR-002](ADR-002-fastify-contract-first.md) | Web framework: Fastify, contract-first | **Accepted** | DEC-072 |
| [ADR-003](ADR-003-postgresql-persistence.md) | Persistence: PostgreSQL, one database and one application role per plane | **Proposed (revised)** | DEC-095 (revision) |
| [ADR-004](ADR-004-custom-orchestration-engine.md) | Orchestration model: small custom engine | **Accepted** | DEC-073 |
| [ADR-005](ADR-005-agent-invocation-port.md) | Agent invocation: AgentPort with two adapters | **Accepted** | DEC-074 |
| [ADR-006](ADR-006-audit-integrity.md) | Audit model: append-only, hash-chained | **Accepted** | DEC-075 |
| [ADR-007](ADR-007-human-approval-model.md) | Human approval model and approver proof | **Accepted** | DEC-076 |
| [ADR-008](ADR-008-observability-and-measurement-model.md) | Observability and measurement model (MTTR) | **Accepted** | DEC-077 |
| [ADR-009](ADR-009-contract-first-api-and-schema-validation.md) | Contract-first API and schema validation | **Accepted** | DEC-078 |
| [ADR-010](ADR-010-clock-port-and-simulated-time.md) | Clock port and simulated time | **Accepted** | DEC-079 |
| [ADR-011](ADR-011-rate-limiting.md) | Rate limiting: Redis buckets, PostgreSQL fallback | **Accepted** | DEC-080 |
| [ADR-012](ADR-012-test-strategy-and-requirement-gated-evidence.md) | Test strategy and requirement-gated evidence | **Accepted** | DEC-081 |
| [ADR-013](ADR-013-scenario-provenance-and-evidence-modes.md) | Scenario provenance and evidence modes | **Accepted** | DEC-082 |
| [ADR-014](ADR-014-policy-catalogue-and-release-readiness.md) | Policy catalogue and release readiness (a mandatory FAIL always blocks) | **Proposed (revised)** | DEC-096 (revision) |
| [ADR-015](ADR-015-redis-role-and-degraded-mode.md) | Redis role and PostgreSQL-only degraded mode | **Accepted** | DEC-083 |
| [ADR-016](ADR-016-application-architecture.md) | Application architecture: two planes, ports and adapters | **Accepted** | DEC-084 |
| [ADR-017](ADR-017-short-code-generation-and-collisions.md) | Short-code generation and collision handling | **Accepted** | DEC-085 |
| [ADR-018](ADR-018-workflow-state-persistence.md) | Workflow state, lineage, and artifact persistence | **Accepted** | DEC-086 |
| [ADR-019](ADR-019-dependency-graph-representation.md) | Dependency graph representation (JSON profile) | **Accepted** | DEC-087 |
| [ADR-020](ADR-020-retry-fallback-and-safe-stop-policy.md) | Retry, fallback, and safe-stop policy | **Accepted** | DEC-088 |
| [ADR-021](ADR-021-rollback-versus-compensation.md) | Rollback versus compensation | **Accepted** | DEC-089 |
| [ADR-022](ADR-022-dynamic-replanning.md) | Dynamic replanning (dual gate only on an exact match) | **Accepted** | DEC-090 |
| [ADR-023](ADR-023-local-execution-and-deployment-model.md) | Deployment and local execution model | **Accepted** | DEC-091 |
| [ADR-024](ADR-024-authentication-and-authorization-model.md) | Authentication and authorization model | **Accepted** | DEC-092 |
| [ADR-025](ADR-025-analytics-capture-and-consistency.md) | Analytics capture and consistency (no analytics-specific bound) | **Proposed (revised)** | DEC-097 (revision) |
| [ADR-026](ADR-026-idempotency-architecture.md) | Idempotency architecture | **Accepted** | DEC-093 |
| [ADR-027](ADR-027-url-validation-and-destination-policy.md) | URL validation and destination policy | **Accepted** | DEC-094 |

## 2. Decisions still requiring human approval

| ADR | What changed | What to confirm |
|-----|--------------|------------------|
| ADR-003 | One application role per plane, DML only; migrations only through the explicit `migrate` command with the container's administrative credential, never a persistent role | Re-approve |
| ADR-014 | A mandatory FAIL always blocks; an approved exception on a waivable policy can only produce a **CONDITIONAL_PASS** disposition with documented compensating controls, accepted explicitly at G-RISK and G-REL and listed in the report | Re-approve, and **confirm the handling**: the ratified constitution allows exactly four policy outcomes, so CONDITIONAL_PASS is a derived readiness disposition, not a fifth outcome (a fifth outcome would need a constitution amendment) |
| ADR-025 | The 250 ms bound and PA-015 are removed; no analytics-specific time bound | Re-approve, and confirm the authoring clarification that capture makes a **single attempt with no retries** |

## 3. Decisions safely deferrable

Signed approvals and audit events (BL-03); OpenTelemetry (BL-02); a model-provider API adapter (BL-01); Schemathesis and `oasdiff` (BL-04, BL-06); isolated session identities (BL-05); a destination reputation port (BL-07); sharded analytics counters; retry jitter, connection-pool tuning, TLS and multi-node concerns; the JSON Schema for the workflow profile (authored in slice S4, DEC-102).

## 4. Conflicts with the plan: resolved

| # | Conflict | Resolution |
|---|----------|------------|
| 1 | One role per plane versus a migration role | **Resolved (DEC-095):** one application role per plane; no persistent migration role |
| 2 | Plan listed ADR-001 to ADR-015 only | **Resolved (DEC-106):** plan.md section 3 and traceability.md now include ADR-016 to ADR-027 |
| 3 | `research.md` duplicated ADR content | **Resolved (DEC-106):** `docs/adr/` is authoritative; `research.md` is background |
| 4 | Node 20 end-of-life | **Resolved (DEC-071):** "20 or later" supported, tested on Node 22 (Node 22 is not installed on this machine) |
| 5 | Analytics capture had no stated time bound | **Resolved (DEC-097):** no bound, as originally specified |
| 6 | Readiness reading in ADR-014 | **Resolved (DEC-096)** with the confirmation noted above |
| 7 | Coarse-replan fallback weakens Scenario A | Unchanged; disclosed in ADR-022 and the plan (SC-3) |

No conflict with the approved specification's requirements was found.

## 5. Missing information: status

**Resolved by the human:** container images (PostgreSQL 16, Redis 7.2; DEC-098), CI (none; DEC-099), evidence storage (`evidence/` by scenario; DEC-100), approver identity (a string; DEC-101), profile format (JSON; DEC-102), ADR acceptance mechanism (DEC-103), HEAD requests (do not count; DEC-104), metadata bounds (DEC-105).

**Still open:**
- Exact image tags and digests, and PostgreSQL and Redis settings (pool sizes, timeouts, Redis persistence): fixed at CP-1. The human's example `postgres:16.2-alpine` predates later 16.x security fixes; the latest 16.x patch is recommended.
- Provisioning Node 22 (not installed here) for the "tested on Node 22" decision.
- How the CLI obtains credentials (environment variable or file).
- The format and location of the final report, and evidence size and retention.
- Scenario B metadata: permitted characters, the unit of "characters", where metadata is returned, and confirmation that metadata is never logged (DEC-105 interpretation).
- The JSON Schema for the `sdlc/1` profile (slice S4).
