# Compliance and Change-Control Design

**Feature**: `001-agentic-sdlc-url-shortener` | **Spec**: [spec.md](spec.md) v1.11 | **Plan**: [plan.md](plan.md) | **Model**: [orchestration-model.md](orchestration-model.md)

Design only. Covers FR-124 to FR-128, DEC-045 to DEC-048, DEC-052 to DEC-054, Constitution VI. The draft catalogue is [contracts/policy-catalogue.v1.0.draft.json](contracts/policy-catalogue.v1.0.draft.json) (51 entries; validated against its schema when this plan was produced).

## 1. Policy Domains Applicable to This Prototype

| Domain | Applies because | Example policies |
|--------|-----------------|------------------|
| security | Constitution V; URL abuse and secrets | POL-SEC-001 to POL-SEC-005 |
| compliance | Governance, human approval, evidence honesty, release declaration | POL-HUM-001 to POL-HUM-004, POL-CHG-001 to POL-CHG-004, POL-CHG-006, POL-TRC-002, POL-TRC-003, POL-DONE-001, POL-GOV-001, POL-GOV-002 |
| privacy | Client identifiers and analytics | POL-PRV-001 |
| audit-retention | FR-130 and ASM-016 | POL-RET-001, POL-OBS-001 to POL-OBS-003, POL-CHG-007 |
| approved-dependencies | Supply-chain control (TH-07) | POL-DEP-001 |
| licensing | Dependency licenses | POL-LIC-001 |
| change-control | FR-126 | POL-SPEC-005, POL-CHG-005 |
| process, reliability, traceability | Constitution I, II, IV, VII, VIII, X | POL-SPEC-*, POL-ORCH-*, POL-TEST-*, POL-ARCH-*, POL-REL-*, POL-TRC-* |

All seven domains required by FR-124 are covered (checked mechanically against the draft catalogue).

## 2. The Versioned Policy Model

### 2.1 Catalogue (DEC-048)

A simple versioned JSON document, `policies/catalogue.v1.0.json` once implemented, validated against [policy-catalogue.schema.json](contracts/schemas/policy-catalogue.schema.json). Each entry has an id, domain, severity, the constitution MUST text it implements (`source`), evaluation points, a check, and whether an exception is allowed. Every MUST in the constitution is cited by at least one mandatory policy; a completeness test compares the catalogue against a maintained list of constitution MUST statements, and a second test fails if a policy cites text that does not exist (ADR-014).

### 2.2 Mandatory versus advisory

| Severity | Meaning |
|----------|---------|
| **mandatory** | Implements a constitution MUST. A FAIL blocks downstream progression and release readiness (FR-125). |
| **advisory** | Reported, never blocks. POL-ADV-001 shows the mechanism; the mandatory commit policy is POL-TRC-005. |

MUST statements in the specification (FR and NFR) are **not** catalogue policies: they are verified by the tests-for-every-functional-requirement release gate (DEC-052, ASM-013).

### 2.3 Non-waivable policies

`exception_allowed=false` for POL-HUM-001 to POL-HUM-004 (Principle III), POL-TRC-002 (no fabricated evidence), POL-CHG-003, POL-CHG-004, POL-CHG-006 (Principle VI blocking and exception rules), POL-DONE-001 (Principle XI), and POL-GOV-002 (only the human declares release readiness). A proposal for any of them is refused with 409 `policy_not_waivable`.

### 2.4 Evaluation inputs and outputs

| Input | Source |
|-------|--------|
| Run id, plan version, stage key, evaluation point | The engine |
| Catalogue version | Fixed for the run at creation (FR-101) |
| Artifacts and evidence | Artifact versions, test reports, scan outputs, audit data |
| Active exceptions | `exceptions` with state APPROVED and not expired at the evaluation time (the `Clock` port) |

Output: one `policy_evaluations` row per applicable policy per evaluation point per plan version, conforming to [policy-evaluation.schema.json](contracts/schemas/policy-evaluation.schema.json): outcome PASS, FAIL, EXCEPTION-REQUESTED, or NOT-APPLICABLE, with reason and evidence references. A check that cannot decide is a transient failure once, then a permanent failure; it never ends without an outcome (FR-124 NAC).

### 2.5 Evaluation points

| Point | When | Typical policies |
|-------|------|------------------|
| `AFTER_NORMALIZE` | After N02 and N03 | POL-SPEC-002 to POL-SPEC-004, POL-CHG-001 |
| `AFTER_DESIGN` | After N07 | POL-ARCH-002, POL-GOV-001 |
| `BEFORE_IMPLEMENT` | Entry of N09 | POL-SPEC-001, POL-SPEC-004, POL-DEP-001 |
| `AFTER_TEST` | After N11 and N12 | POL-TEST-*, POL-SEC-001 to POL-SEC-003, POL-REL-*, POL-PRV-001, POL-RET-001, POL-LIC-001 |
| `COMPLIANCE_CHECK` | N13 (the consolidated stage) | The full mandatory set |
| `RELEASE_READINESS` | N17 | Gate-related and aggregate policies |
| `ON_CHANGE`, `ON_REPLAN` | A change request or a replan | POL-SPEC-005, POL-CHG-005, POL-ORCH-003 |

