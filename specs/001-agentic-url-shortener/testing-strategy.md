# Testing Strategy

**Feature**: `001-agentic-sdlc-url-shortener` | **Spec**: [spec.md](spec.md) v1.10 | **Plan**: [plan.md](plan.md)

Design only. Implements Constitution IV (test-driven engineering) and the release gate "tests executed successfully for all functional requirements" (ASM-013, DEC-052, readiness condition C3). No tests exist yet; everything below is planned and is evidence only after it runs.

## 1. Test-First Protocol (red-green-refactor)

1. **Red**: write the test from the acceptance and negative acceptance criteria. Run it and confirm it fails **for the expected reason** (not an import error or a typo). The run output is saved as a TDD evidence record (command, time, environment, output hash).
2. **Green**: implement the minimum behavior to pass. Save the passing run record.
3. **Refactor**: change structure only while all tests stay green; save the run record.
4. **Commit order** shows it: the commit with the failing test precedes the implementing commit. A checker lists, for each new test file, the red record time and the first implementing commit time, and POL-TEST-001 fails if a test has no earlier red record. Where red-first is impractical (pure documentation, static configuration, generated scaffolding) the exception is recorded explicitly, never implied.

## 2. Requirement Tagging and the Tests-for-Every-FR Gate

- Every test declares the requirements it verifies: a bracketed tag in the test title, `[FR-015]`, and `[FR-015:NAC]` for a test of a negative acceptance criterion (Vitest has no marker facility; a small custom Vitest reporter extracts the tags and emits the per-requirement results).
- A report builder reads the test results and produces, for each of the 56 functional requirements, the executed tests and their outcomes. Readiness condition C3 passes only if **every FR has at least one executed passing test** and every NAC line has a negative test (the mapping from NAC lines to tests is a checklist generated from the specification).
- A test that is skipped, or an FR whose only tests are skipped, does not count.
- The same tags feed the traceability report ([traceability.md](traceability.md)).

## 3. Test Categories

| ID | Category | What it proves | Key requirements | Environment and tools |
|----|----------|----------------|------------------|-----------------------|
| TS-UNIT | Domain unit | Pure logic: URL validation and normalization, destination policy, expiry rules and the boundary rule, code generation properties, signature canonicalization, rate-limit buckets, state-machine transition tables, readiness function | FR-002 to FR-011, FR-015, FR-022, FR-128 | Vitest, `fast-check` for properties, no I/O |
| TS-CONTRACT | API contract | Every response and header conforms to the OpenAPI contract; drift, compatibility, consumer-tolerance checks (CV-01 to CV-10) | FR-001, FR-003, FR-009, FR-016, FR-021, FR-023, FR-102 | Supertest with a wrapper that validates every response against the contract with Ajv |
| TS-PERSIST | Persistence | Repositories against real PostgreSQL (and Redis for the cache layer): constraints, unique code, atomic check-and-commit, append-only triggers, hash chain, migrations up and down, reaper | FR-006, FR-012, FR-018, FR-019, FR-107, FR-130 | Vitest with one database per worker (created from a template) and a distinct Redis key prefix per test; both started by the local Compose file (PA-014) |
| TS-INTEG | Integration | Use cases through the API with real persistence: create, resolve, stats, health, readiness; the control plane API with real state | FR-001 to FR-023 | In-process Fastify app plus real PostgreSQL and Redis |
| TS-ORCH | Orchestration state transitions | Every allowed transition succeeds with the right audit event; every prohibited transition is refused; dependency order, fan-out, synchronization, conditional skip, branch suspension | FR-103 to FR-106, FR-113 | Scripted agents, simulated clock |
| TS-APPROVAL | Approval and rejection | Approver-only decisions; agent and reader denied and audited; subject-hash binding; reject then replan proposal; timeout then escalate then safe-stop; late response rejected; idempotent repeat decisions | FR-109, FR-114 to FR-116, FR-123, FR-133 | Simulated clock |
| TS-RETRY | Retries | Transient retried within the bound with backoff; permanent not retried; no repeated COMMITTED effects | FR-020, FR-117 | Fault injection, simulated clock |
| TS-TIMEOUT | Timeouts | Attempt timeout, work-item lease, 60 s idempotency lease, 24 h gate window, policy-block window | FR-115, FR-117, DEC-030, DEC-044, DEC-045 | Simulated clock; events labelled SIMULATED |
| TS-FALLBACK | Fallback | Defined fallback runs and is audited; never lowers a gate | FR-014, FR-118 | Fault injection |
| TS-COMP | Rollback and compensation | Transaction abort leaves nothing; compensate-only effects compensated in reverse order; failed compensation escalates | FR-119, FR-120 | Fault injection |
| TS-SAFESTOP | Safe-stop | Each trigger SS-1 to SS-7 reaches SAFE_STOPPED with state and evidence preserved; terminal; no resume | FR-120, FR-121 NAC, DEC-050 | Fault injection |
| TS-RESUME | Resumption | A run killed at defined points resumes and ends equal to an uninterrupted run, without duplicated effects | FR-107, FR-121, PVT-011 | Crash hooks at effect and transition boundaries |
| TS-REPLAN | Dynamic replanning | Only the computed affected set re-runs; approvals superseded only for material changes; governance preserved | FR-122, FR-123 | Scripted agents |
| TS-CONC | Concurrency | Unique codes; counters equal successful redirects (PVT-015); same-key duplicates yield one mapping; lease-expired commit aborted; expiry boundary determinism | FR-006, FR-011, FR-017, FR-018, DEC-034 | Concurrent promises released together from a barrier, real PostgreSQL connections, repeated runs |
| TS-SEC | Security | Abuse cases AB-01 to AB-12 and threats TH-01 to TH-16: scheme and address rejection, header injection, token discard, credential separation, secret absence in logs, audit tamper, scoped agent actions with a hostile requirement | FR-003 to FR-005, FR-013, FR-109, FR-127, NFR-001 | Vitest plus scanners |
| TS-E2E | End to end | The three scenarios on the real stack, in SCRIPTED mode (deterministic) and, for Scenario A and B, in LIVE_EXTERNAL mode with real human gates | FR-101 to FR-133 | Both planes running, CLI and API |
| TS-RELEASE | Release-readiness checks | RB-1 to RB-5; the C1 to C5 truth table; determinism; tests-for-every-FR gate; evidence bundle completeness; chain verification | FR-124 to FR-129 | Scripted runs and property tests |

