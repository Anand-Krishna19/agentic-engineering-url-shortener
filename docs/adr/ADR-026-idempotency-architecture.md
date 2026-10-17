# ADR-026: Idempotency Architecture: A PostgreSQL State Machine with Atomic Check-and-Commit

## Status

**Proposed.** The behavior was approved across DEC-009, DEC-016, DEC-021, DEC-023, DEC-025, DEC-026, DEC-029 to DEC-034, DEC-062, DEC-067, and DEC-068. This ADR records the architecture and awaits approval.

## Context

Creation must be idempotent when the client sends an `Idempotency-Key` (FR-015, FR-016): the same key and request signature never creates a second mapping; any difference in URL, metadata, or expiry returns 409; keys are scoped per client and retained 24 hours from the terminal state; an in-flight duplicate returns 409; a FAILED record replays; a lease-expired request must not commit after its record is gone (DEC-034, LIM-002). Signature computation must be clock-independent (DEC-023).

## Decision Drivers

Exactly-once mapping per key and signature; atomicity; recoverability after crashes; no dependence on a cache for correctness; testability.

## Options Considered

**A. PostgreSQL state machine (IN_PROGRESS, COMPLETED, FAILED) with a 60-second lease and an atomic check-and-commit transaction.**
- Approach: validation-class rejections occur before any record exists; a record is inserted with `ON CONFLICT`; execution runs; the result transaction inserts the mapping and runs `UPDATE ... WHERE state='IN_PROGRESS' AND request_id=$1 AND lease_expires_at > $now`, aborting when it changes zero rows.
- Advantages: one transaction; correct under crashes and races; Redis optional.
- Disadvantages: more database writes on the creation path.
- Risks: lease tuning; reaper delay (mitigated by treating expired records as absent).
- Impact: `idempotency_records` table, reaper, replay logic.
- Assessment: demonstrates the LIM-002 mitigation.

**B. A unique constraint on mappings per `(client, key)` only.** Advantages: simple. Disadvantages: no FAILED replay, no 409 for different signatures, no in-flight state. Insufficient.

**C. Redis as the authoritative store.** Disadvantages: cannot be atomic with the mapping commit. Rejected (ADR-015).

**D. Deduplicate by URL.** Contradicts DEC-009. Rejected.

## Decision

Use **option A**. Signature = SHA-256 over canonical JSON of the FR-002 normalized URL, canonical metadata (absent equals empty equals `{}`), and canonical expiry (`ABSENT` sentinel or the UTC instant); it never reads the clock. Transient failures (including exhausted retries and aborted lease-expired commits) delete the in-flight record and create no FAILED record; permanent failures store a FAILED record replayed for 24 hours; the retention window starts at the terminal state. A lease-expired request that loses its record receives 503 `request_superseded` (DEC-062); retrying with the **same key** is recommended (DEC-068). The Redis replay cache and advisory lock are accelerators only (ADR-015). In PostgreSQL-only mode duplicates serialize through the primary key and row-level locking (DEC-067). After retention a reused key is a new request that may create a second mapping (LIM-001).

## Rationale

Only a single-store transaction gives atomic, crash-safe idempotency; every approved edge case maps to a state or a transition.

## Consequences

- Positive: exactly-once mapping per key and signature; clear client semantics.
- Negative: extra writes per keyed creation; the reaper and lease add moving parts.
- Operational: reaper metrics; lease-abort and conflict metrics.
- Testing: property tests of the signature (reordering, absent versus empty, timezone equivalence, clock independence); state tests for every transition; concurrent duplicates; lease-abort test; FAILED replay; retention window.
- Governance: contract reason codes `idempotency_key_conflict`, `idempotency_request_in_progress`, `request_superseded`.

## Risks and Mitigations

- LIM-001 post-retention duplicate: disclosed limitation.
- LIM-002 slow-request supersession: mitigated by the atomic conditional update.
- LIM-004 shared identity and key collisions: disclosed.

## Reversibility

Medium. Changing the signature canonicalization is a MAJOR contract change.

## Traceability

- Requirements: FR-015 to FR-018, FR-020, DEC-016 to DEC-034, DEC-062, DEC-067, DEC-068, LIM-001, LIM-002.
- Specification: Idempotency and duplicates; Concurrency; Known Limitations.
- Plan: data-model.md sections 2.2, 4, 5; reliability.md section 3; research.md ADR-015.
- Tasks: not yet generated; expected slice S3.

## Validation

The suites above; FI-03, FI-05, FI-06, FI-16.
