# Architecture Decision Records

**Feature**: `001-agentic-sdlc-url-shortener` | **Spec**: v1.11 | **Plan**: Approved v1.1 | **Generated**: 2026-10-16

**Every ADR here is `Proposed`.** None is marked Accepted because the human candidate has not yet approved the ADR documents. Several records implement choices the human already approved in the Decision Record (each ADR's Status section names the basis); approving the ADR text is a separate step. The research candidates in `specs/001-agentic-sdlc-url-shortener/research.md` are summaries; once these ADRs are accepted, these files govern and `research.md` is background.

## Coverage of the 16 areas you listed

| # | Area | ADR | Why an ADR is (or is not) required |
|---|------|-----|-------------------------------------|
| 1 | Application architecture | ADR-016 | Material: planes, ports and adapters, data ownership |
| 2 | Programming language and framework | ADR-001, ADR-002 | Material: stack approved (DEC-060) |
| 3 | Persistence strategy | ADR-003, ADR-015 | Material: PostgreSQL, Redis role and degraded mode |
| 4 | Short-code generation and collision handling | ADR-017 | Material: uniqueness and security |
| 5 | Orchestration model | ADR-004 | Material: the central differentiator |
| 6 | Workflow state persistence | ADR-018 | Material: lineage, atomicity, recovery |
| 7 | Dependency graph representation | ADR-019 | Material: path granularity, replanning |
| 8 | Human approval model | ADR-007 | Material: DEC-037 mechanism and gate semantics |
| 9 | Retry, fallback, and safe-stop policy | ADR-020 | Material: consolidated policy |
| 10 | Rollback versus compensation | ADR-021 | Material: effect ledger |
| 11 | Dynamic replanning | ADR-022 | Material: FR-122, FR-123 |
| 12 | Observability and audit model | ADR-006, ADR-008 | Material: integrity and measurement model (MTTR) |
| 13 | Testing strategy | ADR-012 | Material: requirement-gated readiness |
| 14 | Deployment and local execution model | ADR-023 | Material: local-only scope, Docker prerequisite |
| 15 | Authentication and authorization assumptions | ADR-024 | Material: anonymous shortener, identity, roles |
| 16 | Analytics consistency | ADR-025 | Material: fail-open capture and count accuracy |

Additional material decisions found while evaluating: ADR-005 (agent invocation), ADR-009 (contracts), ADR-010 (clock port), ADR-011 (rate limiting), ADR-013 (scenario provenance), ADR-014 (policy catalogue and readiness function), ADR-026 (idempotency architecture), ADR-027 (URL validation and destination policy). No area was judged non-material.

## 1. ADR inventory

| ID | Title | Status | Basis already approved by the human |
|----|-------|--------|--------------------------------------|
| [ADR-001](ADR-001-typescript-on-nodejs.md) | Language and runtime: TypeScript on Node.js | Proposed | DEC-060 |
| [ADR-002](ADR-002-fastify-contract-first.md) | Web framework: Fastify, contract-first | Proposed | DEC-060 |
| [ADR-003](ADR-003-postgresql-persistence.md) | Persistence: PostgreSQL, one database per plane | Proposed | DEC-060, DEC-070 |
| [ADR-004](ADR-004-custom-orchestration-engine.md) | Orchestration model: small custom engine | Proposed | none (planner proposal) |
| [ADR-005](ADR-005-agent-invocation-port.md) | Agent invocation: AgentPort with two adapters | Proposed | ASM-017 principle |
| [ADR-006](ADR-006-audit-integrity.md) | Audit model: append-only, hash-chained | Proposed | none (planner proposal) |
| [ADR-007](ADR-007-human-approval-model.md) | Human approval model and approver proof | Proposed | DEC-037, DEC-041, DEC-044 |
| [ADR-008](ADR-008-observability-and-measurement-model.md) | Observability and measurement model (MTTR) | Proposed | none (planner proposal) |
| [ADR-009](ADR-009-contract-first-api-and-schema-validation.md) | Contract-first API and schema validation | Proposed | none (planner proposal) |
| [ADR-010](ADR-010-clock-port-and-simulated-time.md) | Clock port and simulated time | Proposed | DEC-044 principle |
| [ADR-011](ADR-011-rate-limiting.md) | Rate limiting: Redis buckets, PostgreSQL fallback | Proposed | DEC-057, DEC-060, DEC-067, DEC-070 |
| [ADR-012](ADR-012-test-strategy-and-requirement-gated-evidence.md) | Test strategy and requirement-gated evidence | Proposed | DEC-060 (Vitest, Supertest), DEC-070, DEC-052, DEC-054 |
| [ADR-013](ADR-013-scenario-provenance-and-evidence-modes.md) | Scenario provenance and evidence modes | Proposed | DEC-059 |
| [ADR-014](ADR-014-policy-catalogue-and-release-readiness.md) | Policy catalogue and release-readiness function | Proposed | DEC-048, DEC-064, DEC-065 |
| [ADR-015](ADR-015-redis-role-and-degraded-mode.md) | Redis role and PostgreSQL-only degraded mode | Proposed | DEC-060, DEC-067, DEC-070 |
| [ADR-016](ADR-016-application-architecture.md) | Application architecture: two planes, ports and adapters | Proposed | none (planner proposal) |
| [ADR-017](ADR-017-short-code-generation-and-collisions.md) | Short-code generation and collision handling | Proposed | ASM-015, PA-008 (DEC-051, DEC-063) |
| [ADR-018](ADR-018-workflow-state-persistence.md) | Workflow state, lineage, and artifact persistence | Proposed | none (planner proposal) |
| [ADR-019](ADR-019-dependency-graph-representation.md) | Dependency graph representation | Proposed | none (planner proposal) |
| [ADR-020](ADR-020-retry-fallback-and-safe-stop-policy.md) | Retry, fallback, and safe-stop policy | Proposed | PVT-009 to PVT-011, DEC-045, DEC-050, PA-002, PA-003 |
| [ADR-021](ADR-021-rollback-versus-compensation.md) | Rollback versus compensation | Proposed | ASM-014, DEC-056 |
| [ADR-022](ADR-022-dynamic-replanning.md) | Dynamic replanning | Proposed | DEC-046, DEC-066 (scenarios rely on it) |
| [ADR-023](ADR-023-local-execution-and-deployment-model.md) | Deployment and local execution model | Proposed | ASM-007, EXC-002, DEC-069, PA-014 |
| [ADR-024](ADR-024-authentication-and-authorization-model.md) | Authentication and authorization model | Proposed | DEC-010, DEC-018, DEC-037, DEC-049, DEC-053, DEC-057, DEC-061 |
| [ADR-025](ADR-025-analytics-capture-and-consistency.md) | Analytics capture and consistency | Proposed | DEC-007, DEC-049, DEC-055 |
| [ADR-026](ADR-026-idempotency-architecture.md) | Idempotency architecture | Proposed | DEC-016 to DEC-034, DEC-062, DEC-067, DEC-068 |
| [ADR-027](ADR-027-url-validation-and-destination-policy.md) | URL validation and destination policy | Proposed | DEC-008, PA-006, PA-007 |

## 2. Decisions requiring human approval

All 27 ADR documents need approval to become Accepted. The specific choices below are **not** yet explicitly approved and deserve your attention first:

| ADR | Item needing a decision | Recommendation |
|-----|--------------------------|----------------|
| ADR-004, ADR-006, ADR-008, ADR-009, ADR-016, ADR-018, ADR-019 | Planner proposals with no prior explicit approval | Review and approve or amend |
| ADR-001 | The runtime floor: "Node.js 20+" was approved, but Node 20 reached end of life in April 2026 by the published schedule (verify) | Keep "20 or later" as the compatibility statement but set `engines` and CI to the LTS actually tested (22 or 24) |
| ADR-003 | Two database roles per plane (a migration role and a DML-only application role); the plan text says one | Approve two roles |
| ADR-014 | The reading that an approved, unexpired exception satisfies a mandatory FAIL (C1), alongside ASM-013's "all mandatory policy checks PASS" | Approve the reading |
| ADR-022 | One approval serving both G-AMB and G-CHG when the change is exactly the clarified statement | Approve the reading |
| ADR-025 | A 250 ms bound on analytics capture so a slow database cannot delay a redirect (proposed PA-015; no numeric bound was approved) | Approve or amend the value |

## 3. Decisions safely deferrable

| Item | Why it can wait |
|------|-----------------|
| Signed approvals and signed audit events (BL-03) | The hash chain and credentials meet the requirements; disclosed in ADR-006 and ADR-007 |
| OpenTelemetry (BL-02) | The `Telemetry` port makes it a later swap |
| Model-provider API adapter (BL-01) | The external-work adapter suffices |
| Schemathesis and `oasdiff` (BL-04, BL-06) | Custom checks cover the contract rules |
| Isolated session identities (BL-05) | LIM-004 accepted |
| Destination reputation port (BL-07) | Residual risk disclosed |
| Sharded analytics counters (ADR-025 option D) | Only if measurement shows hot-row contention |
| Jitter in retry backoff, connection-pool tuning, TLS and multi-node concerns | Single-node prototype |
| Exact container image versions | Fixed at checkpoint CP-1 |

## 4. Conflicts with the current plan

| # | Conflict | Where | Proposed handling |
|---|----------|-------|-------------------|
| 1 | The plan says "one least-privilege role per plane"; migrations need DDL rights the application role must not have | plan.md section 1.5 and Technical Context; data-model.md | Two roles per plane (ADR-003); update plan text on approval |
| 2 | The plan lists ADR-001 to ADR-015; this gate adds ADR-016 to ADR-027 | plan.md section 3; traceability.md section 5 | Update both tables when the ADRs are accepted (not edited now, since the plan is approved) |
| 3 | `research.md` duplicates ADR content that now lives here | research.md section 3 | After acceptance these files govern; `research.md` becomes background. A pointer is added |
| 4 | The runtime floor Node 20 is end of life by the published schedule | ADR-001 | See section 2 |
| 5 | The plan describes analytics capture as "fail-open" without a time bound | plan.md section 2.1 (`C-ANA`) | ADR-025 proposes a bound (PA-015) |
| 6 | The plan's coarse-replan fallback (SC-3) weakens Scenario A's branch-suspension claim | plan.md section 6.4 | Already disclosed; ADR-022 keeps it as a disclosed fallback only |
| 7 | The readiness reading in ADR-014 (approved exceptions) differs from a literal ASM-013 | spec ASM-013, FR-125, FR-128 | Confirm the reading |

No conflict with the approved specification's requirements was found.

## 5. Missing information

- Container image versions, Compose file details, PostgreSQL and Redis configuration (pool sizes, timeouts, Redis persistence), to be fixed at CP-1.
- The Node `engines` floor decision, and the npm version policy.
- The analytics capture timeout value, and whether HEAD requests count (deliberately left as the Scenario A clarification).
- Whether a CI platform is used: the plan and security design mention CI, but none is defined; `npm run verify` is the only runner specified.
- Where evidence bundles are stored, how large they may grow, and the format and location of the final report.
- How the CLI obtains credentials (environment variable or file) and the format of the approver identity string.
- The profile `sdlc/1` file format (typed code or JSON) and who edits it.
- The mechanism by which an ADR becomes Accepted (suggested: a new Decision Record entry per approval, as for the plan decisions).
- Metadata bounds and logging for CR-001, deliberately deferred to Scenario B (ASM-008).
