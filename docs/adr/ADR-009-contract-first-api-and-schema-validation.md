# ADR-009: Contract-First API and Schema Deliverables with Executable Validation

## Status

**Proposed.** Requires explicit approval.

## Context

The plan requires explicit, versioned API and schema deliverables (OpenAPI or equivalent, request, response, error, workflow-state, approval, audit-event, policy-evaluation, and persistence schemas), compatibility and migration rules, examples, and executable validation. Every API or schema change must carry ownership, version impact, compatibility impact, affected consumers, tests, documentation, rollout steps, and required approval (FR-126, NFR-010).

## Decision Drivers

Specification before implementation (Constitution I); single source of truth; change safety; machine-checkable evidence; reuse of the contract at runtime.

## Options Considered

**A. Contract-first: OpenAPI 3.1 and JSON Schema 2020-12 authored by hand, validated with `@apidevtools/swagger-parser` and Ajv (2020, strict), used at runtime by Fastify, plus a route drift test and a custom compatibility checker.**
- Advantages: contracts reviewable before code; runtime and contract cannot silently diverge; change control is explicit.
- Disadvantages: hand-authored files require discipline; a custom compatibility checker is incomplete by nature.
- Risks: R-12 checker gaps.
- Impact: `contracts/` directory, CV-01 to CV-10 tests.
- Assessment: strongest demonstration of change safety.

**B. Generate the contract from code.** Advantages: no drift by construction. Disadvantages: the contract comes after implementation, defeating Constitution I. Rejected.

**C. Schemathesis property-based API testing.** Advantages: strong fuzzing. Disadvantages: Python tool, extra setup. Backlog (BL-04).

## Decision

Use **option A**. The authored files in `contracts/` are canonical: two OpenAPI documents, nine JSON Schemas, examples (named `*.illustrative.json`, never evidence), the draft policy catalogue, and the compatibility rules in contracts/README.md (semantic versioning with an explicit breaking-change list). Executable checks CV-01 to CV-10 run in Vitest. `oasdiff` is backlog (BL-06).

## Rationale

It keeps the specification ahead of the implementation and makes every contract change a reviewed, classified, approved event. It has already been validated twice (33 of 33 with the earlier Python tooling, 23 of 23 under the Node toolchain) and that validation found three real schema defects.

## Consequences

- Positive: drift is detected; breaking changes need approval; reviewers read one source of truth.
- Negative: extra upkeep of contract files; compatibility checker maintenance.
- Operational: contract versions recorded; change records stored with evidence.
- Testing: contract conformance wrapper on every API test; examples validated; schemas compiled in strict mode.
- Governance: G-CHG for contract changes; declared version impact must equal computed impact.

## Risks and Mitigations

- R-12 custom checker incompleteness: a documented rule list with a test per rule; `oasdiff` as hardening.
- Strict-mode incompatibilities: already found once (Ajv rejected nested conditionals); validation runs in CP-1.

## Reversibility

High.

## Traceability

- Requirements: FR-126, NFR-010, FR-019, FR-130, Constitution I and VI.
- Specification: Non-functional requirements (change safety); contracts referenced throughout.
- Plan: contracts/README.md; plan.md section 2.1; research.md ADR-009.
- Tasks: not yet generated; expected slices S1, S2.

## Validation

CV-01 to CV-10; the design-time validation record in contracts/README.md.
