# Traceability Design

**Feature**: `001-agentic-sdlc-url-shortener` | **Spec**: [spec.md](spec.md) v1.11 | **Plan**: [plan.md](plan.md)

Design only. Covers FR-132, POL-TRC-001, Constitution X. The downstream columns below are **intentionally unfilled** ("pending"): they are populated from real artifacts as each stage happens, never pre-filled.

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
| FR-001 to FR-005 | US-1, SCN-A | C-API, C-VAL, C-LINK; `createLink` | ADR-001, 002, 009 | UNIT, CONTRACT, INTEG, SEC | EV-TEST, EV-LOG | pending | pending | pending |
| FR-006 to FR-011 | US-1, SCN-A, SCN-B | C-CODE, C-EXP, C-LINK, C-PERS; `resolveLink` | ADR-003, 010 | UNIT, PERSIST, CONC, CONTRACT | EV-TEST | pending | pending | pending |
| FR-012 to FR-014, FR-023 | US-1, SCN-A | C-ANA; `getLinkStats` | ADR-003, 008 | UNIT, PERSIST, INTEG, SEC | EV-TEST, EV-LOG, EV-AUDIT | pending | pending | pending |
| FR-015 to FR-018 | US-1, SCN-A, SCN-B | C-IDEM, C-LINK, C-PERS | ADR-003, 010 | UNIT, PERSIST, CONC | EV-TEST | pending | pending | pending |
| FR-019, FR-020 | US-1, SCN-A | C-PERS, C-LINK (bounded retry wrapper) | ADR-003 | PERSIST, RETRY | EV-TEST, EV-METRIC | pending | pending | pending |
| FR-021, FR-022 | US-1, US-4 | C-HEALTH, C-CLIENT | ADR-008, 011 | INTEG, SEC | EV-TEST | pending | pending | pending |
| FR-101 to FR-104 | US-2, SCN-A | C-ENGINE, C-NODES, C-CAPI | ADR-004 | ORCH | EV-TEST, EV-AUDIT | pending | pending | pending |
| FR-105 to FR-109 | US-2, SCN-A | C-ENGINE, C-AGENT, C-LINEAGE, C-AUTH | ADR-004, 005, 007 | ORCH, APPROVAL, SEC | EV-TEST, EV-AUDIT | pending | pending | pending |
| FR-110 to FR-113 | US-2, US-3, SCN-A, SCN-C | C-NODES (N02 to N04), C-GATE | ADR-004 | ORCH, APPROVAL, E2E | EV-AUDIT, EV-ART | pending | pending | pending |
| FR-114 to FR-116 | US-3, SCN-A, SCN-C | C-GATE, C-AUTH, C-RELIAB | ADR-007, 010 | APPROVAL, TIMEOUT | EV-APPROVAL, EV-AUDIT | pending | pending | pending |
| FR-117 to FR-121 | US-2, SCN-A, SCN-B | C-RELIAB, C-ENGINE | ADR-004, 010 | RETRY, FALLBACK, COMP, SAFESTOP, RESUME | EV-TEST, EV-METRIC, EV-AUDIT | pending | pending | pending |
| FR-122, FR-123 | US-3, SCN-A, SCN-B, SCN-C | C-REPLAN, C-LINEAGE, C-GATE | ADR-004 | REPLAN | EV-TEST, EV-AUDIT | pending | pending | pending |
| FR-124 to FR-127 | US-3, US-4, SCN-B | C-POL, C-CHG | ADR-012, 014 | RELEASE, SEC | EV-AUDIT, EV-ART | pending | pending | pending |
| FR-128, FR-129 | US-4, US-5, SCN-A | C-POL, C-LINEAGE | ADR-014 | RELEASE, E2E | EV-AUDIT, EV-ART | pending | pending | pending |
| FR-130 to FR-132 | US-5 | C-AUDIT, C-OBS, C-LINEAGE | ADR-006, 008 | PERSIST, ORCH, E2E | EV-AUDIT, EV-METRIC, EV-ART | pending | pending | pending |
| FR-133 | US-2, US-3, SCN-A, SCN-B | C-GATE, C-AGENT | ADR-005, 007 | APPROVAL, E2E | EV-APPROVAL, EV-TEST | pending | pending | pending |
| NFR-001 | all | security.md controls | ADR-007, 012 | SEC | EV-TEST, EV-ART (scans) | pending | pending | pending |
| NFR-002, NFR-008 | all | reliability.md | ADR-003, 004, 010 | RETRY to RESUME | EV-TEST, EV-METRIC | pending | pending | pending |
| NFR-003, NFR-007 | US-1 | C-API, C-PERS, C-CLIENT | ADR-003, 011 | performance smoke | EV-METRIC (demonstration) | pending | pending | pending |
| NFR-004 | all | Ports and adapters; import-boundary test | ADR-001 to 004 | UNIT (boundaries) | EV-TEST | pending | pending | pending |
| NFR-005, NFR-006 | all | C-TEL, C-AUDIT, C-OBS | ADR-006, 008 | PERSIST, SEC | EV-LOG, EV-AUDIT | pending | pending | pending |
| NFR-009 | all | testing-strategy.md | ADR-012 | all | EV-TEST | pending | pending | pending |
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
