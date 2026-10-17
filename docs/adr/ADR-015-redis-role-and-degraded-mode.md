# ADR-015: Redis Role and PostgreSQL-Only Degraded Mode

## Status

**Accepted.** Approved by the human candidate on 2026-10-16, recorded as DEC-083.

## Context

The approved stack names Redis as the cache and idempotency store for 60-second leases, rate limiting, and fast idempotency lookups. DEC-034 requires the idempotency record check and the mapping commit to be **one atomic operation**. A commit spanning Redis and PostgreSQL cannot be atomic: a crash or lease race between the stores would reintroduce the double commit that LIM-002's mitigation prevents.

## Decision Drivers

Atomic correctness; availability when Redis is down; performance (PVT-001, PVT-002); security of a cache holding response bodies; simplicity.

## Options Considered

**A. PostgreSQL is the source of truth; Redis is an accelerator.**
- Approach: (a) rate-limit buckets, (b) a replay cache of COMPLETED and FAILED responses written after the PostgreSQL commit, (c) an advisory in-flight lock with a 60-second TTL for fast failure of concurrent duplicates.
- Advantages: correctness never depends on Redis; the atomic commit is one PostgreSQL transaction; Redis loss changes latency only.
- Disadvantages: two stores to run; cache can go stale.
- Risks: R-26 stale replay; R-23 prerequisites.
- Impact: Redis adapters, degraded-mode logic, tests.
- Assessment: honors the stack and DEC-034.

**B. Redis as the sole idempotency store, mapping in PostgreSQL.** Disadvantages: guarantee depends on cross-store ordering; a repair with fencing would make PostgreSQL authoritative anyway. Rejected.

**C. No Redis.** Disadvantages: contradicts the approved stack. Rejected.

## Decision

Use **option A**. Redis keys: `rl:token:{hash}` and `rl:ip:{hash}` (rate limits), `idem:{client_id}:{key}` (replay cache, TTL equal to the remaining retention), `idem-lock:{client_id}:{key}` (advisory lock, 60-second TTL). The lock is advisory; the PostgreSQL conditional update on `lease_expires_at` is the authority. A cache entry is never trusted over the PostgreSQL record for a write decision. **When Redis is unavailable the service runs in PostgreSQL-only mode** (slower but correct): no replay cache, no advisory lock (PostgreSQL row-level locking serializes duplicates), and rate limiting through PostgreSQL-based checks (ADR-011). Redis is loopback only, password protected, and holds no raw URL beyond the cached response body, no address, and no secret.

## Rationale

It keeps Redis doing the jobs the human named while keeping DEC-034 satisfiable in a single transaction, and it makes the cache disposable.

## Consequences

- Positive: correctness independent of the cache; safe degradation.
- Negative: a second stateful dependency; degraded mode is slower and limits restart on mode switches.
- Operational: Compose-defined Redis; readiness reports the cache check while the service stays ready; a metric marks degraded mode.
- Testing: Redis killed mid-run changes no outcome; stale or poisoned cache entries never override PostgreSQL; concurrent same-key requests yield one mapping with the lock removed.
- Governance: entering and leaving degraded mode is audited.

## Risks and Mitigations

- R-26 stale replay: cache written only after commit and consulted second to PostgreSQL on writes; a stale-entry test.
- TH-14 poisoning: password, loopback, signature binding.
- R-23: CP-1 requires Redis running; stop with NOT_READY if not (DEC-069).

## Reversibility

High. Removing Redis leaves PostgreSQL-only mode as the permanent behavior.

## Traceability

- Requirements: FR-015 to FR-018, FR-022, DEC-030, DEC-034, DEC-067, DEC-070, LIM-002.
- Specification: Idempotency and duplicates; Concurrency.
- Plan: data-model.md sections 2.5 and 2.6; reliability.md fallback table; research.md ADR-015.
- Tasks: not yet generated; expected slice S3.

## Validation

The Redis-down, stale-cache, and lock-removed tests; FI-16.
