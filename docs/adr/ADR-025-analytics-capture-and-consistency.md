# ADR-025: Analytics Capture and Consistency Model

## Status

**Accepted.** Approved by the human candidate on 2026-10-16, recorded as DEC-109, after the first version was rejected (DEC-097). Capture is a single attempt with no retries, fail-open, bounded only by the approved persistence timeout (PVT-010).

## Context

Each successful redirect must be counted with its time (FR-012); a capture failure must not block the redirect and must be logged and audited (FR-014); counts must be correct under concurrency (FR-017, PVT-015); only the creating client may read the count (FR-023); per-event timestamps are purged after 30 days while the aggregate count remains valid (DEC-055). Redirect latency has an approved demonstration target (PVT-001, p95 at most 100 ms).

## Decision Drivers

Count accuracy; availability (fail-open); auditable failure; latency; simplicity; privacy (no visitor data).

## Options Considered

**A. Synchronous fail-open capture in the redirect request: after the redirect decision, a short transaction increments the aggregate counter and inserts the event; any failure is caught, logged, audited, and the redirect proceeds. No analytics-specific time bound is imposed.**
- Advantages: counts equal successful redirects when capture succeeds; every failure is recorded; simple.
- Disadvantages: adds a database round trip to the redirect path; a hot link serializes on one counter row; with no analytics-specific bound, a hanging database call is limited only by the general approved persistence timeout (PVT-010).
- Risks: contention on popular links; a slow database could delay a redirect up to the general persistence timeout.
- Impact: counter and event tables, capture wrapper with a timeout.
- Assessment: easy to demonstrate and test.

**B. Asynchronous capture after the response (queue or buffer).** Advantages: lowest latency. Disadvantages: counts lost on a crash without a log or audit entry, contradicting "logged and audited". Rejected.

**C. Redis counters flushed to PostgreSQL.** Advantages: fast. Disadvantages: Redis would hold uncommitted truth, contradicting ADR-015; counts could be lost silently. Rejected.

**D. Sharded counters.** Advantages: removes hot-row contention. Disadvantages: more complex reads. Kept as a hardening option if measurement shows contention.

## Decision

Use **option A**. Redirect resolution reads the link, decides, then attempts capture; on any failure it logs, increments a failure metric, writes an application audit event, and still returns the redirect. **No analytics-specific time bound is added** (DEC-097): the approved general persistence attempt timeout (PVT-010) still applies to every database call, and, so that a failing capture does not multiply delay, the capture makes a **single attempt with no retries** (approved, DEC-109). If performance testing shows capture delaying redirects, a bound will be proposed then. Only successful redirects are captured (never 404, 410, or failed resolutions), and, per the human's statement (DEC-104), only `GET` requests count. The aggregate counter and the event row commit in one transaction. The aggregate count is a lower bound whenever captures fail, and the failures are visible in the audit record. Per-event rows older than 30 days are purged by the reaper; the counter is never reduced. Reads go through the creator-only endpoint (ADR-024). Whether HEAD requests count was stated by the human as no (only `GET` triggers analytics, DEC-104); the Scenario A run still presents the question at its clarification gate for a decision at run time.

## Rationale

It meets the approved fail-open and auditing requirements with the least machinery and keeps the accuracy guarantee testable: exact equality in the no-failure concurrency test, explainable shortfall otherwise.

## Consequences

- Positive: accurate counts; auditable failures; no visitor data stored.
- Negative: capture adds latency to the redirect path, bounded only by the general persistence timeout; hot-link row contention possible; counts are a lower bound under failures.
- Operational: failure and capture-latency metrics; purge job metrics.
- Testing: N redirects give count N including under concurrency (PVT-015); capture failure leaves the redirect intact with log and audit records; purge leaves the aggregate unchanged; non-owner read gets the unknown-code response; contention measured and labelled demonstration.
- Governance: POL-PRV-001 checks stored fields against the approved list.

## Risks and Mitigations

- Hot-row contention: measured; sharded counters (option D) if needed (a change request).
- Redirect delay from a slow database: no analytics bound by decision; mitigated only by the general persistence timeout and a single capture attempt; measured in performance testing, and a bound is proposed only if testing shows a problem.

## Reversibility

High.

## Traceability

- Requirements: FR-012 to FR-014, FR-017, FR-023, PVT-001, PVT-015, PVT-010, DEC-007, DEC-049, DEC-055, DEC-097, DEC-104, ASM-016.
- Specification: Analytics; Concurrency.
- Plan: scenarios/scenario-a-greenfield.md; data-model.md (`redirect_counters`, `redirect_events`); security.md AB-08.
- Tasks: not yet generated; expected Scenario A branches `capture`, `inspect`, `retention`.

## Validation

The tests above; Scenario A run evidence.
