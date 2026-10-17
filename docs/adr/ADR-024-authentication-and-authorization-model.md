# ADR-024: Authentication and Authorization Model

## Status

**Accepted.** Approved by the human candidate on 2026-10-16, recorded as DEC-092. Clarification: the approver identity is a simple string identifier.

## Context

The shortener is anonymous by decision (DEC-010) but needs a client identity for idempotency scope, rate limiting, and count-read ownership. The control plane has human, agent, and read-only roles. The prototype runs over plain HTTP on loopback. Authentication assumptions must be documented (Constitution V).

## Decision Drivers

Honor the anonymous-creation decision; least privilege; unforgeable approval; privacy (no raw addresses); simplicity; disclosed trade-offs.

## Options Considered

**A. As decided: anonymous shortener with a client identifier (session token first, IP-address hash as fallback); creator-only count reads; control plane with APPROVER, AGENT, and READER bearer credentials.**
- Advantages: matches approved decisions; small; testable.
- Disadvantages: clients behind one address share an identity (LIM-003, LIM-004); no TLS on loopback.
- Risks: identity confusion behind NAT; credential leakage in one shell.
- Impact: client resolution logic, credentials table.
- Assessment: transparent trade-offs.

**B. Per-consumer API keys on the shortener.** Disadvantages: contradicts DEC-010 (anonymous creation). Rejected.

**C. OAuth or JWT.** Disadvantages: disproportionate infrastructure for a loopback prototype. Rejected.

**D. A session endpoint issuing isolated identities.** Advantages: removes LIM-004. Disadvantages: conflicts with the approved fallback rule (DEC-053). Backlog BL-05.

## Decision

Use **option A**.

| Surface | Authentication | Authorization |
|---------|----------------|---------------|
| Shortener create and resolve | None (anonymous) | Rate limited per session token and per IP-address hash |
| Shortener link count | Client identity (token, else IP hash) | Only the creating client; all others receive the same 404 as an unknown code |
| Control plane | Bearer credential, hashed at rest | APPROVER (create runs, decide gates), AGENT (claim, submit, propose), READER (read only); a role mismatch is denied and audited |
| Operational endpoints | Loopback binding | `/metrics`, documentation pages disabled by default |

The approver identity is a simple string identifier (for example `human-candidate`) bound to the approver credential (DEC-101). The raw IP address is never stored; the IP-hash is an HMAC with a server secret. A token binds to the identity established at first contact (DEC-057). Transport security is not provided on loopback (trade-off T-1).

## Rationale

It implements the approved decisions in one coherent model and discloses exactly where it is weaker than a production design.

## Consequences

- Positive: simple, testable authorization; privacy-preserving identity.
- Negative: shared identity behind one address; no transport security.
- Operational: credential rotation; hash-secret handling.
- Testing: cross-client count access test; token-discard test; role-denial tests; secret absence in logs.
- Governance: limitations LIM-003 and LIM-004 stay disclosed in the final report.

## Risks and Mitigations

- LIM-004 identity sharing: accepted (DEC-061); hardening deferred (BL-05).
- R-10 credential leakage: startup check, secret scanning.
- No TLS: loopback only; a production requirement.

## Reversibility

Medium. Adding authentication to the shortener would be a MAJOR contract change.

## Traceability

- Requirements: FR-022, FR-023, FR-109, FR-114, NFR-001, DEC-010, DEC-018, DEC-037, DEC-049, DEC-053, DEC-057, DEC-061.
- Specification: Assumptions ASM-003, ASM-012; Known Limitations.
- Plan: security.md sections 3.5 to 3.7 and 4.1; research.md ADR-007.
- Tasks: not yet generated; expected slices S3, S5.

## Validation

The tests above; review of the limitations in the final report.