## 3. Compliance-Check Workflow Stage (N13)

1. Gather the latest artifact versions and evidence of the current plan version.
2. For each mandatory and advisory policy whose evaluation points include `COMPLIANCE_CHECK`, run its registered check function (automated), evidence rule (evidence), or read its gate state (human-attested).
3. Record exactly one outcome per policy.
4. For any mandatory FAIL: block all downstream nodes (N16, N17, N18, N19 stay PENDING with `blocked_by` naming the policy). The policy-block window starts (24 h logical, simulated in tests, DEC-045). The human may fix the cause (a new artifact version triggers re-evaluation) or an exception may be requested and approved. If neither happens by the window end, the run enters SS-4.
5. Emit `POLICY_EVALUATED` for each result (section 6).

## 4. Release-Blocking: How a Failed Mandatory Check Prevents Readiness

### 4.1 The readiness function

Release readiness is a **pure function** of recorded state. It reads no clock except to test exception expiry through the `Clock` port.

| Condition | Definition |
|-----------|------------|
| C1 All mandatory policies satisfied | For each mandatory policy at the readiness point: outcome PASS or NOT-APPLICABLE, or a FAIL covered by an APPROVED, unexpired exception on a policy with `exception_allowed=true` |
| C2 Zero unapproved or expired exceptions | No exception in REQUESTED, REJECTED, EXPIRED, or REVOKED state is relied on |
| C3 Tests executed for all functional requirements | Every FR has at least one executed, passing test recorded in the test report (ASM-013 gate 3, Constitution XI item 4) |
| C4 Release-owner approval | G-REL approved with the approver credential on the current readiness report hash |
| C5 Audit chain valid | Hash chain verifies for the run |

`READY` if and only if C1 and C2 and C3 and C4 and C5. Otherwise `NOT_READY` with a `blocking_items` entry for every unmet condition (kinds `POLICY_FAIL`, `UNAPPROVED_EXCEPTION`, `EXPIRED_EXCEPTION`, `MISSING_TEST_EVIDENCE`, `MISSING_APPROVAL`, `AUDIT_CHAIN_BROKEN`). PVT results are reported but are not conditions, except PVT-014 which is enforced through POL-SEC-005 (DEC-054). Reading note: C1 treats an approved exception as satisfying a FAIL because FR-125 and the FR-128 NAC allow it; ASM-013's "all mandatory policy checks PASS" is read together with them.

| C1 | C2 | C3 | C4 | C5 | Outcome |
|----|----|----|----|----|---------|
| yes | yes | yes | yes | yes | READY |
| no (a mandatory FAIL) | any | any | any | any | NOT_READY (`POLICY_FAIL`) |
| yes (by exception) | no (exception expired) | any | any | any | NOT_READY (`EXPIRED_EXCEPTION`) |
| yes | yes | no | any | any | NOT_READY (`MISSING_TEST_EVIDENCE`) |
| yes | yes | yes | no | any | NOT_READY (`MISSING_APPROVAL`) |
| yes | yes | yes | yes | no | NOT_READY (`AUDIT_CHAIN_BROKEN`) |

### 4.2 Explicit demonstration (planned evidence, slice 9; each is a test and a scripted run)

| ID | Setup | Expected, observable result |
|----|-------|------------------------------|
| RB-1 | A fixture scan output containing an unresolved high finding makes POL-SEC-005 FAIL at N13 | N16 and N17 do not start; `GET .../release-readiness` returns NOT_READY with `POLICY_FAIL` and the policy id; a G-REL decision is refused (`gate_not_open`); after the (simulated) 24-hour window the run enters SAFE_STOPPED with trigger SS-4 |
| RB-2 | Continue RB-1 with an exception proposal | An incomplete proposal is refused (`exception_incomplete`); a complete one opens G-EXC; an agent credential cannot decide it (403); the approver approves with policy, reason, scope, compensating control, approval timestamp, and expiry; N13 re-evaluates; readiness can become READY if C2 to C5 hold; advancing the simulated clock past the expiry makes it NOT_READY again (`EXPIRED_EXCEPTION`) |
| RB-3 | Propose an exception for POL-HUM-003 (a non-waivable policy) | Refused with `policy_not_waivable`; the FAIL stands |
| RB-4 | Property test over generated combinations of C1 to C5 | Readiness is READY exactly when all five hold, and identical inputs always give identical output and blocking items (FR-128 determinism) |
| RB-5 | A test forces a mandatory gate to be skipped by direct database manipulation | POL-HUM-003 FAILs at N13, which is non-waivable, so readiness is NOT_READY |

