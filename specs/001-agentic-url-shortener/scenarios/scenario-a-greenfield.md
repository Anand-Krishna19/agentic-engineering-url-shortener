# Scenario A Design: Greenfield (SCN-A)

**Spec**: [../spec.md](../spec.md) v1.10, SCN-A, FR-110 to FR-113, FR-122, DEC-002 | **Plan**: [../plan.md](../plan.md) | **Model**: [../orchestration-model.md](../orchestration-model.md)

Design only. Nothing here has been executed. Outcomes below are *expected* behavior to be verified; they are not evidence.

## 1. Purpose and Boundary (ADR-013, PD-01)

SCN-A governs a **real greenfield increment that completes the baseline shortener**: redirect analytics capture, the creator's count inspection, and the retention purge. Slices 1 to 3 build the core shortener (create, validate, resolve, expire, persistence, idempotency, rate limiting) under SpecKit **without** the orchestrator; they are labelled "baseline foundation, not orchestrator-run". Scenario A runs through the orchestrator once it exists (slices 4 to 7) and is the part the orchestrator genuinely drives. The final report states this boundary. This reading of DEC-002 needs the human's approval (plan.md PD-01).

Agent mode: `LIVE_EXTERNAL` for the agent nodes (an AI-assisted session fulfils work packages; a human decides every gate). A `SCRIPTED` rehearsal of the same run is kept for determinism and fault injection. Their evidence is labelled separately.

## 2. Initial Input

> As an API consumer, I need to see how many times a short link I created has been followed, so that I can understand its usage. The service must count each successful redirect with its time, make the current count available to the link's creator only, never let a counting problem prevent a redirect, keep per-visit records for 30 days and the running total for the life of the link, and never store visitor identifiers.

## 3. Requirement Interpretation (N02 and N03)

Normalized into statements, each with acceptance criteria and a trace to the approved specification:

| Statement | Content | Traces to |
|-----------|---------|-----------|
| R1 | Each successful redirect increments the link's count and records its timestamp | FR-012, DEC-007 |
| R2 | Failed, expired, or unknown resolutions are not counted | FR-012 NAC |
| R3 | A failure to capture analytics never blocks the redirect; it is logged and audited | FR-014, DEC-007 |
| R4 | The creator, and only the creator, can read the current count; others get the unknown-code response | FR-023, DEC-049 |
| R5 | Per-visit timestamps are purged after 30 days; the aggregate count is kept for the life of the link | ASM-016, DEC-055 |
| R6 | No visitor identifier, address, agent string, or referrer is stored | FR-013, POL-PRV-001 |

Requirement-quality checks recorded: **complete** (actors, data, outcomes, failure behavior, retention all stated), **consistent** (no statement conflicts with another or with an approved item), **testable** (each statement has an observable criterion), **within boundaries** (analytics is an application-plane concern; no new technology, no policy exception needed). Result: **no material ambiguity at ingestion**, so **no clarification gate is inserted**, and the run records why (FR-112): "requirement complete, consistent, testable, within approved policy and architecture boundaries; checks listed".

## 4. Decomposition (N05) and Branches

| Branch | Tasks | Requirements | Depends on |
|--------|-------|--------------|-----------|
| `capture` | Record redirect events and increment the counter inside the redirect path; isolate failures (fail-open); audit failures | R1, R2, R3, R6 | Baseline schema (migration 0001 already has the tables) |
| `inspect` | `GET /v1/links/{code}/stats` for the creator only; identical 404 otherwise | R4 | Baseline |
| `retention` | Purge per-event rows older than 30 days at startup and on an interval; keep the counter | R5 | Baseline |

The branches are independent, which is what lets a later ambiguity suspend one without stopping the others. API and schema impacts (N06, greenfield): the stats operation is already in contract 1.0.0 (no contract change); no schema change (tables exist in migration 0001); a new background job; documentation additions.

## 5. Orchestration Path

