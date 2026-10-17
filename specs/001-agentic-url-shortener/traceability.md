# Traceability Design

**Feature**: `001-agentic-sdlc-url-shortener` | **Spec**: [spec.md](spec.md) v1.11 | **Plan**: [plan.md](plan.md)

Design only. Covers FR-132, POL-TRC-001, Constitution X. The downstream columns below are **intentionally unfilled** ("pending"): they are populated from real artifacts as each stage happens, never pre-filled.

**Status after T010** (commit `5645f5b`): the Task, Code, and Docs cells below are filled only where code exists, and only as far as it exists. Where a group is partly built the cell says "partial". Per-requirement evidence, counts, and every gap are in [section 6](#6-implementation-status-after-t001-to-t010).

## 1. The Chain

```text
Requirement -> Scenario -> Design -> ADR -> Task -> Code -> Test -> Validation -> Documentation -> Evidence
```

| Link | Identifier | Where it is recorded |
|------|------------|----------------------|
| Requirement | `FR-nnn`, `NFR-nnn`, `DEC-nnn`, `ASM-nnn` | spec.md |
| Scenario | `US-n`, `SCN-A/B/C` | spec.md and [scenarios/](scenarios/) |
| Design | Component ids `C-*` (section 3), contract operation ids, data-model sections | plan.md, data-model.md, orchestration-model.md, contracts/ |
| ADR | `ADR-nnn` | research.md now; `docs/adr/` once approved |
| Task | `Tnnn` | tasks.md (generated later by `/speckit-tasks`) |
| Code | Source file header `Implements: FR-...` | `src/` |
| Test | Requirement tag in the test title, `[FR-015]` or `[FR-015:NAC]`, extracted by a Vitest reporter | `tests/` |
| Validation | A recorded run of a test category or check (`TS-*`, `CV-*`, `RB-*`) | `evidence/` |
| Documentation | Front matter `Requirements: FR-...` | `docs/`, contracts |
| Evidence | `EV-TEST`, `EV-LOG`, `EV-METRIC`, `EV-AUDIT`, `EV-ART`, `EV-APPROVAL` with content hash | `evidence/` bundle manifest |

## 2. Mechanism

1. **Declare at the source.** Tasks, code, tests, and documents declare the requirement ids they serve (formats above). A test checks that every module in the domain and application layers has an `Implements:` header.
2. **Build the graph.** `orch trace` parses the specification for ids, then tasks, code headers, test markers, documents, and the evidence manifest, and writes `evidence/trace-report.json` plus a readable table.
3. **Both directions.** From any id the report answers "what depends on this" and "what supports this". A requirement with no test, a test with no requirement, code with no requirement, or a document with no requirement is a **gap**.
4. **Gaps are shown, never hidden.** The report lists every gap explicitly with its location; a gap is never reported as complete (FR-132 NAC). Policy POL-TRC-001 fails on gaps in mandatory links; the release-readiness function (C3) fails if any functional requirement lacks an executed passing test.
5. **Orchestrator runs trace too.** Each run's lineage (requirement, decisions, artifact versions, approvals, evidence) is exported with the evidence bundle, so a run is traceable from requirement to evidence without the source tree.

## 3. Design Components (ids used above)

| Plane | Components |
|-------|-----------|
| Application | `C-API` delivery; `C-VAL` URL validation, normalization, destination policy; `C-CODE` short-code generation; `C-EXP` expiry rules; `C-IDEM` idempotency and signatures; `C-CLIENT` client identity and rate limiting; `C-LINK` link use cases and repository; `C-ANA` analytics, stats, purge; `C-HEALTH`; `C-TEL` telemetry; `C-CFG` configuration; `C-PERS` persistence and migrations |
| Control | `C-ENGINE` graph, state machine, scheduler; `C-NODES` node catalogue and predicates; `C-GATE` approval governance; `C-AGENT` agent port, adapters, work items; `C-RELIAB` retries, leases, compensation, safe-stop, recovery; `C-REPLAN`; `C-POL` policy catalogue, evaluator, readiness; `C-CHG` change and exception workflows; `C-AUDIT` audit chain; `C-LINEAGE` artifacts and trace; `C-OBS` metrics, MTTR, evidence export; `C-CAPI` control API and CLI; `C-AUTH` credentials |

## 4. Traceability Matrix (seed)

"pending" means to be filled from real artifacts; no value here is evidence.

| Requirement group | Scenario or journey | Design components and contracts | ADR | Tests (planned categories) | Validation and evidence (planned) | Task | Code | Docs |
|-------------------|---------------------|---------------------------------|-----|----------------------------|-----------------------------------|------|------|------|
| FR-001 to FR-005 | US-1, SCN-A | C-API, C-VAL, C-LINK; `createLink` | ADR-001, 002, 009 | UNIT, CONTRACT, INTEG, SEC | EV-TEST, EV-LOG | T001, T004, T006, T008 | `src/shortener/domain/url/validator.ts`, `src/shortener/app/create-link/`, `src/shortener/adapters/api/create-link.ts` | `docs/setup.md` (T006, T008) |
| FR-006 to FR-011 | US-1, SCN-A, SCN-B | C-CODE, C-EXP, C-LINK, C-PERS; `resolveLink` | ADR-003, 010 | UNIT, PERSIST, CONC, CONTRACT | EV-TEST | T003, T007, T009, T010 | `src/shortener/domain/code/generator.ts`, `src/shortener/domain/expiry/checker.ts`, `src/shortener/app/resolve-link/`, `src/shortener/adapters/api/resolve-link.ts`, `docker/init-db/001-schema.sql` | `docs/setup.md` (T003, T007, T009, T010) |
| FR-012 to FR-014, FR-023 | US-1, SCN-A | C-ANA; `getLinkStats` | ADR-003, 008 | UNIT, PERSIST, INTEG, SEC | EV-TEST, EV-LOG, EV-AUDIT | T009, T010 (FR-023 none) | `src/shortener/domain/analytics/capture.ts`, `src/shortener/adapters/persistence/redirect-repository.ts`; partial: FR-023 stats endpoint not built | `docs/setup.md` (T009, T010) |
| FR-015 to FR-018 | US-1, SCN-A, SCN-B | C-IDEM, C-LINK, C-PERS | ADR-003, 010 | UNIT, PERSIST, CONC | EV-TEST | T003, T008 | `src/shortener/domain/idempotency/signature.ts`, `src/shortener/app/create-link/service.ts`, `src/shortener/adapters/persistence/idempotency-repository.ts` | `docs/setup.md` (T008) |
| FR-019, FR-020 | US-1, SCN-A | C-PERS, C-LINK (bounded retry wrapper) | ADR-003 | PERSIST, RETRY | EV-TEST, EV-METRIC | T008, T009 (FR-020 none) | partial: error responses carry no internals; the bounded retry wrapper (FR-020) is not built | `docs/setup.md` (T008) |
| FR-021, FR-022 | US-1, US-4 | C-HEALTH, C-CLIENT | ADR-008, 011 | INTEG, SEC | EV-TEST | T004 (FR-022 none) | `src/health.ts`, `src/server.ts`; partial: FR-022 rate limiting and client identity not built | `docs/setup.md` (T004) |
| FR-101 to FR-104 | US-2, SCN-A | C-ENGINE, C-NODES, C-CAPI | ADR-004 | ORCH | EV-TEST, EV-AUDIT | T003, T005 (types and schema only) | partial: `src/types/orchestration.ts`, `workflow_runs` in `001-schema.sql`; no workflow engine | `docs/setup.md` (T003, T005) |
| FR-105 to FR-109 | US-2, SCN-A | C-ENGINE, C-AGENT, C-LINEAGE, C-AUTH | ADR-004, 005, 007 | ORCH, APPROVAL, SEC | EV-TEST, EV-AUDIT | T003, T005 (FR-107 types and schema only) | partial: `src/types/orchestration.ts`, `docker/init-db/001-schema.sql` | `docs/setup.md` (T003, T005) |
| FR-110 to FR-113 | US-2, US-3, SCN-A, SCN-C | C-NODES (N02 to N04), C-GATE | ADR-004 | ORCH, APPROVAL, E2E | EV-AUDIT, EV-ART | pending | pending | pending |
| FR-114 to FR-116 | US-3, SCN-A, SCN-C | C-GATE, C-AUTH, C-RELIAB | ADR-007, 010 | APPROVAL, TIMEOUT | EV-APPROVAL, EV-AUDIT | pending | pending | pending |
| FR-117 to FR-121 | US-2, SCN-A, SCN-B | C-RELIAB, C-ENGINE | ADR-004, 010 | RETRY, FALLBACK, COMP, SAFESTOP, RESUME | EV-TEST, EV-METRIC, EV-AUDIT | pending | pending | pending |
| FR-122, FR-123 | US-3, SCN-A, SCN-B, SCN-C | C-REPLAN, C-LINEAGE, C-GATE | ADR-004 | REPLAN | EV-TEST, EV-AUDIT | pending | pending | pending |
| FR-124 to FR-127 | US-3, US-4, SCN-B | C-POL, C-CHG | ADR-012, 014 | RELEASE, SEC | EV-AUDIT, EV-ART | pending | pending | pending |
| FR-128, FR-129 | US-4, US-5, SCN-A | C-POL, C-LINEAGE | ADR-014 | RELEASE, E2E | EV-AUDIT, EV-ART | pending | pending | pending |
| FR-130 to FR-132 | US-5 | C-AUDIT, C-OBS, C-LINEAGE | ADR-006, 008 | PERSIST, ORCH, E2E | EV-AUDIT, EV-METRIC, EV-ART | T003, T005 (FR-130 types and schema only) | partial: `src/types/audit.ts`, `audit_events` table and triggers; no audit writer, no hash chaining | `docs/setup.md` (T003, T005) |
| FR-133 | US-2, US-3, SCN-A, SCN-B | C-GATE, C-AGENT | ADR-005, 007 | APPROVAL, E2E | EV-APPROVAL, EV-TEST | pending | pending | pending |
| NFR-001 | all | security.md controls | ADR-007, 012 | SEC | EV-TEST, EV-ART (scans) | pending | pending | pending |
| NFR-002, NFR-008 | all | reliability.md | ADR-003, 004, 010 | RETRY to RESUME | EV-TEST, EV-METRIC | T002 (infrastructure only) | partial: `docker-compose.yml` health checks | `docs/setup.md` (T002) |
| NFR-003, NFR-007 | US-1 | C-API, C-PERS, C-CLIENT | ADR-003, 011 | performance smoke | EV-METRIC (demonstration) | pending | pending | pending |
| NFR-004 | all | Ports and adapters; import-boundary test | ADR-001 to 004 | UNIT (boundaries) | EV-TEST | T001 | `eslint.config.js` (plane and import-direction rules); partial: see section 6 | `docs/setup.md` (T001) |
| NFR-005, NFR-006 | all | C-TEL, C-AUDIT, C-OBS | ADR-006, 008 | PERSIST, SEC | EV-LOG, EV-AUDIT | T004 (NFR-005 logs only) | partial: `src/logger.ts`; no metrics, no audit correlation yet | `docs/setup.md` (T004) |
| NFR-009 | all | testing-strategy.md | ADR-012 | all | EV-TEST | T001 | partial: Vitest, ESLint, strict `tsc`; no coverage tool or requirement-tag reporter | `docs/setup.md` (T001 to T010) |
| NFR-010 | SCN-B | C-CHG, contracts/README.md | ADR-009 | CONTRACT, regression | EV-ART, EV-TEST | pending | pending | pending |
| NFR-011 | US-3 | C-GATE, C-AGENT, C-AUTH | ADR-005, 007 | APPROVAL, SEC | EV-AUDIT | pending | pending | pending |

## 5. Decision and ADR Lineage

| ADR (proposed) | Subject | Principal requirements and decisions |
|----------------|---------|--------------------------------------|
| ADR-001 | Language and runtime | NFR-004, ASM-007 |
| ADR-002 | Web framework | FR-001 to FR-023, NFR-004 |
| ADR-003 | Persistence | FR-015 to FR-020, DEC-034, ASM-014 |
| ADR-004 | Orchestration engine | FR-103 to FR-123 |
| ADR-005 | Agent invocation | FR-109, FR-133, ASM-017, DEC-001 |
| ADR-006 | Audit integrity | FR-130, NFR-006 |
| ADR-007 | Approval proof | FR-114, DEC-037, DEC-018 |
| ADR-008 | Telemetry | NFR-005, FR-131 |
| ADR-009 | Contracts and validation | FR-126, NFR-010 |
| ADR-010 | Time and determinism | DEC-044, DEC-045, FR-011, FR-115 |
| ADR-011 | Rate limiting | FR-022, DEC-057 |
| ADR-012 | Test and scan tooling | NFR-009, FR-127, DEC-054 |
| ADR-013 | Evidence modes and bootstrapping | DEC-002, Constitution X |
| ADR-014 | Policy catalogue | FR-101, FR-124, DEC-048 |

## 6. Implementation Status After T001 to T010

Built from the code and the test titles at commit `5645f5b`. Test counts are **test definitions** whose title carries the requirement tag (an `it.each` counts once); the executed result is the full suite: 14 files, 381 tests passed, lint and strict typecheck clean. Test paths are relative to `tests/`. Red-first runs and mutation checks per task are recorded in `docs/setup.md`.

### 6.1 Requirement to task, code, and tests

| Requirement | Task | Code | Tagged tests | Status |
|-------------|------|------|--------------|--------|
| FR-001 | T008 | `app/create-link/handler.ts`, `service.ts`, `adapters/api/create-link.ts` | integration/create (1), persistence/schema (2) | Implemented |
| FR-002 | T006, T008 | `domain/url/validator.ts` | unit/url (3), integration/create (1) | Implemented |
| FR-003 | T006, T008 | `domain/url/validator.ts` | unit/url (7), integration/create (3) | Implemented |
| FR-004 | T006 | `domain/url/validator.ts` | unit/url (2); range-tagged `[FR-003..005]` cases in integration/create | Implemented |
| FR-005 | T006 | `domain/url/validator.ts` | unit/url (8); range-tagged cases in integration/create | Implemented; DNS rebinding (R-18) disclosed, not detected |
| FR-006 | T003, T007, T009 | `001-schema.sql`, `domain/code/generator.ts`, `adapters/persistence/short-link-repository.ts` | persistence/code (5), unit/code (1), persistence/schema (1), integration/redirect (1) | Implemented |
| FR-007 | T007 | `domain/code/generator.ts` | unit/code (11), persistence/code (3) | Implemented |
| FR-008 | T009 | `app/resolve-link/`, `adapters/api/resolve-link.ts` | integration/redirect (6) | Implemented |
| FR-009 | T009 | `app/resolve-link/handler.ts`, `adapters/api/resolve-link.ts` | integration/redirect (3) | Implemented |
| FR-010 | T008, T009, T010 | `domain/expiry/checker.ts` | unit/expiry (7), integration/create (1), integration/redirect (1) | Implemented |
| FR-011 | T009, T010 | `domain/expiry/checker.ts` (`isExpired`) | unit/expiry (3), integration/redirect (2) | Implemented; sub-millisecond digits lost when read back as a Date |
| FR-012 | T009, T010 | `domain/analytics/capture.ts`, `adapters/persistence/redirect-repository.ts` | unit/analytics (2), integration/redirect (1) | Implemented |
| FR-013 | T004, T009, T010 | `logger.ts`, `domain/analytics/capture.ts` | unit/analytics (1), integration/redirect (1), unit/server (1) | Implemented |
| FR-014 | T009, T010 | `domain/analytics/capture.ts`, `redirect-repository.ts` | unit/analytics (5), integration/redirect (1) | Implemented; no failure metric yet |
| FR-015 | T003, T008 | `app/create-link/service.ts`, `adapters/persistence/idempotency-repository.ts` | integration/create (2), persistence/schema (1) | Implemented |
| FR-016 | T008 | `app/create-link/service.ts`, `adapters/api/create-link.ts` | integration/create (1) | Implemented |
| FR-017 | T008, T009 | `idempotency-repository.ts`, `redirect-repository.ts` | integration/create (2), integration/redirect (1) | Implemented |
| FR-018 | T008 | `idempotency-repository.ts` | integration/create (1) | Implemented |
| FR-019 | T008, T009 | `app/create-link/service.ts` (`problem`) | integration/create (2) | Partial: no-leak asserted for create and resolve failures |
| FR-021 | T004 | `health.ts`, `server.ts` | unit/server (7) | Partial: `/readyz` reports ready with an empty checks map; no persistence check is registered |
| FR-101 | T003, T005 | `types/orchestration.ts`, `workflow_runs` | unit/types (3) | Partial: types and table only |
| FR-102 | T005 | `types/orchestration.ts` (`WorkflowState`) | unit/types (1) | Partial: type only |
| FR-107 | T003, T005 | `001-schema.sql`, `types/orchestration.ts` | persistence/schema (2), unit/types (5) | Partial: schema and types only |
| FR-130 | T003, T005 | `audit_events` table and triggers, `types/audit.ts` | unit/types (5), persistence/schema (ADR-006 tagged) | Partial: schema and types only; no audit writer, no hash chaining |
| NFR-002, NFR-008 | T002 | `docker-compose.yml` | unit/compose (2), (1) | Partial: infrastructure; containers verified healthy once by hand (recorded in docs) |
| NFR-004 | T001 | `eslint.config.js` | unit/scaffold (2) | Partial: the test asserts the rule text; a violation was confirmed by hand once, with no automated lint-behaviour test for the plane rules |
| NFR-005 | T004 | `logger.ts` | unit/server (5) | Partial: logs only; no metrics, no audit correlation |
| NFR-009 | T001 | Vitest, ESLint, strict `tsc` | unit/scaffold (1) | Partial: no coverage tool (PVT-012 is unmeasured) and no requirement-tag reporter (ADR-012) |

Decisions and ADRs exercised by tests: DEC-006, 016, 017, 023, 024, 025, 029, 030, 031, 033, 034, 095, 098, 113; ADR-001, 002, 003, 006, 009, 010, 015 (PostgreSQL-only mode), 016, 017, 018, 023, 025, 027; PA-004, 006, 007, 008, 010; PVT-010.

### 6.2 Gaps (never reported as complete)

- **No code and no test:** FR-020 (bounded persistence retry, backoff, per-attempt timeout), FR-022 (rate limiting and client identity, ASM-012, session tokens), FR-023 (creator-only stats endpoint, `getLinkStats`).
- **Control plane not built:** FR-103 to FR-106, FR-108 to FR-129, FR-131 to FR-133, and the behaviour behind FR-101, FR-102, FR-107, FR-130 (only types and tables exist). Orchestration scenarios SCN-A, SCN-B, SCN-C have no run.
- **Partial, see 6.1:** FR-019, FR-021, NFR-002, NFR-004, NFR-005, NFR-006, NFR-008, NFR-009.
- **Not measured:** PVT-012 coverage (no coverage tool); NFR-001 security scans; NFR-003 and NFR-007 performance; `/metrics` has no collectors.
- **Known limitations carried by the code:** a code of `healthz` or `metrics` would be shadowed by the operational routes; `isExpired` loses sub-millisecond digits; the idempotency reaper is lazy per key only.
- **Gate not yet run:** the mechanical per-requirement gate (readiness condition C3, POL-TRC-001) and `orch trace` do not exist yet, so this section is hand-built from the code and test titles, not produced by the trace mechanism in section 2. Treat the counts as a snapshot.
