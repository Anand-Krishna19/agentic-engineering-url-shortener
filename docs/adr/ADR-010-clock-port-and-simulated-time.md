# ADR-010: Time, Determinism, and Simulated Timeouts: A Clock Port

## Status

**Accepted.** Approved by the human candidate on 2026-10-16, recorded as DEC-079.

## Context

The system depends on time in many places: link expiry and its boundary (FR-010, FR-011), the 60-second idempotency lease (DEC-030), the 24-hour retention window (DEC-031), 24-hour approval and policy-block windows (PVT-008, DEC-045), retry backoff (PVT-010), exception expiry, and rate-limit refill. Tests cannot wait 24 hours, and simulated events must never be presented as real waits (DEC-044, Constitution X).

## Decision Drivers

Deterministic tests; honest labelling; no hidden clock reads; one comparison rule at the expiry boundary; low overhead.

## Options Considered

**A. A `Clock` port (TypeScript interface) with a wall-clock adapter and a controllable simulated adapter; `clock_kind` recorded wherever a duration or deadline matters; a lint rule bans direct clock calls elsewhere.**
- Advantages: deterministic tests; labelling is structural; timestamps passed to SQL and Redis scripts come from one place.
- Disadvantages: discipline required; every module takes the port.
- Risks: R-13 a stray `Date.now()` breaks determinism.
- Impact: ESLint rule, constructor injection.
- Assessment: directly satisfies DEC-044.

**B. Patch the system clock in tests (fake timers).** Advantages: no port. Disadvantages: global state, does not label events, does not reach database or Redis time. Insufficient.

**C. Real sleeps with short durations.** Disadvantages: slow and flaky; unlabelled. Rejected.

## Decision

Use **option A**. Every timestamp and deadline comes from the `Clock` port; the wall-clock adapter is the only place allowed to call `Date.now()` or `new Date()` (enforced by an ESLint rule). Database comparisons receive `$now` from the port, never `now()`; Redis scripts receive the time as an argument. Records carry `clock_kind` (`WALL` or `SIMULATED`). Simulated timeout events are logged and audited as a "simulated 24-hour timeout" and are excluded from wall-clock MTTR.

## Rationale

It is the only option that provides determinism, structural labelling, and consistent time across code, SQL, and cache scripts.

## Consequences

- Positive: deterministic, fast tests of long windows; honest evidence.
- Negative: a non-trivial injection pattern throughout the code.
- Operational: the production adapter is a thin wrapper.
- Testing: expiry boundary, lease expiry, retention, gate timeout, policy-block window, backoff, and rate-limit refill tests on the simulated clock; a lint test.
- Governance: POL-OBS-004 and measurement labelling depend on `clock_kind`.

## Risks and Mitigations

- R-13: lint rule plus a test that fails on direct clock use in domain code.
- Clock jumping backwards: a non-monotonic reading is a permanent failure of that attempt.

## Reversibility

High.

## Traceability

- Requirements: FR-010, FR-011, FR-115, FR-117, DEC-030, DEC-031, DEC-044, DEC-045.
- Specification: Expiration; Human approval; Reliability and recovery.
- Plan: research.md ADR-010; reliability.md section 2; observability.md section 5.
- Tasks: not yet generated; expected slice S1 (kernel).

## Validation

The simulated-clock tests above; the lint check; review that every duration in evidence carries `clock_kind`.