These runs are synthetic demonstrations and are labelled as such in the evidence.

## 5. Exception Workflow

```text
(proposal by agent or human) --> REQUESTED --G-EXC: APPROVE (approver credential)--> APPROVED --expires_at passes or review condition triggers--> EXPIRED
                                      |                                                    |
                                      +--G-EXC: REJECT--> REJECTED                         +--approver revokes--> REVOKED
```

| Rule | Detail |
|------|--------|
| Who may propose | Agent or human; only the approver credential decides (DEC-037) |
| Required before APPROVED | applicable policy, reason, scope, approving authority (authenticated identity), compensating control, approval timestamp, and an expiry or review condition (FR-125); otherwise `exception_incomplete` |
| Scope | Named run and evaluation point (and artifact set where applicable); never open-ended |
| Compensating control | A stated control with an evidence reference (for example an additional test, a manual check recorded at a gate) |
| Expiry or review condition | An `expires_at`, or a review condition named from the predicate registry (`ON_CHANGE`, `ON_REPLAN`, `AT_RELEASE`); when it triggers, the exception counts as EXPIRED until the approver re-approves |
| Non-waivable policies | Cannot be excepted (section 2.3) |
| Effect | An approved, unexpired exception lets a FAIL satisfy C1; an expired or unapproved one never does (FR-128) |
| Audit | `EXCEPTION_REQUESTED`, `EXCEPTION_DECIDED`, `EXCEPTION_EXPIRED` events carry all fields; exceptions appear in the traceability evidence (POL-CHG-007) |

## 6. Policy Audit-Event Structure

`POLICY_EVALUATED` (`audit_events.data`):

```text
{ policy_id, catalogue_version, evaluation_point, stage_key, plan_version,
  outcome, mandatory, reason, evidence_refs[], exception_id? }
```

`EXCEPTION_REQUESTED` and `EXCEPTION_DECIDED` (`data`): `exception_id`, `policy_id`, `reason`, `scope`, `compensating_control`, `proposed_by` or `approver_identity`, `decided_at`, `expires_at` or `review_condition`, `decision`. All carry the standard audit fields (actor type, action, timestamp, affected subject, result, reason, correlation id) and chain hashes.

## 7. Change-Request Workflow

| Step | Action | Gate or check |
|------|--------|---------------|
| 1 | A change to an approved requirement, architecture, schema, workflow state, security control, or release criterion is proposed (`POST .../change-requests`) with a change record for contract changes | `CHANGE_REQUESTED` |
| 2 | Impact analysis (node N06 logic, or on demand): impacted components, interfaces, data flows, tests, documentation, regression risks, rollout or rollback | Policy `ON_CHANGE` (POL-SPEC-005) |
| 3 | Compatibility classification (contracts/README.md CV-06) and version impact; mismatch with the declared impact blocks | Automated |
| 4 | Human decision | G-CHG (plus G-ARCH or G-SEC as relevant) |
| 5 | If approved: replan (orchestration-model.md 7.1); affected approvals superseded for material content; affected nodes re-run | `REPLAN_APPLIED` |
| 6 | Implement test-first; revalidate | Tests and policy evaluation |
| 7 | Migrate or roll out with the recorded rollback or compensation | Effects ledger |
| 8 | Update documentation and traceability; record evidence | POL-TRC-001, POL-TRC-004 |

Nothing takes effect before step 4 (FR-126 NAC). An agent can propose but never approve.

## 8. How Upstream Changes Trigger Downstream Impact Analysis and Revalidation

The artifact-consumption graph records which artifact versions every node consumed. A new version of an artifact marks its consumers stale (replan algorithm). The revalidation matrix says which downstream items are revisited:

| Upstream change | Revalidated downstream |
|-----------------|------------------------|
| Requirement | Ambiguity analysis, decomposition, impact analysis, design, contract delta, tests, implementation, documentation, policy evaluation, readiness |
| Architecture or design | Contract delta, threat model, tests, implementation, ADR set, documentation |
| API contract or schema | Contract and regression tests for every consumer, migration, documentation, version bump, compatibility check, readiness |
| Security control | Threat model, security tests, scans, G-SEC, readiness |
| Tests only | Re-execution of the test report and the tests-for-every-FR check |
| Documentation only | Documentation consistency check |
| Policy catalogue or release criteria | A change request; in-flight runs keep their catalogue version unless a G-CHG-approved replan moves them; readiness is re-determined |

Versioning that supports this: artifact versions (immutable, hashed); contract semantic versions; the specification version; the policy catalogue version; the plan version of each run. Each is cited in the audit record so a reviewer can see exactly which versions a decision rested on.
