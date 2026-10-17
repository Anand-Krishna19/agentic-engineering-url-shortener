# Scenario B Design: Brownfield (SCN-B, change request CR-001)

**Spec**: [../spec.md](../spec.md) v1.11, SCN-B, FR-122, FR-123, FR-126, DEC-002, DEC-014, DEC-025, ASM-008 | **Plan**: [../plan.md](../plan.md) | **Contracts**: [../contracts/README.md](../contracts/README.md)

Design only. Nothing here has been executed. Values marked *proposal* are options the human decides during the run; they are not decided by this plan (ASM-008).

## 1. Purpose

Demonstrate an enhancement against the established baseline (the output of Scenario A, DEC-002): add an optional `metadata` object to the creation request. It shows API schema evolution, persistence migration, impact analysis before any code change, regression testing, change approval, rollout, and rollback or compensation.

Agent mode: `LIVE_EXTERNAL` with real human gates, plus a `SCRIPTED` rehearsal for fault injection.

## 2. Initial Input

> Add an optional `metadata` field to the short-link creation request: a set of string key-value pairs stored with the link so that API consumers can attach their own labels. Existing clients and existing links must not be affected.

## 3. Requirement Interpretation

| Statement | Content | Note |
|-----------|---------|------|
| M1 | `metadata` is an optional JSON object of string keys to string values on `POST /v1/links` | New contract field |
| M2 | Existing requests without `metadata` behave exactly as before | Backward compatibility |
| M3 | Metadata is stored with the link | Persistence migration |
| M4 | Metadata participates in the idempotency signature in canonical form; absent and empty are equivalent | DEC-025 (already decided) |
| M5 | Bounds, permitted characters, where metadata is returned, and logging treatment | **Not specified** |

Ambiguity detection: M5 is a **material** ambiguity (API contract, persistence schema, security boundary), and ASM-008 requires the brownfield workflow to define these values before implementation. So, unlike Scenario A, a clarification gate **is** correct here. Questions put to the human at G-AMB, each with *proposal* options and the impact of each:

| Question | Example *proposal* options |
|----------|----------------------------|
| Bounds | At most 16 pairs; keys 1 to 64 characters from `A-Za-z0-9_.-`; values 0 to 256 characters of printable UTF-8 |
| Where metadata is returned | Echoed in the creation response only; also in the stats response; not returned |
| Logging | Never logged (keys or values); log only the count of pairs |

## 4. Impact Analysis (N06, before any code change)

| Category | Identified impact |
|----------|-------------------|
| Components | Request model, creation use case, validation, idempotency signature builder, persistence repository, API delivery, OpenAPI contract, migration runner |
| Interfaces | `POST /v1/links` request schema (additive optional field); possibly the response; contract 1.0.0 to 1.1.0 (MINOR if compatible) |
| Data flows | Create path writes `metadata_json`; replay returns the stored response; metadata never enters analytics or logs |
| Tests | Contract tests, idempotency property tests (absent equals empty; reordered keys), persistence and migration tests, regression suite, security tests for the new input, log-redaction test |
| Documentation | OpenAPI file, API change notes, data model, runbook |
| Regression risks | The signature change must not invalidate in-flight keys (absent equals `{}` preserves v1.0 signatures); validation order; a new unbounded input; secret-like values in logs |
| Rollout and rollback | Expand-then-contract: apply migration `0002` (nullable column), deploy the handler, run regression. Rollback before release: abort the migration transaction. After release: compensate with a forward migration that ignores the column; never drop destructively without G-DESTR |

Predicates: `is_brownfield` true; `security_sensitive_change` true (a new stored, untrusted input); `has_destructive_effect` false. The impact record becomes a change record ([examples/change-record.illustrative.json](../contracts/examples/change-record.illustrative.json) shows the shape): owner, version impact MINOR, backward-compatibility, affected consumers, tests, documentation, rollout and migration steps, required approval.

## 5. Decomposition and Orchestration Path

Branches: `contract` (OpenAPI 1.1.0, compatibility check), `persistence` (migration `0002` up and down), `behavior` (validation, canonicalization, creation, replay), `regression` (full suite plus new tests).

1. N01 to N03 (material ambiguity found), N04 G-AMB (the three questions), replan (new requirement version; materially changed approved content is superseded).
2. N05 decompose; N06 impact analysis and change record; **G-CHG** (formal change approval for the schema and contract change, FR-126); N07 design and **G-ARCH**.
3. Fan-out: N08 tests and N14 threat model; N09 per branch with **G-CODE**; **G-SEC** (security-sensitive input).
4. N10 docs, N11 tests (including the full regression suite), N12 scans, join, N13 compliance, N16 if residual risk, N17 and **G-REL**, N18, N19 **G-FINAL**.

## 6. Approvals

G-AMB, G-CHG, G-ARCH, G-CODE (per branch), G-SEC, G-REL, G-FINAL; G-RISK if residual risk remains. No G-DESTR because the migration is additive.

## 7. Failure and Control Paths

| ID | Situation | Expected handling |
|----|-----------|-------------------|
| B-F1 | The agent drafts `metadata` as a **required** field while declaring a MINOR change | The compatibility checker computes MAJOR, the mismatch with the declared impact blocks the change, the draft is rejected with feedback, and the corrected optional field proceeds (demonstrates change-control enforcement) |
| B-F2 | The migration is interrupted or fails midway (injected) | The migration transaction aborts, nothing becomes visible (rollback); transient failure retried, permanent failure leads to compensation review and safe-stop |
| B-F3 | The agent adds a new dependency not on the allow-list | POL-DEP-001 FAIL at `BEFORE_IMPLEMENT` blocks implementation until the dependency is removed or an exception is approved (waivable policy) |
| B-F4 | A regression test for existing behavior fails after the change | Reported honestly: N11 records the failure, readiness C3 is false, so NOT_READY; remediation is a new plan version through change approval |
| B-F5 | After the patch commit, review shows a logging leak of metadata values (fixture) | G-SEC rejection; the commit is compensated by a revert; replan; the log-redaction test is added (red) before the fix |
| B-F6 | An approved item (the requirement) changes during the run | Replan: only consumers of the changed slices re-run; the approvals on materially changed content are superseded |

## 8. Validation

Contract validation CV-01 to CV-10 including the compatibility classification (declared MINOR equals computed MINOR); idempotency property tests proving that v1.0 signatures equal v1.1 signatures for requests without metadata; migration up and down on an empty database and on a database populated by v1.0; the entire v1.0 regression suite unchanged and passing; security tests for the new input; log tests; scans; compliance check; tests-for-every-FR report.

## 9. Generated Evidence (bundle `evidence/SCN-B/`)

Ambiguity record and the human's bounds decision, the impact analysis and change record, compatibility check output, change-approval decision, design and ADRs, red and green run records, migration test results (up, down), regression report before and after, scans, policy evaluations (including the B-F3 FAIL and its resolution if exercised), readiness report, audit chain with verification, lineage showing which artifacts were re-run on replan, final summary, and measurement report with limitations. Each item is labelled with `agent_mode` and `clock_kind`.

## 10. Expected Terminal Outcome

`COMPLETED`, readiness **READY** only if C1 to C5 hold, otherwise **NOT_READY** with the blocking items. Fault-injection runs may end `SAFE_STOPPED`. The contract ends at version 1.1.0 if approved and released; the human decides whether the v1.1.0 contract replaces the baseline contract in the repository.
