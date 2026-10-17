# ADR-027: URL Validation, Normalization, and Destination Policy

## Status

**Accepted.** Approved by the human candidate on 2026-10-16, recorded as DEC-094.

## Context

Only valid, safe destinations may be stored (FR-002 to FR-005): invalid URLs are rejected, only `http` and `https` are accepted, destinations targeting the service itself or non-public network locations are rejected, and open-redirect and abuse scenarios are addressed. Normalization is limited to lowercase scheme and host, default-port removal, and fragment removal; nothing else may be altered (FR-002 negative criterion). The service redirects but never fetches.

## Decision Drivers

Security (no server-side requests, header injection resistance); determinism; adherence to the exact approved normalization; transparent residual risk.

## Options Considered

**A. Syntactic validation only, in a fixed order, with no DNS resolution.**
- Approach: length, parse, scheme allow-list, ASCII host, no user information, forbidden destinations (IP literals in non-public ranges after canonical parsing, `localhost`, `.localhost`, `.local`, `.internal`, the service's own host and port).
- Advantages: deterministic and fast; the service makes no outbound request; testable with fixed corpora.
- Disadvantages: a hostname that resolves to a private address, or rebinding, is not detected.
- Risks: R-18 residual DNS rebinding.
- Impact: validator module.
- Assessment: honest about limits.

**B. Resolve DNS at creation and block private results.** Advantages: catches some resolving names. Disadvantages: non-deterministic, makes the service issue DNS queries, and is bypassed by rebinding anyway. Rejected.

**C. Reputation or malware lookup.** Advantages: stronger abuse defense. Disadvantages: external dependency, privacy and cost. Backlog (BL-07).

## Decision

Use **option A**. Validation order: rate limit, request shape (only `url` and `expires_at`; relative-expiry fields give `unsupported_expiry_representation`), then URL checks in this order: length at most 2048 (`url_too_long`), parse (`invalid_url`), scheme exactly `http` or `https` (`unsupported_scheme`), non-empty ASCII host (`invalid_url`, PA-006), no user information (`invalid_url`, PA-007), no control characters or whitespace, destination policy (`forbidden_destination`). Normalization is exactly the three approved transformations. All of this occurs before any idempotency record exists (DEC-033, DEC-036). The stored normalized URL is what the `Location` header carries.

## Rationale

It satisfies FR-002 to FR-005 deterministically and keeps the service from ever becoming a request-making component. Its limits are disclosed.

## Consequences

- Positive: predictable behavior; no outbound requests; simple tests.
- Negative: DNS-based bypasses are not caught; internationalized hosts must arrive as ASCII punycode.
- Operational: none beyond the validator.
- Testing: corpora for IPv4 and IPv6 internal forms (including mapped, decimal, octal, hexadecimal), schemes, control characters, length 2048 and 2049, user information, internationalized hosts; property tests that normalization applies only the three transformations.
- Governance: threats AB-01, AB-02, AB-03, AB-10 are tied to POL-SEC-001.

## Risks and Mitigations

- R-18 rebinding and R-19 no reputation checking: disclosed, with BL-07 as a future hardening.
- Parser differences between URL libraries: a single validator implementation tested against the corpora.

## Reversibility

High to medium. Tightening validation of previously accepted input is a MAJOR contract change.

## Traceability

- Requirements: FR-002 to FR-005, NFR-001, DEC-008, DEC-024, DEC-063, PA-006, PA-007, AB-01 to AB-03, AB-10.
- Specification: URL creation; Invalid URL rejection.
- Plan: data-model.md sections 2.3 and 2.4; security.md section 3; research.md.
- Tasks: not yet generated; expected slice S3.

## Validation

TS-UNIT and TS-SEC suites; review of the residual-risk statement.
