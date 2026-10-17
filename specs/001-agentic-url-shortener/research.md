# Research and Technology Decisions: Agentic SDLC Orchestration and URL Shortener

**Feature**: `001-agentic-sdlc-url-shortener` | **Spec**: [spec.md](spec.md) v1.11 | **Plan**: [plan.md](plan.md) | **Date**: 2026-10-16

**Approval status.** On 2026-10-16 the human candidate approved the technology stack (DEC-060): **TypeScript on Node.js 20 or later, Fastify, PostgreSQL, Redis, Vitest with Supertest**. The planner had proposed Python with FastAPI and SQLite; that proposal is **superseded** and kept below only as the alternative that was evaluated. The approved stack is recorded in each ADR. The **sub-selections** (the libraries around the stack, the PostgreSQL and Redis role boundary, and Redis-down behavior) were **confirmed on 2026-10-16** (DEC-067, DEC-070), with one amendment: Redis-down rate limiting uses PostgreSQL-based checks, not in-process buckets (DEC-067). On approval each ADR becomes an Architecture Decision Record in the ADR stage; the identifiers are stable.

## 0. Unknowns Resolved

The plan template's unknowns (language, dependencies, storage, testing, platform, performance model, scale) are resolved by the ADRs below. The specification forbids choosing them there (CON-001).

## 1. Feasibility Evidence (actual execution, with limits)

Executed on the candidate's machine on 2026-10-16 in throwaway directories outside the repository. These are feasibility spikes, not repository tests and not production measurements.

### 1.1 Approved stack (TypeScript, Node.js)

| Check | Result |
|-------|--------|
| Runtime | Node.js 24.22.0, npm 11.19.1 (the approved floor is Node 20; the installed version satisfies it) |
| Packages installed in one command (492 packages, 24 s) | fastify 5.12.7, typescript 6.0.3, vitest 5.0.5, supertest 7.3.1, pg 8.23.1, ioredis 6.0.0, ajv 8.20.0, prom-client 15.1.3, pino 10.4.0, fast-check 4.10.2, uuid 14.0.3, node-pg-migrate 9.0.0, plus eslint, typescript-eslint, `@vitest/coverage-v8`, commander, yaml, ajv-formats, `@apidevtools/swagger-parser`, license-checker-rseidelsohn, secretlint |
| Contract validation under the stack's own tooling | After one fix, **23 of 23 checks passed**: both OpenAPI 3.1 documents validate with swagger-parser (including relative file references), all nine schemas compile under Ajv 2020 in **strict mode**, all examples and the policy catalogue validate, and four negative controls are rejected |
| Defect found by this spike | Ajv strict mode rejected nested conditional schemas without `"type": "object"` in `change-record.schema.json` (the Python validator used earlier was too lenient to notice). Fixed; this matters because Fastify validates with Ajv |

### 1.2 Infrastructure prerequisites (PostgreSQL and Redis)

| Check | Result |
|-------|--------|
| Docker CLI | Present (client 29.8.2) |
| Docker daemon | **Not running** on this machine at the time of the check |
| PostgreSQL, `psql`, Redis, `redis-server`, podman | **Not installed natively** |
| WSL | Present (`wsl.exe`) but not evaluated |
| Ports 5432, 6379, 8080, 8090 | Free |

Consequence: the approved stack needs containers (or a native install) before any persistence test can run. **Nothing about PostgreSQL or Redis behavior has been executed yet.** This is why checkpoint CP-1 (plan.md) is widened to require a running PostgreSQL and Redis and a passing migration and cache round trip, with a stop condition if Docker cannot be started.

### 1.3 Superseded alternative (historical record)

The earlier Python spike (Python 3.15.0 with FastAPI 0.143.3, Pydantic 2.14.1, SQLite 3.53.1, all candidate libraries installed from wheels except one) succeeded. It is retained only as evidence that the rejected option was feasible, not as evidence for the approved stack.

## 2. Assessment Criteria

