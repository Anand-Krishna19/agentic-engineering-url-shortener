# ADR-017: Short-Code Generation and Collision Handling

## Status

**Proposed.** The properties (CSPRNG, base62, at least 7 characters, case-sensitive) were approved as an assumption (ASM-015, DEC-051); the collision strategy and classification are plan detail (PA-008, approved by DEC-063). This ADR text awaits approval.

## Context

Short codes must be unique across active and expired links and never reassigned (FR-006, FR-010), generated with bounded, safe collision handling (FR-007, PVT-007: at least 7 characters and recovery within 3 attempts), and hard to enumerate (AB-04). Unknown and malformed codes must return the same 404 (FR-009). Case-sensitivity and the alphabet matter for uniqueness and for what counts as "malformed".

## Decision Drivers

Unpredictability; uniqueness under concurrency; bounded behavior; simplicity; testability; avoiding information disclosure.

## Options Considered

**A. CSPRNG random codes, base62, fixed length 7, unique index with binary collation, bounded insert-retry on conflict.**
- Advantages: unguessable sequences; uniqueness enforced by the database, not by a check-then-insert race; trivial to reason about.
- Disadvantages: collisions are possible (rare); fixed length caps the keyspace at 62^7 (about 3.5 x 10^12).
- Risks: enumeration rests on keyspace plus rate limiting; no numeric guess-resistance target is claimed.
- Impact: code generator, unique constraint, retry loop.
- Assessment: demonstrates collision handling honestly.

**B. Sequential or counter-based codes encoded in base62.** Advantages: no collisions. Disadvantages: predictable and enumerable. Rejected on security grounds.

**C. Hash of the URL.** Advantages: deterministic. Disadvantages: identical URLs would collide, contradicting DEC-009 (no deduplication without a key); leaks information. Rejected.

## Decision

Use **option A**: `node:crypto` secure random integers map to base62 (`A-Z`, `a-z`, `0-9`), length 7, case-sensitive; stored in a `text` column with the `"C"` collation and a unique constraint. Creation inserts and, on a unique violation, retries with a new code up to **3 attempts**; exhaustion is a **transient** failure (503, no FAILED idempotency record, PA-008). A code is never reassigned, including after expiry. Any path value that is not exactly 7 base62 characters returns the same 404 as an unknown code.

## Rationale

The database constraint is the only race-free uniqueness mechanism, and random codes meet the unpredictability requirement without sequential state.

## Consequences

- Positive: no enumeration by sequence; race-free uniqueness; bounded behavior.
- Negative: rare collision retries; fixed-length keyspace.
- Operational: collision count is a metric.
- Testing: forced-collision test (new code or defined failure); statistical sanity test (no sequence, no relation to the URL); concurrent-create uniqueness test; identical 404 for unknown and malformed.
- Governance: no change needed beyond contract reason codes.

## Risks and Mitigations

- Keyspace exhaustion at huge scale: out of scope for the prototype; length is a contract-visible property, so changing it is a change request.
- Enumeration: rate limiting (ADR-011), identical 404.

## Reversibility

Medium. Lengthening codes is a MINOR change only if clients accept longer codes; changing the alphabet is MAJOR.

## Traceability

- Requirements: FR-006, FR-007, FR-009, FR-010, ASM-015, PVT-007, PA-008, AB-04.
- Specification: Short-code uniqueness; Redirect resolution.
- Plan: data-model.md section 2.2 (`short_links`); security.md AB-04; research.md best practices.
- Tasks: not yet generated; expected slice S3.

## Validation

The tests above; a review that no code path derives a code from the URL or a counter.
