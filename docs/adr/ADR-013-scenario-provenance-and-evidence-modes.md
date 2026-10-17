# ADR-013: Scenario Provenance, Bootstrapping, and Evidence Modes

## Status

**Accepted.** Approved by the human candidate on 2026-10-16, recorded as DEC-082.

## Context

The specification says Scenario A establishes the baseline shortener (DEC-002), but the delivery sequence builds core URL behavior before the orchestrator exists. Presenting the whole shortener as orchestrator-built would be fabricated provenance (Constitution X). Reviewers must be able to tell which work was orchestrator-run and which was not.

## Decision Drivers

Honesty of evidence; the human's stated delivery sequence; schedule; a genuinely greenfield Scenario A (FR-112); clarity for reviewers.

## Options Considered

**A. Build the core shortener first under SpecKit (slices S1 to S3), labelled "baseline foundation, SpecKit-governed, not orchestrator-run"; Scenario A then governs a real greenfield increment that completes the baseline (analytics capture, creator count inspection, retention purge).**
- Advantages: honest; matches the sequence; the increment is complete, consistent, and testable so no artificial clarification gate is needed.
- Disadvantages: the orchestrator does not build the entire shortener.
- Risks: R-16 reviewer expectations.
- Impact: the plan's scenario and delivery design.
- Assessment: clear provenance statement.

**B. Build the orchestrator first and let it drive the whole shortener build.** Advantages: maximal orchestrator coverage. Disadvantages: reverses the human's sequence and puts the schedule on the riskiest component. Rejected.

**C. Re-run governance retroactively over already-built code.** Disadvantages: fabricated provenance. **Rejected by the human.**

## Decision

Use **option A**. Every evidence item carries `agent_mode` (`LIVE_EXTERNAL`, `SCRIPTED`, `MIXED`); the final report states which parts were orchestrator-run and which were not, with commit ranges. Illustrative examples never appear in evidence bundles.

## Rationale

It is the only option that is honest about provenance and consistent with the approved sequence and timebox.

## Consequences

- Positive: credible, reviewable provenance; Scenario A is a real orchestrator-governed build.
- Negative: part of the baseline is outside orchestrator evidence.
- Operational: commit ranges recorded per slice.
- Testing: a test that SCRIPTED evidence cannot be labelled LIVE_EXTERNAL; evidence-bundle completeness test.
- Governance: POL-TRC-002 (non-waivable) enforces provenance and mode labels.

## Risks and Mitigations

- R-16: the boundary is stated explicitly in the final report and quickstart.

## Reversibility

Low once evidence exists, so the decision is needed before slice 3.

## Traceability

- Requirements: DEC-002, DEC-059, FR-112, FR-129, FR-132, Constitution X.
- Specification: SCN-A; Evidence Catalogue.
- Plan: scenarios/scenario-a-greenfield.md section 1; plan.md section 9; research.md ADR-013.
- Tasks: not yet generated; expected slices S3, S8, S9.

## Validation

The mode-label test; the final report's provenance statement reviewed by the human.