1. N01 ingest, N02 normalize (live), N03 detect: none material, N04 SKIPPED with reason.
2. N05 decompose into three branches; N06 impact (greenfield variant).
3. N07 design with ADR entries (analytics write isolation; purge strategy) and G-ARCH. The approver reviews and approves; the decision is bound to the design hash.
4. Fan-out: N08 tests for each branch (red evidence) in parallel with N14 threat model (analytics privacy, read access, enumeration). Join into N09 per branch.
5. N09 per branch implement and refactor; G-CODE per branch artifacts (code and tests). `security_sensitive_change` is true for `inspect` (access control) so G-SEC is also required there.
6. Fan-out: N10 docs, N11 test run per branch, N12 scans (run-level, after all N09), then N15 join, N13 compliance check, N16 risk acceptance (residual: analytics count is a lower bound when captures fail, LIM-related disclosure), N17 readiness and G-REL, N18 summary, N19 G-FINAL.

### 5.1 Later-emerging material ambiguity (suspend only the affected path)

While implementing `capture`, the implementer reports a question the requirement did not answer: **"Do HEAD requests to a short link count as redirects?"** This changes observable API behavior (a HEAD response and whether it is recorded), so N03 logic classifies it **material** (API contract). The engine:

1. Suspends only the `capture` instances (N08, N09, N10, N11 for that branch); `inspect` and `retention` keep running, as does run-level work that does not depend on `capture`.
2. Opens G-AMB with options, for example: A) HEAD returns the same redirect and is not counted; B) HEAD is counted; C) HEAD is rejected. The engine shows the impact analysis of each option (statements R1 and R2, the capture design, capture tests, capture docs).
3. The human decides (the plan does not predetermine the answer). The decision is recorded, the requirement gains statement R1a, and because this changes an approved requirement the G-AMB approval doubles as the G-CHG approval (the change record cites the same approval).
4. Replan v2: slice-level consumption (data-model.md section 3.2) marks only the consumers of the changed statement stale; materially changed approved content (R1) supersedes the requirement and the capture design approvals; `inspect` and `retention` approvals stay valid because their consumed slices did not change. The `capture` branch resumes at the stage that consumed the ambiguous content (design for the capture slice), not at the beginning.

## 6. Approvals

G-ARCH (once), G-AMB (the HEAD question, doubling as G-CHG), G-CODE (per branch), G-SEC (`inspect`), G-RISK, G-REL, G-FINAL. No G-DESTR (no destructive effect) and no G-EXC unless a policy fails and the human chooses an exception.

## 7. Failure Paths (injected in the SCRIPTED rehearsal; organic ones recorded if they occur in the LIVE run)

| ID | Failure | Expected handling |
|----|---------|-------------------|
| A-F1 | Agent attempt times out in N08 `inspect` (simulated) | Transient: retry with backoff; recovery event with mechanism RETRY |
| A-F2 | Agent returns a schema-invalid N09 submission | Transient: retry with feedback |
| A-F3 | The worker is killed during N09 `capture` | Lease expiry; interruption event; resume with mechanism RESUME; no duplicated effect |
| A-F4 | After G-CODE and the patch commit, N12 finds a high-severity finding (fixture) | Policy POL-SEC-005 FAIL blocks; G-SEC reject; the commit is compensated by a revert; replan |
| A-F5 | G-CODE gate unanswered (simulated 24 h twice) | Escalate, then SS-3 safe-stop; late answer rejected; recovery by a new run with `parent_run_id` |

## 8. Validation

Per-branch tests (red evidence, then green), the contract and regression suite, concurrency checks on counter updates (PVT-015), a purge test, the security tests for count access and the redirect path, scans, the compliance check over the full mandatory catalogue, and the tests-for-every-FR report. Performance smoke against PVT-001 is demonstration data.

## 9. Generated Evidence (bundle `evidence/SCN-A/`)

Run export (state, plan versions, lineage), the audit chain with a verification result, normalized requirement versions and the recorded quality checks, the "clarification not required" reason, the ambiguity record and decision, impact analyses, design and ADRs with approvals, red and green run records, test report, scan outputs, policy evaluations, readiness report, final summary, measurement report for the run population with its limitations, and trace report. Each item is labelled with `agent_mode` and `clock_kind`.

## 10. Expected Terminal Outcome

`COMPLETED`. The readiness outcome is determined by the real C1 to C5 results: **READY** only if all hold, otherwise **NOT_READY** with the blocking items listed. This plan does not promise READY; either result is valid, honest evidence. Failure-path runs end `SAFE_STOPPED` (A-F5) or continue to completion after recovery (A-F1 to A-F4).