## 4. Key Test Designs

### 4.1 Idempotency and concurrency (FR-015 to FR-018)

- Property tests (`fast-check`): reordered metadata keys give equal signatures; absent equals empty metadata; timezone-offset-equivalent expiries give equal signatures; any change in URL, metadata, or expiry changes the signature; the signature function never reads the clock.
- State tests over the idempotency state machine, including: validation rejection creates no record; transient failure releases the record; permanent failure becomes FAILED and replays for 24 h; a retry after FAILED with the same key replays the failure (never re-executes); a record past its 60 s lease is absent; the retention window starts at the terminal state.
- Concurrency: 50 concurrent creations with distinct keys produce 50 distinct codes and 50 stored mappings; two concurrent same-key same-signature requests produce exactly one mapping and one 409 `idempotency_request_in_progress` or a replay; a slow request that outlives its lease cannot commit (the atomic conditional update changes zero rows) while the superseding retry succeeds, producing exactly one mapping. These run repeatedly to expose flakiness, and use the simulated clock rather than sleeps.

### 4.1a Redis and degraded behavior (ADR-015, PA-011)

- A lost or flushed Redis changes no outcome: the same requests give the same results with the cache empty.
- A **stale or poisoned** replay-cache entry (injected) never overrides the PostgreSQL record on a write decision (TH-14).
- With Redis killed mid-run: creation and redirect still work; the limiter degrades to in-process buckets and still limits; readiness reports the cache check as failed while the service stays ready; the degradation is logged, counted, and audited.
- The advisory lock never allows a second commit: with the lock removed, concurrent same-key requests still produce one mapping through the PostgreSQL conditional update.
- Rate-limit buckets use the simulated clock passed into the script, so refill is deterministic.
### 4.2 Expiry and clock behavior (FR-010, FR-011)

Boundary: resolution at `expires_at - 1 µs` redirects, at `expires_at` returns 410. Concurrent resolutions at the boundary return the same outcome because they share one comparison function and one clock reading per request. Validation window tests: `expires_at` equal to now is rejected, now plus 365 days is accepted, one microsecond more is rejected; relative fields are rejected with `unsupported_expiry_representation`.

### 4.3 Analytics (FR-012 to FR-014, FR-023)

N redirects give count N; failed, expired, and unknown resolutions never increment; an injected capture failure leaves the redirect intact and produces a log and an audit record; per-event rows older than 30 days are purged while the aggregate count is unchanged (DEC-055); only the creating client reads the count, and any other caller receives the same 404 as an unknown code.

### 4.4 Orchestration (FR-103 to FR-123)

A table-driven test enumerates every (from, to) pair of node states: allowed ones assert the audit event and guard; prohibited ones assert refusal and no state change. Graph tests assert that no node starts before its dependencies, that parallel branches overlap in time (simulated clock instrumentation), and that the join waits for all. Replanning tests assert the executed set equals the computed affected set, and that an approval on unchanged content stays valid while one on materially changed content is superseded.

