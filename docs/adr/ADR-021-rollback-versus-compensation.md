# ADR-021: Rollback versus Compensation: An Effect Ledger with Reversibility Classes

## Status

**Accepted.** Approved by the human candidate on 2026-10-16, recorded as DEC-089.

## Context

The system must distinguish rollback from compensation, record each action and its result, never silently ignore a failed compensation, and avoid repeating completed non-idempotent effects on resume (FR-119, FR-121, Constitution VIII). Persistence writes can be aborted; audit records, recorded approvals, committed code, and anything sent externally cannot be undone, only compensated (DEC-056). For this prototype, transaction rollback is primary (ASM-014).

## Decision Drivers

Correctness on partial failure; honesty about irreversibility; recovery without duplicated effects; simplicity; testability by fault injection.

## Options Considered

**A. An effect ledger: each effect is registered `INTENDED` before it happens and `COMMITTED` after, with a reversibility class (ROLLBACK or COMPENSATE_ONLY) and a compensation reference; failure aborts ROLLBACK effects and runs COMPENSATE_ONLY compensations in reverse commit order.**
- Advantages: explicit, auditable, resume-safe (a COMMITTED effect for the same idempotency key is adopted, not repeated).
- Disadvantages: bookkeeping on every effectful node.
- Risks: a missed registration.
- Impact: `effects` table, effect-aware node execution.
- Assessment: demonstrates the distinction clearly.

**B. A saga framework.** Disadvantages: external dependency, unneeded generality. Rejected.

**C. Best-effort manual undo.** Disadvantages: not auditable or testable. Rejected.

## Decision

Use **option A**. Classes: `DB_WRITE` and `ARTIFACT_WRITE` within a unit of work are ROLLBACK (abort the transaction); `AUDIT_RECORD`, `APPROVAL_RECORD`, `CODE_COMMIT`, and `EXTERNAL_SEND` are COMPENSATE_ONLY (a compensating audit event, a later reject or supersession, a revert commit, a follow-up correction or a G-DESTR gate first). Compensations run in reverse commit order; each action and result is recorded; a failed compensation records `COMPENSATION_FAILED`, escalates, and triggers SS-2. Merging to a protected branch and destructive migrations additionally need G-DESTR.

## Rationale

It makes irreversibility explicit and gives resume a safe basis (never re-apply a COMMITTED effect).

## Consequences

- Positive: honest handling of irreversible effects; safe recovery.
- Negative: ledger overhead.
- Operational: compensation actions are code and tested.
- Testing: transaction-abort leaves nothing visible; reverse-order compensation; failed compensation escalates; FI-09 crash between effect and transition adopts the committed effect.
- Governance: compensation evidence (EV-AUDIT); POL-REL-002.

## Risks and Mitigations

- Missed registration: effects are created by a single helper; tests assert the ledger for every effectful node.
- Compensation that cannot be performed: G-DESTR before the action.

## Reversibility

High.

## Traceability

- Requirements: FR-119, FR-120, FR-121, NFR-010, ASM-014, DEC-056.
- Specification: Reliability and recovery.
- Plan: orchestration-model.md section 7.3; reliability.md section 5; data-model.md `effects`.
- Tasks: not yet generated; expected slice S6.

## Validation

The tests above; the Scenario A revert compensation run.
