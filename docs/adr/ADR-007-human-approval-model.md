# ADR-007: Human Approval Model and Approver Proof

## Status

**Accepted.** Approved by the human candidate on 2026-10-16, recorded as DEC-076. Clarification: the approver identity is a simple string identifier.

## Context

Humans retain ownership of requirements, architecture, security-sensitive decisions, exceptions, destructive changes, release readiness, and final quality (Constitution III). Approval must be unforgeable by agents (FR-109, FR-114), timeout must never mean approval (FR-115, DEC-041), and approvals must not survive materially changed content (FR-123). One human authority holds all approval power (ASM-003); the assessment reviewer is a distinct read-only role (DEC-018).

## Decision Drivers

Testable human-approval proof; least privilege; content binding; clear timeout semantics for a single approver; low implementation weight; secrets hygiene.

## Options Considered

**A. Three distinct bearer credentials (approver, agent, reader), random, stored only as hashes.**
- Approach: `node:crypto` random generation at `orch init`, shown once, constant-time comparison, role-scoped endpoints; approvals bound to the SHA-256 hash of the reviewed content.
- Advantages: simple, testable (an agent credential on an approval endpoint gives 403 and an audit event); realizes the three roles.
- Disadvantages: the approver credential can leak if one shell runs everything; no non-repudiation.
- Risks: R-10 credential leakage into an agent environment.
- Impact: credentials table, auth plugin, startup check.
- Assessment: concrete evidence for FR-109.

**B. Signed approval records (public-key signatures).** Advantages: non-repudiation. Disadvantages: key management, more code. Backlog (BL-03).

**C. OS-user separation.** Advantages: strong boundary. Disadvantages: awkward on one Windows workstation; hard to test. Rejected.

**D. mTLS client certificates.** Advantages: strong identity. Disadvantages: certificate tooling disproportionate for loopback. Rejected.

## Decision

Use **option A**. Ten gates (G-AMB, G-ARCH, G-CODE, G-SEC, G-DESTR, G-EXC, G-RISK, G-REL, G-FINAL, G-CHG) accept decisions **only with the approver credential**. Each decision carries the approver identity (a simple string identifier such as `human-candidate`, configured at `orch init` and bound to the approver credential, with no further authentication system for the prototype, DEC-101), a role string, a reason, and the **subject hash** of the content reviewed; a stale hash is rejected (`approval_subject_changed`). Gate timeouts: 24 hours logical, one escalation (record the escalation and extend once, since there is no second approver), 24 hours logical, then safe-stop; tests simulate the durations and label them (DEC-044). A late response after safe-stop is rejected as `late_response_after_safe_stop` (DEC-041). Repeated identical decisions are idempotent. An agent worker refuses to start if the approver credential is in its environment.

## Rationale

It makes the central governance claim directly testable while staying small enough for the timebox, and content binding keeps approvals honest across replans.

## Consequences

- Positive: agents provably cannot approve; approvals tied to exact content; clear terminal semantics.
- Negative: credential handling falls on the human; escalation with a single approver is a recorded extension, not a second reviewer.
- Operational: `.secrets/` (git-ignored), rotation command, startup self-check.
- Testing: agent and reader denial; credential absent from logs and audit data; constant-time comparison; stale-hash rejection; timeout and late-response tests.
- Governance: every gate decision is an audit event and EV-APPROVAL evidence.

## Risks and Mitigations

- R-10: startup check and documentation; residual risk disclosed.
- TH-03 replay on changed content: hash binding.
- TH-01 self-approval: credential separation.

## Reversibility

High. Signed approvals can be layered on the same gate model.

## Traceability

- Requirements: FR-109, FR-114 to FR-116, FR-123, FR-125, FR-133, NFR-011, DEC-012, DEC-018, DEC-037, DEC-041, DEC-044.
- Specification: Human approval; ASM-003.
- Plan: orchestration-model.md section 6; security.md section 4.1; research.md ADR-007.
- Tasks: not yet generated; expected slice S5.

## Validation

FR-109 and FR-114 negative tests; secret scans of repository and evidence; approval and timeout tests on the simulated clock.