### 4.5 Evidence honesty

Tests assert: SCRIPTED output can never be labelled LIVE_EXTERNAL; measurement reports always carry data nature and limitations; the MTTR denominator excludes unrecovered events (a test builds a population with two recovered and one unrecovered event and asserts `mttr = total / 2`, unrecovered count 1); a zero-recovery population yields a null MTTR, not zero.

## 5. Test Data and Fixtures

| Fixture | Purpose |
|---------|---------|
| URL corpora (valid, invalid, length boundary at 2048 and 2049, IPv4 and IPv6 internal forms, schemes, control characters, internationalized hosts, user information) | TS-UNIT, TS-SEC |
| `Clock` fakes and a controllable simulated clock | All time behavior; events labelled SIMULATED |
| Fault injection hooks (persistence, agent, analytics, crash points, compensation) | TS-RETRY, TS-RESUME, TS-COMP, TS-SAFESTOP |
| Scripted agent scenarios | Deterministic node outputs, including malformed ones |
| Hostile requirement fixture | Prompt-injection attempt (TH-06) |
| Seeded fake secret and a vulnerable-dependency scanner output fixture | Negative controls for POL-SEC-002 and POL-SEC-005 |
| Golden evidence bundle | Regression of the export format |

## 6. Performance and Scalability Checks (demonstration, PVT-001 to PVT-005)

A small local load script exercises creation and redirect at the target rates on the single-node environment, records percentile latencies and error counts, and labels the result `DEMONSTRATION` (DEC-013). These are checks against approved demonstration goals, not release gates (ASM-013), and are never presented as production statistics. If a target is missed the result is reported as missed.

## 7. Coverage and Quality Gates

- Statement coverage at least 90% on domain and orchestration logic and every FR with at least one executed test (PVT-012). The coverage figure is demonstration data.
- Static checks: ESLint with `typescript-eslint` (including a rule that bans `Date.now()` and `new Date()` outside the wall-clock adapter, ADR-010), `tsc --noEmit` in strict mode, and import-boundary rules (POL-ARCH-001).
- Scans: `npm audit`, `secretlint` (with the seeded negative control), `license-checker-rseidelsohn`.
- Mutation testing is backlog BL-08.

## 8. Run Order (one command per stage, all part of "verify")

lint and types, TS-UNIT, TS-CONTRACT, TS-PERSIST, TS-INTEG, TS-ORCH, TS-APPROVAL, TS-RETRY, TS-TIMEOUT, TS-FALLBACK, TS-COMP, TS-SAFESTOP, TS-RESUME, TS-REPLAN, TS-CONC, TS-SEC, scans, TS-E2E (scripted), TS-RELEASE, traceability and tests-for-every-FR report. Outputs are stored as evidence with the environment and time.

## 9. Test-to-Requirement Coverage Plan

Detailed IDs are assigned when tasks are generated. The plan guarantees at least these categories per requirement group (full mapping in traceability.md).

| Requirement group | Categories | Notable negative tests |
|-------------------|------------|------------------------|
| FR-001 to FR-005 | UNIT, CONTRACT, INTEG, SEC | Rejected request stores nothing and consumes no code; schemes; internal addresses; length 2049 |
| FR-006 to FR-011 | UNIT, PERSIST, CONC, CONTRACT | No code reassignment; identical 404; 410 distinct from 404; boundary determinism |
| FR-012 to FR-014, FR-023 | UNIT, PERSIST, INTEG, SEC | Failed resolutions not counted; capture failure does not block; non-owner gets 404 |
| FR-015 to FR-018 | UNIT, PERSIST, CONC | 409 on any signature difference; in-flight duplicate; FAILED replay; lease abort |
| FR-019 to FR-022 | PERSIST, RETRY, INTEG, SEC | No success on unsaved mapping; no internal detail; token-discard bypass fails |
| FR-101 to FR-109 | ORCH, APPROVAL, SEC | Direct state edit refused; agent self-approval denied |
| FR-110 to FR-116 | ORCH, APPROVAL, TIMEOUT, E2E | No artificial gate for a clean requirement; silent resolution of a material ambiguity refused; timeout never approves; late response rejected |
| FR-117 to FR-123 | RETRY, FALLBACK, COMP, SAFESTOP, RESUME, REPLAN | No repeated non-idempotent effect; fallback never lowers a gate; failed compensation not ignored; safe-stop never resumed |
| FR-124 to FR-129 | RELEASE, ORCH, E2E | Mandatory FAIL blocks; unapproved exception blocks; summary claims all linked |
| FR-130 to FR-133 | PERSIST, ORCH, SEC, E2E | Audit rows not editable; gaps shown not hidden; unreviewed generated artifact not merge-eligible |