| ID | Criterion | Why it matters here |
|----|-----------|---------------------|
| K1 | Runs locally with what is installed, in minutes | ASM-007; assessors must run it |
| K2 | Time to a working, tested result in 2 to 3 days | Plan timebox |
| K3 | Testability and determinism | Constitution IV; DEC-044 simulated time |
| K4 | Contract and schema tooling | Executable contract validation |
| K5 | Fit for explicit orchestration governance | FR-105 to FR-123 |
| K6 | Operational simplicity | "Avoid unjustified distributed-system complexity" |
| K7 | Reversibility | Decisions behind ports can be replaced |
| K8 | Reviewer legibility | Assessors read the code |
| K9 | Infrastructure prerequisites | Added after the stack decision: what must be running before tests can pass |

## 3. Decisions

### ADR-001: Implementation language and runtime

| Field | Content |
|-------|---------|
| Decision question | Which language and runtime for both planes? |
| Options | **A** TypeScript on Node.js 20+ (selected by the human). **B** Python 3.13+ (the planner's earlier proposal, superseded). **C** Java 27 (JDK present, no build tool). **D** Go or .NET (not installed). |
| **Selected (DEC-060)** | **A: TypeScript (strict mode) on Node.js 20 or later**, developed on the installed Node 24.22.0, npm with a committed lock file, ES modules, compiled with `tsc`. |
| Rationale given | Stated by the human: a production-grade, testable prototype. Planner's supporting observations: Fastify validates requests directly from JSON Schema, which removes most contract drift (the main weakness of the earlier Python proposal); Ajv, `swagger-parser`, and `fast-check` cover contract and property testing; Node and npm are already installed. |
| Consequences | The contract schemas can be loaded at runtime by the framework (single source of truth). Types are erased at runtime, so runtime validation stays essential. Dependencies are more numerous in the Node ecosystem, which raises supply-chain attention (ADR-012). No built-in `uuid` v7; a small package is needed (PA-013). |
| Risks | R-01: dependency and toolchain churn (TypeScript 6 and Vitest 5 are recent major versions); mitigated by the lock file and CP-1. R-02 from the earlier plan (contract drift) is largely retired. |
| Reversibility | Medium. The domain sits behind ports and the contracts are language-neutral, but a rewrite would be costly. |
| Validation | Spike (section 1.1, done). CP-1: install from the lock file, `tsc --noEmit` strict, a trivial Vitest test, and the contract validation script all pass. |

### ADR-002: Web framework for both HTTP surfaces

| Field | Content |
|-------|---------|
| Decision question | Which framework serves the shortener API and the control-plane API? |
| Options | **A** Fastify (selected). **B** Express. **C** NestJS. **D** Hono. |
| **Selected (DEC-060)** | **A: Fastify 5**, used **contract-first**: request and response schemas are taken from the OpenAPI contracts and registered on the routes. |
| Rationale given | Built-in schema validation and serialization, high performance, and clear separation of concerns. |
| Planner configuration requirements (to avoid silent contract violations) | Ajv options must be **`removeAdditional: false`, `coerceTypes: false`, `useDefaults: false`**, strict mode on. Fastify's defaults strip unknown properties and coerce types, which would silently accept requests the contract says to reject (for example `ttl_seconds` must give `unsupported_expiry_representation`, not be dropped). Validation errors are mapped by one error handler to RFC 9457 problem details with the contract's reason codes. Response schemas are always declared so serialization never leaks undeclared fields. |
| Consequences | An `onRoute` hook collects every registered method, path, and status code for the drift test (CV-05). Plugin encapsulation maps naturally to the ports-and-adapters layout. |
| Risks | R-03: a default behavior differs from the contract; handled by the Ajv settings above and a test per documented error. |
| Reversibility | High, behind a thin delivery adapter. |
| Validation | Contract conformance tests in slice 2; a test that an unknown field is rejected and not stripped. |

### ADR-003: Persistence

| Field | Content |
|-------|---------|
| Decision question | Where does each plane store state? |
| Options | **A** PostgreSQL (selected). **B** SQLite (the planner's earlier proposal, superseded). **C** Flat files. |
| **Selected (DEC-060)** | **A: PostgreSQL** with strong consistency and ACID transactions for mappings and workflow state: two databases (`shortener`, `orchestrator`), one least-privilege role per plane. |
| Rationale given | Strong consistency and ACID compliance on mappings and workflow state. |
| Planner design (sub-selections confirmed, DEC-070) | Driver `pg` with hand-written parameterized SQL behind repository ports and no ORM; numbered SQL migrations applied by `node-pg-migrate`; `timestamptz` columns; short codes stored with the `"C"` (binary) collation so uniqueness is case-sensitive (ASM-015); lease, expiry, and retention comparisons use a timestamp supplied by the `Clock` port as a query parameter, not `now()`, so simulated time works; the audit hash-chain append serializes per run with a row lock on the run; the audit tables are append-only by **both** triggers and revoked `UPDATE` and `DELETE` privileges on the application role, which is stronger than the earlier file-based design (Constitution V, least privilege). |
| Consequences | The atomic check-and-commit (DEC-034) is a single PostgreSQL transaction with a conditional `UPDATE`. A server must be running (ADR-015, section 1.2). Per-test isolation needs a database or schema per worker. |
| Risks | R-04: lock contention in concurrency tests; R-05 retired (a maintained migration tool replaces the custom runner); R-23: infrastructure prerequisites (Docker not running now); R-24: test isolation cost and speed. |
| Reversibility | High: repository ports; a different SQL database would need a dialect adapter. |
| Validation | Concurrency tests (FR-017, FR-018); migration up and down tests; trigger and privilege tests; CP-1 round trip. |

### ADR-004: Orchestration engine

| Field | Content |
|-------|---------|
| Decision question | How is the explicit, stateful, non-linear workflow executed? |
| Options | **A** A small custom in-process engine persisted in PostgreSQL. **B** LangGraph or a similar agent framework. **C** Temporal. **D** Airflow, Prefect, or similar. **E** A BPMN engine. |
| **Proposed (planner; not part of the stack decision)** | **A**, implemented in TypeScript. |
| Rationale | The assessment evaluates orchestration design, so nodes, gates, retries, compensation, safe-stop, replanning, and lineage must be explicit and testable with a simulated clock. C, D, and E add infrastructure; B constrains the semantics. Scheduling and leases use PostgreSQL (no Redis in the control plane). |
| Consequences | About 10 source files to write and test; the main schedule risk (R-06). |
| Reversibility | Medium. |
| Validation | Transition-table tests; a property test that no path reaches a node before its dependencies (using `fast-check`). |

### ADR-005: Agent invocation (ASM-017)

| Field | Content |
|-------|---------|
| Decision question | How does the orchestrator obtain work from AI agents without hard-wiring a provider? |
| Options | **A** An abstract `AgentPort` with scripted agents and an external-work adapter (file inbox and outbox). **B** A direct model-provider API adapter now. **C** Scripted only. |
| **Proposed** | **A**; **B** is backlog BL-01. |
| Rationale | No API keys in the core path; the external-work adapter is how AI-assisted work actually enters; submissions pass G-CODE. |
| Consequences | Evidence is labelled `LIVE_EXTERNAL` or `SCRIPTED`; scripted statistics are never presented as AI performance. |
| Validation | Port contract tests; agent-credential and mode-label tests. |

### ADR-006: Audit integrity

| Field | Content |
|-------|---------|
| Decision question | How is the audit record made tamper-evident and append-only? |
| Options | **A** Append-only tables, rejecting triggers, revoked write privileges, a SHA-256 hash chain per run, and a verify command. **B** Plain logs. **C** An external ledger. |
| **Proposed** | **A.** |
| Rationale | Meets FR-130 and NFR-006; PostgreSQL privileges add a real enforcement layer the application role cannot bypass. |
| Risks | R-09: whoever controls the database superuser can rewrite everything; the chain proves internal consistency, not authorship. Signed events are backlog BL-03. The chain head hash of each run is recorded in the evidence bundle so a rewrite is detectable against an external copy. |
| Validation | Tamper tests: an `UPDATE` as the application role fails on privilege and on trigger; an out-of-band edit is detected by verify. |

### ADR-007: Human-approval proof (DEC-037)

| Field | Content |
|-------|---------|
| Decision question | What credential mechanism keeps agents from approving? |
| Options | **A** Three distinct bearer credentials (approver, agent, reader), random, stored only as hashes. **B** Signed approvals. **C** OS-user separation. **D** mTLS. |
| **Proposed** | **A**; B is backlog BL-03. |
| Rationale | Simple and testable; the FR-109 test is concrete. |
| Consequences | `node:crypto` `randomBytes` for generation and `timingSafeEqual` for comparison; credentials live in `.secrets/` (git-ignored); a startup check refuses to run an agent worker whose environment contains the approver credential. |
| Risks | R-10: one shared shell can leak the credential. |
| Validation | Agent credential denied and audited; credential absent from logs and audit data. |

### ADR-008: Telemetry

| Field | Content |
|-------|---------|
| Decision question | How are logs, metrics, and traces produced? |
| Options | **A** `pino` structured JSON logs (Fastify's native logger), `prom-client` metrics, and a small span recorder to JSONL. **B** The OpenTelemetry SDK. |
| **Proposed** | **A** behind a `Telemetry` port; B is backlog BL-02. |
| Rationale | Fewest moving parts; correlation ids are already carried. Pino redaction paths enforce "no secrets in logs". |
| Validation | Correlation-id equality across log, audit event, and span; redaction tests. |

### ADR-009: Contracts, schemas, and executable validation

| Field | Content |
|-------|---------|
| Decision question | Which formats and tools define and verify the API and schema deliverables? |
| Options | **A** OpenAPI 3.1 and JSON Schema 2020-12, validated by `@apidevtools/swagger-parser` and Ajv (2020 dialect, strict mode), with the schemas **used at runtime by Fastify**, a route drift test, and a custom compatibility checker. **B** Generate the contract from code. **C** Schemathesis. |
| **Proposed** | **A**; C is backlog BL-04. |
| Rationale | Contract-first, single source of truth. The spike showed all contracts pass these tools in strict mode (section 1.1). |
| Consequences | Details in [contracts/README.md](contracts/README.md). Compatibility checking is custom (rules listed there); `oasdiff` is backlog BL-06. |
| Validation | Executed for the authored contracts (23 of 23 under Ajv and swagger-parser; 33 of 33 under the earlier Python validators). |

### ADR-010: Time, determinism, and simulated timeouts (DEC-044)

| Field | Content |
|-------|---------|
| Decision | A `Clock` port (a TypeScript interface) with a wall-clock adapter and a controllable simulated adapter; every duration and deadline records `clock_kind` (`WALL` or `SIMULATED`). An ESLint rule bans `Date.now()` and `new Date()` outside the wall-clock adapter. |
| Rationale | Deterministic tests; DEC-044 labelling made structural. Timestamps passed into SQL and Redis scripts come from the port. |
| Validation | Expiry boundary, lease, approval timeout, and policy-block window tests on the simulated clock. |

### ADR-011: Rate limiting

| Field | Content |
|-------|---------|
| Decision question | How is the dual-dimension limit (per session token and per IP-address hash, DEC-057) enforced? |
| Options | **A** Redis token buckets updated by an atomic Lua script, keyed by token hash and by IP hash. **B** In-process buckets (the earlier proposal). **C** A reverse proxy. |
| **Selected (DEC-060, Redis for rate limiting)** | **A**, with the current time passed in from the `Clock` port so tests are deterministic. |
| Confirmed design (DEC-067) | When Redis is unavailable the service falls back to **PostgreSQL-only mode**: rate limiting degrades to **PostgreSQL-based bucket checks** (a `rate_limit_buckets` table updated atomically, with row-level locking), still limiting and never silently open; no advisory lock is used; the degradation is logged, counted, audited, and shown in readiness (PA-011 as amended). Thresholds: PVT-006 for tokens, PA-001 for IP hashes. |
| Consequences | Limits are shared across processes and survive an application restart; they reset if Redis restarts (persistence off by default). The peer address is used; `X-Forwarded-For` is honored only with an explicit trusted-proxy setting (default off). On one local machine every tokenless client shares one IP hash (LIM-003, LIM-004). |
| Validation | Token-discard abuse test; independent clients with different tokens and addresses are not blocked; Redis-down degradation test. |

### ADR-012: Test, quality, and scan tooling

| Field | Content |
|-------|---------|
| Decision question | Which tools satisfy Constitution IV and V and FR-127? |
| **Selected (DEC-060)** | **Vitest with Supertest** for unit and integration tests. |
| Companions (confirmed, DEC-070, PA-013) | `fast-check` for properties (replaces Hypothesis); `@vitest/coverage-v8`; ESLint with `typescript-eslint` plus an import-boundary rule, and `tsc --noEmit` in strict mode; `npm audit` for dependency vulnerabilities (OSV-Scanner is backlog); `license-checker-rseidelsohn` for licenses; `secretlint` for secrets with a seeded fake-secret negative control; a committed dependency allow-list file. Requirement tags are written into test titles as `[FR-015]` and `[FR-015:NAC]` and extracted by a small custom Vitest reporter (Vitest has no marker facility). |
| Consequences | Scan outputs are stored as evidence (EV-ART). npm's dependency tree is large, so the allow-list policy (POL-DEP-001) applies to direct dependencies and the audit covers transitive ones. |
| Risks | R-15: scan data needs the network; offline runs are labelled OFFLINE. R-25: supply-chain exposure of a larger tree; mitigated by lock file integrity hashes, `npm ci`, and the audit gate (DEC-054). |
| Validation | Each scanner runs once on the baseline; the seeded fake secret must fail the scan. |

### ADR-013: Scenario evidence modes and bootstrapping (PD-01)

| Field | Content |
|-------|---------|
| **Approved (DEC-059)** | The core shortener is built first and labelled "baseline foundation, SpecKit-governed, not orchestrator-run"; Scenario A governs the analytics increment that completes the baseline. Retroactive governance is rejected as fabricated provenance. |
| Consequences | The final report states which work is orchestrator-run and which is not, with commit ranges (R-16). |

### ADR-014: Policy catalogue format and evaluator (DEC-048)

| Field | Content |
|-------|---------|
| **Approved (DEC-064)** | A JSON catalogue validated by a JSON Schema, with registered check functions by policy id; every constitution MUST is a mandatory policy; the approver confirmed the draft v1.0 catalogue and the non-waivable set. |
| Validation | Completeness test against the MUST list; release-blocking demonstrations RB-1 to RB-5. |

### ADR-015: Redis role and degraded behavior (new, from the stack decision)

| Field | Content |
|-------|---------|
| Decision question | The approved stack names Redis as "cache and idempotency store, ideal for 60-second leases, rate limiting, and fast idempotency key lookups". How is it used without breaking the atomic check-and-commit that DEC-034 requires? |
| Constraint | DEC-034 requires the idempotency record check and the mapping commit to be **one atomic operation**. A commit spanning Redis and PostgreSQL cannot be atomic: a crash or a lease race between the two stores would reintroduce exactly the double-commit that LIM-002's mitigation exists to prevent. |
| Options | **A** **PostgreSQL is the source of truth for idempotency records**; Redis is an accelerator: (a) rate-limit buckets, (b) a replay cache of COMPLETED and FAILED responses with a TTL equal to the remaining retention, (c) an advisory in-flight lock with a 60-second TTL that makes concurrent duplicates fail fast. Correctness never depends on Redis. **B** Redis as the sole authoritative idempotency store, with the mapping in PostgreSQL. **C** No Redis. |
| **Confirmed (DEC-067)** | **A.** It honors the approved stack (Redis does leases, rate limiting, and fast lookups) while keeping DEC-034 satisfiable with a single PostgreSQL transaction (`UPDATE ... WHERE state='IN_PROGRESS' AND request_id=$1 AND lease_expires_at > $now`). |
| Why not B | Option B would make the guarantee depend on cross-store ordering. It could be repaired with fencing tokens, but then PostgreSQL must still enforce the token, which makes PostgreSQL authoritative anyway. |
| Consequences | A Redis outage affects latency and rate limiting only: creation and redirect keep working from PostgreSQL; the service runs in PostgreSQL-only mode (DEC-067): rate limiting uses PostgreSQL-based checks, no advisory lock is taken, and PostgreSQL row-level locking serializes duplicates, which is slower but correct (degraded mode may miss the demonstration latency targets and is labelled when measured); readiness reports the cache check as failed while the service stays ready (FR-021 still reports dependency state). Redis keys: `rl:{dimension}:{hash}`, `idem:{client_id}:{key}`, `idem-lock:{client_id}:{key}`. Redis is bound to loopback, requires a password, and holds no secret or raw URL beyond what the cache needs (the cached response). |
| Risks | R-26: cache and database disagree (stale replay); mitigated because the PostgreSQL record is consulted on a cache miss and on any write path, and the cache is written only after the PostgreSQL commit; a test injects a stale cache entry. |
| Validation | Tests with Redis killed mid-run; tests that a lost cache never changes an outcome; the LIM-002 test (a late commit aborts atomically in PostgreSQL). |

## 4. Best-Practice Findings Applied

| Topic | Practice adopted | Where |
|-------|------------------|-------|
| Idempotency | Fingerprint over normalized inputs, a state machine per key, conditional writes in the source-of-truth database | FR-015 to FR-018; data-model.md |
| Error format | RFC 9457 problem details with stable reason codes | contracts |
| Short codes | `node:crypto` `randomBytes`/`randomInt` (CSPRNG), base62, fixed length 7, unique index with binary collation, bounded collision retry | data-model.md |
| Redirects | Temporary redirect, `Cache-Control: no-store`, `Location` built only from the stored normalized URL | contracts |
| Outbox-style audit | State change and audit event commit in one transaction | orchestration-model.md |
| Optimistic concurrency | Version columns and conditional updates | data-model.md |
| Contract change control | Semantic versioning with an explicit breaking-change list | contracts/README.md |
| Validation defaults | Disable removal of additional properties and type coercion in Ajv | ADR-002 |

## 5. Plan Assumptions

**Approved (DEC-063)**: PA-001 to PA-010, as written.

| ID | Assumption | Related |
|----|------------|---------|
| PA-001 | Per-IP-address-hash limits are three times the per-token limits of PVT-006 (180 creations per minute, 1800 resolutions per minute) | ADR-011, FR-022 |
| PA-002 | Node attempt timeouts: 10 s for deterministic nodes and policy evaluation (reusing PVT-010); 60 minutes logical for external-work nodes | FR-117 |
| PA-003 | At most 3 resumptions per node after interruptions, then safe-stop | FR-121 |
| PA-004 | `Idempotency-Key`: 1 to 128 visible ASCII characters (no spaces) | FR-015 |
| PA-005 | Session token: 32 random bytes, URL-safe encoded; only a hash is stored | ASM-012 |
| PA-006 | Non-ASCII host names are rejected as `invalid_url`; internationalized hosts must be supplied in ASCII punycode form | FR-002, FR-003 |
| PA-007 | URLs containing user information are rejected as `invalid_url` | FR-003, Constitution V |
| PA-008 | Collision-recovery exhaustion is classified transient (HTTP 503) and creates no FAILED idempotency record | FR-007, DEC-033 |
| PA-009 | Audit and measurement timestamps use UTC and RFC 3339 with `clock_kind` | FR-130 |
| PA-010 | An `expires_at` with more than six fractional-second digits is rejected as `malformed_request` rather than rounded | DEC-023, DEC-024 |

**Approved on 2026-10-16 (DEC-070), with PA-011 amended by DEC-067**

| ID | Proposal | Related |
|----|----------|---------|
| PA-011 (amended by DEC-067) | When Redis is unavailable the service falls back to PostgreSQL-only mode: the rate limiter degrades to **PostgreSQL-based checks** (never silently open), no advisory lock is used (PostgreSQL row-level locking instead), the degradation is logged, counted, and audited, and readiness shows the cache check failed while the service stays ready. The text approved as written said in-process buckets; the human's explicit Redis-down decision (PostgreSQL-based) governs | ADR-011, ADR-015, FR-021, FR-022 |
| PA-012 | Package management with npm and a committed `package-lock.json`, `npm ci` for reproducible installs, ES modules, `engines.node >= 20`, strict TypeScript | ADR-001 |
| PA-013 | Libraries around the approved stack: `pg`, `node-pg-migrate`, `ioredis`, `pino`, `prom-client`, `commander` (CLI), `uuid` (v7), `ajv`, `ajv-formats`, `@apidevtools/swagger-parser`, `fast-check`, `secretlint`, `license-checker-rseidelsohn`, ESLint with `typescript-eslint`, `@vitest/coverage-v8` | ADR-001 to ADR-012 |
| PA-014 | Local PostgreSQL and Redis run in containers defined by one Compose file; tests use one database per Vitest worker (created from a template) and a distinct Redis key prefix per test; secrets for the local containers are generated by `orch init`, not committed. Container use is a local-development convenience, not a deployment platform (EXC-002 stands) | ADR-003, ADR-015 |
