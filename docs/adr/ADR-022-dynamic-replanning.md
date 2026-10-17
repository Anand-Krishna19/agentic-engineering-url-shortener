# ADR-022: Dynamic Replanning: Immutable Plan Versions with Slice-Level Invalidation

## Status

**Accepted.** Approved by the human candidate on 2026-10-16, recorded as DEC-090. Clarification: the dual-gate reading applies only when the clarification exactly matches the change request.

## Context

The system must re-plan when upstream outputs change, re-run only affected stages, and preserve governance (approvals, policy checks, gates apply to the new plan; approvals are not reused for materially changed content) (FR-122, FR-123). A change is material if it alters an approved requirement, architecture, schema, workflow state, security control, or release criterion (DEC-046). Scenario A must suspend only the affected path.

## Decision Drivers

Precision (re-run only what changed); governance preservation; immutable history and lineage; deterministic behavior; simplicity.

## Options Considered

**A. A new immutable plan version per replan; slice-level consumption tracking decides which instances are stale; materiality decides which approvals are superseded; unaffected succeeded instances are carried over.**
- Advantages: precise; history preserved; deterministic; governance re-applied.
- Disadvantages: needs artifact slices and consumption records.
- Risks: wrong slice boundaries cause over- or under-invalidation.
- Impact: slices on artifact versions, replanner, plan version creation.
- Assessment: directly demonstrates FR-122 and FR-123.

**B. Mutate the graph in place.** Disadvantages: destroys history and lineage. Rejected.

**C. Restart the run on any change.** Advantages: simple. Disadvantages: re-runs unaffected stages, contradicting FR-122. Rejected.

**D. Whole-version consumption (coarse).** Advantages: simpler. Disadvantages: re-runs unaffected branches in Scenario A. Kept only as a disclosed fallback if schedule forces it (SC-3).

## Decision

Use **option A**. Triggers: a new version of a consumed artifact slice, a G-AMB answer, an approved change (G-CHG), or a rejection at a gate. Algorithm: compute the affected set from slice hashes, classify materiality by the changed artifact's kind, supersede approvals whose subject hash changed for material changes only, create plan version n+1 carrying over unaffected succeeded instances, mark affected old instances STALE and create fresh PENDING ones, evaluate policy at `ON_REPLAN`, and open G-CHG for material changes. Reading of FR-126 used in Scenarios A and B (approved with this constraint, DEC-090): the G-AMB approval doubles as the G-CHG approval **only when the clarification exactly matches the change request**, meaning the change set the answer produces (the same artifact slices and content hashes) equals the change set of the change request, and the impact analysis was shown before the human answered. Any difference (extra or different slices, additional changes) opens a separate G-CHG.

## Rationale

It is the only option that satisfies re-run-only-affected, preserves lineage, and keeps governance on the new plan.

## Consequences

- Positive: precise, auditable replans.
- Negative: slice design effort; more records.
- Operational: replan events carry the affected set and both plan versions.
- Testing: the executed set after a replan equals the computed affected set; approvals on unchanged content stay valid and on materially changed content are superseded; governance is not bypassed.
- Governance: replans of material changes require G-CHG; the double-gate reading is limited to an exact match, and a divergence always opens a separate G-CHG.

## Risks and Mitigations

- Slice boundary errors: slices defined by stable references (statements, design sections, contract operations) with tests.
- Coarse fallback (SC-3) weakens Scenario A; disclosed if used.

## Reversibility

Medium.

## Traceability

- Requirements: FR-113, FR-122, FR-123, FR-126, DEC-046, DEC-047.
- Specification: Orchestration model; SCN-A, SCN-B, SCN-C.
- Plan: orchestration-model.md section 7.1; data-model.md `artifact_versions`, `artifact_consumptions`; scenarios.
- Tasks: not yet generated; expected slice S6.

## Validation

TS-REPLAN tests, including a test that an answer differing in any slice from the change request does not double as G-CHG; Scenario A HEAD-request clarification demonstration; Scenario C resume at normalization.
