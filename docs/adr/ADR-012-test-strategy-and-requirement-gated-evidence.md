# ADR-012: Test Strategy, Tooling, and Requirement-Gated Evidence

## Status

**Proposed.** Vitest with Supertest was approved (DEC-060). The strategy, the companion tools (DEC-070, PA-013), and the requirement-tagging mechanism require approval.

## Context

Constitution IV requires red-green-refactor TDD, an initially failing test for the expected reason, and unit, integration, API contract, orchestration transition, reliability, security, and end-to-end tests. Task completion requires executed validation. The release gate requires executed tests for **all** functional requirements (ASM-013, DEC-052). Scans must run in release readiness, and unresolved high or critical findings block it (DEC-054).

## Decision Drivers

Provable test-first discipline; a mechanically checkable per-requirement gate; determinism; coverage of negative behavior; scan evidence; low tooling friction.

## Options Considered

**A. Vitest with Supertest, `fast-check`, `@vitest/coverage-v8`, ESLint with `typescript-eslint`, `tsc` strict; `npm audit`, `secretlint`, `license-checker-rseidelsohn`; requirement tags in test titles (`[FR-015]`, `[FR-015:NAC]`) extracted by a custom Vitest reporter; recorded red runs.**
- Advantages: one runner for all levels; fast; property testing for canonicalization; per-requirement gate is mechanical.
- Disadvantages: Vitest has no marker facility, so tags are a convention plus a reporter; npm scanners are less comprehensive than OSV-Scanner.
- Risks: R-15 offline scans; R-25 supply chain.
- Impact: test layout, reporter, verify script.
- Assessment: strongest evidence of test discipline.

**B. Jest and Supertest.** Advantages: familiar. Disadvantages: slower with ESM and TypeScript. Not chosen (human selected Vitest).

**C. Mixed runners per category.** Disadvantages: fragmented evidence. Rejected.

## Decision

Use **option A**. The test categories and protocol are in testing-strategy.md. Every test declares the requirements it verifies in its title; the reporter produces per-requirement results; readiness condition C3 passes only if every functional requirement has at least one executed passing test and every negative acceptance criterion has a negative test. Red runs are recorded before implementation (POL-TEST-001). Scans store outputs as evidence; a seeded fake secret is a negative control.

## Rationale

It makes test-first discipline and per-requirement completeness mechanically verifiable rather than asserted, which is the evidence reviewers need.

## Consequences

- Positive: objective gate; negative behavior is tested; deterministic tests via ADR-010.
- Negative: tag discipline and a custom reporter to maintain; real PostgreSQL and Redis in tests add setup cost.
- Operational: `npm run verify` runs the full chain and writes evidence.
- Testing: the categories TS-UNIT to TS-RELEASE; Redis-down and stale-cache tests; concurrency tests with released barriers.
- Governance: POL-TEST-001 to POL-TEST-003, POL-SEC-005, POL-DEP-001, POL-LIC-001.

## Risks and Mitigations

- Tag drift: a check that every FR has tests and every test cites a real requirement.
- R-24 test speed: template databases, key prefixes.
- Scanner staleness: evidence labelled OFFLINE.

## Reversibility

High.

## Traceability

- Requirements: NFR-009, FR-127, FR-128, Constitution IV and V, ASM-013, DEC-052, DEC-054.
- Specification: Non-functional requirements (testability); Success criteria SC-009.
- Plan: testing-strategy.md; research.md ADR-012; plan.md section 6.
- Tasks: not yet generated; expected slices S1 onward (every slice is test-first).

## Validation

The tests-for-every-FR report; a recorded red run for each new test file; CP-1 scanner smoke with the seeded-secret control.
