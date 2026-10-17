# ADR-018: Workflow State, Lineage, and Artifact Persistence

## Status

**Proposed.** Requires explicit approval.

## Context

Workflow state must be persisted, survive interruption, and be the source of truth for resumption (FR-107). Cross-stage context and decision lineage must be preserved and never rewritten (FR-108). Artifact versions, approvals, decisions, assumptions, test and risk outcomes, replanning history, and terminal status must be reconstructable (plan section 4). A state change, its artifacts, its effects, and its audit event must never disagree (NFR-006).

## Decision Drivers

Atomic consistency; immutability of history; recoverability; queryable lineage; evidence export; simplicity.

## Options Considered

**A. Relational tables in PostgreSQL with mutable state rows plus immutable history, committed in one transaction with the audit event (outbox style, no broker).**
- Approach: `workflow_runs`, immutable `plan_versions`, `node_instances`, `node_attempts`, immutable content-addressed `artifact_versions` with slices, `artifact_consumptions`, `decisions`, `assumptions`, `approval_gates`, `approvals`, `effects`, `failure_events`, `audit_events`.
- Advantages: transactional consistency; easy lineage queries; current state is cheap to read; history is never overwritten.
- Disadvantages: state and audit are two representations that must agree (enforced by the transaction).
- Risks: schema breadth; migration discipline.
- Impact: data-model.md section 3; repository ports.
- Assessment: strong audit and recovery story.

**B. Pure event sourcing (rebuild state from events).** Advantages: single source of truth. Disadvantages: projection complexity, replay correctness risk, more code. Rejected for the timebox.

**C. Document or JSON blobs per run.** Advantages: simple. Disadvantages: weak constraints and lineage queries; concurrency hazards. Rejected.

## Decision

Use **option A**. Mutable current-state rows carry a `version` for optimistic concurrency; history is append-only or immutable (plan versions, artifact versions, audit events). Artifact content is stored content-addressed under `evidence/` with its hash in the database. Every transition commits state, artifacts, effects, and audit events in **one transaction**. Terminal states are final (`SAFE_STOPPED` is permanent, DEC-050). An export builds a self-contained evidence bundle with content hashes.

## Rationale

It gives transactional correctness and complete lineage without the complexity of full event sourcing, and keeps current-state reads trivial for the scheduler.

## Consequences

- Positive: consistent state and audit; reliable recovery; rich lineage queries.
- Negative: broad schema; the dual representation must be kept consistent by design.
- Operational: evidence directory with content-addressed files; migrations per change.
- Testing: transactional atomicity tests (a failed audit write aborts the transition); recovery tests; lineage reconstruction tests; export bundle completeness.
- Governance: schema changes are change requests (G-CHG); artifacts never edited, only superseded.

## Risks and Mitigations

- State and audit divergence: single transaction; periodic consistency check in `verify`.
- Large artifact storage: content-addressed files with hashes; retention follows the prototype lifetime.

## Reversibility

Medium. Moving to event sourcing later would build on the existing audit events but changes the persistence layer.

## Traceability

- Requirements: FR-102, FR-107, FR-108, FR-122, FR-130 to FR-132, NFR-006, NFR-008, DEC-050.
- Specification: Key Entities; Orchestration model.
- Plan: data-model.md section 3; orchestration-model.md sections 1 and 7.2.
- Tasks: not yet generated; expected slices S2, S4.

## Validation

The tests above; reconstruction of a run's timeline and lineage by a reviewer from the export alone.
