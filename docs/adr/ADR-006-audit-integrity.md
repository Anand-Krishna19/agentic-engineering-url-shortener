# ADR-006: Audit Model: Append-Only, Hash-Chained, Privilege-Enforced

## Status

**Accepted.** Approved by the human candidate on 2026-10-16, recorded as DEC-075.

## Context

Reviewers must reconstruct any execution from recorded evidence alone (FR-130, NFR-006, Constitution IX). Audit records must carry actor type, action, timestamp, affected subject, result, and reason; workflow actors must not be able to edit or delete them; a corrupted record is a safe-stop condition (FR-120). The audit record must never disagree with state (FR-018 analog).

## Decision Drivers

Tamper evidence; append-only enforcement that application code cannot bypass; atomicity with state changes; reviewer verifiability; low infrastructure.

## Options Considered

**A. Append-only tables, rejecting triggers, revoked `UPDATE` and `DELETE` privileges, a per-run SHA-256 hash chain, and a verify command.**
- Approach: each event stores `prev_hash` and `hash` over the canonical JSON; appends serialize per run with a row lock so `seq` is gapless; events commit in the same transaction as the state change.
- Advantages: enforcement at the database privilege level; internal consistency check; no extra service.
- Disadvantages: proves consistency, not authorship; a superuser can rewrite everything.
- Risks: R-09 superuser rewrite; per-run append serialization limits write concurrency on one run.
- Impact: audit writer, verify command, privilege setup.
- Assessment: strong, demonstrable integrity.

**B. Plain log lines.** Advantages: trivial. Disadvantages: editable, no consistency check. Insufficient for FR-130.

**C. External ledger or transparency log.** Advantages: independent integrity. Disadvantages: new infrastructure and trust model. Deferred (signed events are BL-03).

## Decision

Use **option A**. Audit tables (`audit_events` in the control plane, `app_audit_events` in the application plane) are append-only, enforced by triggers and by revoking `UPDATE` and `DELETE` from the application role. Events carry `prev_hash` and `hash` (SHA-256 over the previous hash and the canonical JSON of the event). The chain head hash of each run is written into the evidence bundle so a rewrite is detectable against an external copy. A verify command recomputes chains; failure triggers safe-stop SS-5 for active runs and `AUDIT_CHAIN_BROKEN` in readiness.

## Rationale

It meets the specification with database-level enforcement and no new infrastructure, and it makes tampering detectable and reviewable. Its limits are disclosed rather than hidden.

## Consequences

- Positive: tamper evidence; clear reviewer verification; safe-stop hook on integrity failure.
- Negative: per-run append serialization; verification cost grows with run length.
- Operational: privilege setup in migrations; chain heads recorded at export.
- Testing: tamper tests (privilege denial, trigger denial, out-of-band edit detected), gapless `seq`, concurrent appends, schema validation of every event (CV-07).
- Governance: policy POL-OBS-002 and POL-OBS-003; POL-RET-001 (audit retained, never purged by automation).

## Risks and Mitigations

- R-09 (and TH-05): a superuser-level rewrite is detectable only against an external chain head; mitigated by recording heads in evidence; signed events are BL-03.
- Performance: events are small; appends are per-run only.

## Reversibility

High. Adding signatures or an external ledger later extends rather than replaces the chain; changing the hash computation is a MAJOR audit-schema change with a chain-version field.

## Traceability

- Requirements: FR-130, FR-120, NFR-006, DEC-056.
- Specification: Functional Requirements (audit-grade evidence); Evidence Catalogue (EV-AUDIT).
- Plan: data-model.md section 3.2 (`audit_events`); observability.md; compliance-and-change-control.md section 6; research.md ADR-006.
- Tasks: not yet generated; expected slices S2, S4.

## Validation

FI-13 tamper test; verify-command test on a tampered copy; schema validation of all events; review of a reconstructed run timeline.
