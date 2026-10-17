# ADR-014: Policy Catalogue and the Release-Readiness Function

## Status

**Accepted.** Approved by the human candidate on 2026-10-16, recorded as DEC-108, after the first version was rejected (DEC-096). A mandatory FAIL always blocks; CONDITIONAL-PASS is a derived readiness disposition, not a fifth policy outcome, so the constitution's four outcomes are preserved and no amendment is needed (human confirmation).

## Context

Versioned policy guardrails must cover security, compliance, privacy, audit retention, approved dependencies, licensing, and change control. Every run identifies the policy version evaluated; every applicable check yields PASS, FAIL, EXCEPTION-REQUESTED, or NOT-APPLICABLE; a failed mandatory check blocks progression and release readiness; exceptions need explicit human approval with required fields (Constitution VI, FR-124, FR-125, FR-128). Only the human declares release readiness. The ratified constitution allows exactly those four outcomes.

## Decision Drivers

Traceability to the constitution; a gate that cannot be weakened silently; determinism; visibility of any condition a release relies on; no amendment of the constitution unless the human chooses one; clear separation of policies (constitution MUSTs) from requirement tests (specification MUSTs).

## Options Considered

**A. A versioned JSON catalogue plus a pure readiness function in which a mandatory FAIL always blocks, and an approved exception can only convert a waivable FAIL into a derived `CONDITIONAL_PASS` disposition with documented compensating controls that the human must accept explicitly.**
- Advantages: the FAIL is never erased (the evaluation outcome stays FAIL with its exception id); every conditional release is explicit and listed in the report; stronger than the earlier reading; stays within the four constitution outcomes.
- Disadvantages: an extra human acceptance step (G-RISK and G-REL) whenever an exception is used; `CONDITIONAL_PASS` is not a constitution term.
- Risks: reviewers may treat the disposition as a fifth outcome; mitigated by the contract and docs naming it a derived disposition.
- Impact: dispositions in the readiness report, a `conditions` list, an extra gate trigger.
- Assessment: directly demonstrates that failed mandatory checks prevent readiness and that exceptions never hide a failure.

**B. The earlier reading: an approved, unexpired exception satisfies the FAIL.** Advantages: simpler. Disadvantages: weakens the gate; conditions are not surfaced. **Rejected by the human.**

**C. Add `CONDITIONAL-PASS` as a fifth policy outcome.** Advantages: explicit in every evaluation row. Disadvantages: conflicts with the ratified constitution's four outcomes and would require a constitution amendment (versioned, human-approved). Not chosen; available if the human wants it.

**D. Open Policy Agent, or hard-coded checks without a catalogue.** Rejected earlier (disproportionate; no "policy version evaluated").

## Decision

Use **option A**. The draft catalogue `policy-catalogue.v1.0.draft.json` (51 entries) becomes `policies/catalogue.v1.0.json` on approval. Every constitution MUST is a mandatory policy; specification MUSTs are verified by the tests-for-every-FR gate (DEC-052). Non-waivable policies are POL-HUM-001 to POL-HUM-004, POL-TRC-002, POL-CHG-003, POL-CHG-004, POL-CHG-006, POL-DONE-001, and POL-GOV-002.

**Rule.** A mandatory FAIL **always blocks** release. Each mandatory policy has a derived disposition: `PASS` (PASS or NOT-APPLICABLE); `CONDITIONAL_PASS` (FAIL on a waivable policy with an APPROVED, complete, unexpired exception that documents its compensating control); `BLOCKING` (every other FAIL, including a requested, rejected, expired, revoked, or incomplete exception, and **any** FAIL on a non-waivable policy). The evaluation outcome is never rewritten.

**Readiness** is a pure function: READY if and only if (C1) no mandatory policy is BLOCKING, (C2) every CONDITIONAL_PASS appears in the report's `conditions` list and was explicitly accepted by the human at G-RISK and again as part of the G-REL subject, (C3) every functional requirement has an executed passing test, (C4) the release owner approved the report including its conditions, and (C5) the audit chain verifies. Otherwise NOT_READY with every blocking item listed. PVT-014 is enforced through POL-SEC-005 (DEC-054). A NOT_READY outcome with an honest blocker list is the defensible minimum (DEC-065); fabricating READY is prohibited.

## Rationale

It keeps the gate strict, makes any exception-based release visible and explicitly accepted, and avoids amending the constitution. It also satisfies FR-125 and the FR-128 negative criteria.

## Consequences

- Positive: a failed mandatory policy can never silently pass; conditions are always explicit; the readiness report is auditable.
- Negative: more human steps when exceptions are used; one more derived concept.
- Operational: the catalogue version is recorded on every run; catalogue changes are change requests; the readiness report carries `conditions`.
- Testing: completeness tests of the catalogue in both directions; property test over dispositions and C2 to C5 (a mandatory FAIL without a valid exception is always BLOCKING; a non-waivable FAIL is always BLOCKING; READY exactly when all five hold; determinism); RB-1 to RB-5, including expiry returning a conditional pass to BLOCKING.
- Governance: exceptions keep their seven required fields and an expiry or review condition; any conditional pass triggers G-RISK.

## Risks and Mitigations

- R-17 catalogue drift: bidirectional completeness tests.
- Misreading `CONDITIONAL_PASS` as a fifth outcome: documented as a derived disposition in the contract and in compliance-and-change-control.md; amendment path (option C) exists if desired.

## Reversibility

High.

## Traceability

- Requirements: FR-101, FR-124 to FR-128, DEC-048, DEC-052, DEC-054, DEC-064, DEC-065, DEC-096, Constitution VI.
- Specification: Policy, change control, and security; Delivery outcomes.
- Plan: compliance-and-change-control.md sections 2 to 5; contracts/control-plane.openapi.yaml (`ReleaseReadiness`); contracts/policy-catalogue.v1.0.draft.json; research.md ADR-014.
- Tasks: not yet generated; expected slice S5.

## Validation

RB-1 to RB-5; the property test; completeness tests; the human's review of the catalogue and of this revision.
