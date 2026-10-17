# ADR-011: Rate Limiting: Dual-Dimension Redis Token Buckets with PostgreSQL Fallback

## Status

**Proposed.** Redis for rate limiting was approved (DEC-060), the dual dimension was decided (DEC-057), and the Redis-down fallback to PostgreSQL-based checks was confirmed (DEC-067, DEC-070). This ADR text awaits approval.

## Context

Creation and resolution must be rate limited by a documented policy (FR-022, Constitution V). Clients are anonymous (DEC-010) and identified by a session token or an IP-address hash (ASM-012); limits must apply on both dimensions so discarding tokens cannot evade them (DEC-057). Thresholds: PVT-006 per token, three times that per IP hash (PA-001).

## Decision Drivers

Abuse resistance; deterministic tests (ADR-010); sharing across processes; never silently open; consistency with the PostgreSQL-authoritative design (ADR-015); effect of shared addresses (LIM-003, LIM-004).

## Options Considered

**A. Redis token buckets updated by an atomic script, keyed by token hash and by IP hash, with a PostgreSQL-based fallback when Redis is down.**
- Advantages: shared across processes; atomic updates; survives application restarts; the approved stack.
- Disadvantages: another dependency; state resets if Redis restarts (persistence off by default); the fallback adds a PostgreSQL write per limited request.
- Risks: TH-15 bypass during an outage (mitigated by the fallback); mismatch when switching modes.
- Impact: Lua script, `rate_limit_buckets` table (fallback only), mode switch with audit.
- Assessment: demonstrates degradation without opening the system.

**B. In-process buckets only.** Advantages: simplest. Disadvantages: not shared, reset on restart. The earlier proposal; not chosen for the primary path.

**C. Reverse proxy limiter.** Disadvantages: needs infrastructure outside the application's control. Rejected.

## Decision

Use **option A**. Buckets are keyed per session token and per IP-address hash; both must allow a request. The script takes the time from the `Clock` port. When Redis is unavailable the service runs in **PostgreSQL-only mode**: limits use PostgreSQL-based bucket checks (an atomic statement with row-level locking), never open; entering and leaving the mode is logged, counted, audited, and shown in readiness while the service stays ready. `X-Forwarded-For` is honored only with an explicit trusted-proxy setting (default off). Thresholds: PVT-006 and PA-001.

## Rationale

It meets FR-022 with both dimensions, honors the approved stack, and keeps a safe, correct fallback consistent with the principle that Redis never decides an outcome.

## Consequences

- Positive: abuse resistance independent of tokens; shared state; safe degradation.
- Negative: clients sharing an address share the IP-hash limit (LIM-003); on one local machine all tokenless clients share one IP hash; fallback mode is slower and limits restart on mode switches.
- Operational: Redis must be password protected and on loopback; mode changes are visible in readiness and metrics.
- Testing: token-discard test; independent clients not blocked; Redis-killed degradation test; deterministic refill on the simulated clock.
- Governance: the degradation is audited; thresholds are approved targets or approved assumptions.

## Risks and Mitigations

- TH-15 outage bypass: PostgreSQL fallback.
- Latency in fallback mode: labelled when measured; demonstration targets may be missed in that mode.

## Reversibility

High.

## Traceability

- Requirements: FR-022, NFR-001, DEC-057, DEC-067, DEC-070, LIM-003, PVT-006, PA-001.
- Specification: Operational health and abuse controls.
- Plan: security.md section 3.7; data-model.md sections 2.5 and 2.6; research.md ADR-011.
- Tasks: not yet generated; expected slice S3.

## Validation

The tests above; a load smoke check labelled demonstration.
