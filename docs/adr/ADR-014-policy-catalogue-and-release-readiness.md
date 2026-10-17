# ADR-014: Policy Catalogue and the Release-Readiness Function

## Status

**Proposed.** The JSON catalogue approach, the draft catalogue v1.0, and the non-waivable set were explicitly approved (DEC-048, DEC-064). The readiness function below is the plan's formalization and awaits approval.

## Context

Versioned policy guardrails must cover security, compliance, privacy, audit retention, approved dependencies, licensing, and change control. Every run identifies the policy version evaluated; every check yields PASS, FAIL, EXCEPTION-REQUESTED, or NOT-APPLICABLE; a failed mandatory check blocks progression and release readiness; exceptions need explicit human approval with required fields (Constitution VI, FR-124, FR-125, FR-128). Only the human declares release readiness.

## Decision Drivers

Traceability to the constitution; simplicity; determinism; the explicit demonstration that a failed mandatory policy prevents readiness; a clean separation between policies (constitution MUSTs) and requirement tests (specification MUSTs).

## Options Considered

**A. A versioned JSON catalogue validated by a JSON Schema, with registered check functions by policy id, plus a pure release-readiness function.**
- Advantages: simple; cites constitution text; completeness tests; deterministic readiness.
- Disadvantages: hand-authored; extracting MUST statements automatically is brittle.
- Risks: R-17 catalogue drift.
- Impact: catalogue file, evaluator, readiness function, exception workflow.
- Assessment: directly demonstrates blocking.

**B. Open Policy Agent.** Advantages: expressive. Disadvantages: new service and language. Rejected as disproportionate.

**C. Hard-coded checks without a catalogue.** Disadvantages: no "policy version evaluated". Rejected.

## Decision

Use **option A**. The draft catalogue `policy-catalogue.v1.0.draft.json` (51 entries) becomes `policies/catalogue.v1.0.json` on approval. Every constitution MUST is a mandatory policy; specification MUSTs are verified by the tests-for-every-FR gate (DEC-052). Non-waivable policies are POL-HUM-001 to POL-HUM-004, POL-TRC-002, POL-CHG-003, POL-CHG-004, POL-CHG-006, POL-DONE-001, and POL-GOV-002. **Readiness** is a pure function: READY if and only if (C1) all mandatory policies are satisfied (PASS, NOT-APPLICABLE, or a FAIL covered by an approved unexpired exception on a waivable policy), (C2) no unapproved or expired exception is relied on, (C3) every functional requirement has an executed passing test, (C4) the release owner approved, and (C5) the audit chain verifies. PVT-014 is enforced through POL-SEC-005 (DEC-054). Otherwise NOT_READY with every blocking item listed. A NOT_READY outcome with an honest blocker list is the defensible minimum (DEC-065).

## Rationale

It satisfies Constitution VI with the smallest mechanism and makes release blocking provable by tests (RB-1 to RB-5).

## Consequences

- Positive: transparent compliance model; deterministic readiness; clear separation of concerns.
- Negative: catalogue maintenance; the C1 reading (approved exceptions satisfy a FAIL) reads ASM-013 together with FR-125 and the FR-128 negative criteria.
- Operational: the catalogue version is recorded on every run; catalogue changes are change requests.
- Testing: completeness tests in both directions; the truth table of C1 to C5 as a property test; RB-1 to RB-5.
- Governance: exceptions have the seven required fields and an expiry or review condition.

## Risks and Mitigations

- R-17 catalogue drift: bidirectional completeness tests.
- Mis-reading of C1: the reading is documented here and in compliance-and-change-control.md and needs the human's confirmation with this ADR.

## Reversibility

High.

## Traceability

- Requirements: FR-101, FR-124 to FR-128, DEC-048, DEC-052, DEC-054, DEC-064, DEC-065, Constitution VI.
- Specification: Policy, change control, and security; Delivery outcomes.
- Plan: compliance-and-change-control.md; contracts/policy-catalogue.v1.0.draft.json; research.md ADR-014.
- Tasks: not yet generated; expected slice S5.

## Validation

RB-1 to RB-5; completeness tests; a review of the catalogue against the constitution by the human.
