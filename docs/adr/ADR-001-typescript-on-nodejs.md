# ADR-001: Implementation Language and Runtime: TypeScript on Node.js

## Status

**Accepted.** Approved by the human candidate on 2026-10-16, recorded as DEC-071. Clarification: tested on Node 22, "20 or later" supported.

## Context

Both planes (URL shortener and orchestrator) need one implementation language. The specification forbids choosing it in requirements (CON-001) and reserves the choice for the human at plan time. The assessment values testability, contract-first discipline, reviewer legibility, and a locally runnable prototype within 2 to 3 days (plan section 6). Installed on the candidate's machine: Node.js 24.22.0 and npm 11.19.1; Java 27 (JDK only); no Go, no .NET. A feasibility spike installed the whole proposed toolchain on Node 24 and passed contract validation under it (research.md section 1.1).

## Decision Drivers

K1 runs with what is installed; K2 time to a tested result; K3 testability and determinism; K4 contract and schema tooling; K8 reviewer legibility; supply-chain surface; reversibility.

## Options Considered

**A. TypeScript (strict) on Node.js 20 or later.**
- Approach: ES modules, compiled with `tsc`, npm with a committed lock file.
- Advantages: schemas from the contract can be used directly by the framework (single source of truth); strong tooling for JSON Schema and OpenAPI; already installed; types catch interface drift between ports and adapters.
- Disadvantages: types are erased at runtime so runtime validation remains essential; a large transitive dependency tree.
- Risks: toolchain churn (TypeScript 6 and Vitest 5 are recent majors); supply-chain exposure.
- Implementation impact: Node scripts for CLI, build, and verification; ESLint rules for the clock and import boundaries.
- Assessment implications: contract-first design is demonstrable end to end.

**B. Python 3.13 or later.** The planner's earlier proposal (superseded by DEC-060). Advantages: standard library breadth (hashing, secrets, sqlite), fewer dependencies. Disadvantages: contract and runtime schemas are separate artifacts, so drift must be tested. Risks: very new interpreter. Impact: a rewrite of the plan's tooling choices. Assessment: viable, but the human chose otherwise.

**C. Java 27.** Advantages: strong typing and concurrency. Disadvantages: no build tool installed (Maven or Gradle download required), heavier setup. Risks: time. Impact: large. Assessment: unnecessary ceremony for the timebox.

**D. Go or .NET.** Not installed; excluded.

## Decision

Use **TypeScript in strict mode on Node.js**, declared compatible with **Node 20 or later** (`engines >= 20`) and **tested on Node 22 (LTS)** (DEC-071); the installed Node 24.22.0 is also usable. Node 20 is declared compatible but is not itself tested. ES modules, npm with a committed `package-lock.json` and `npm ci` for reproducible installs (PA-012). Library selections around it are in the other ADRs (PA-013).

## Rationale

It satisfies the approved requirements with the least friction: the toolchain is installed and was verified, and Fastify's schema-based validation (ADR-002) makes the authored contract the runtime truth, which retires the largest weakness of the alternative. The human selected it.

## Consequences

- Positive: contract drift is largely removed; strict typing across ports; good async concurrency for the I/O-bound workload.
- Negative: dependency tree size; recent major versions of core tools.
- Operational: `npm ci` for installs; Node version recorded in `engines`; developed on 24.x.
- Testing: Vitest and Supertest (ADR-012); property tests with `fast-check`; ESLint bans direct clock calls (ADR-010).
- Governance: dependency changes pass the allow-list policy POL-DEP-001 and G-CODE review (ADR-014); `npm audit` gates release (DEC-054).

## Risks and Mitigations

- R-01 toolchain churn: lock file; CP-1 verifies install, `tsc --noEmit` strict, a trivial test, and contract validation.
- R-25 npm supply chain: allow-list of direct dependencies, integrity hashes, `npm ci`, `npm audit`, license check.
- **Runtime floor (resolved, DEC-071):** the human approved testing on Node 22 and supporting "20 or later". Node 22 is **not installed** on the candidate's machine (24.22.0 is), so provisioning Node 22 for verification (for example a version manager) is a checkpoint CP-1 task; until then results are labelled with the Node version actually used.

## Reversibility

Medium. Ports and the language-neutral contracts isolate the domain, but changing language means rewriting both planes.

## Traceability

- Requirements: NFR-004, NFR-009, CON-001, ASM-007.
- Specification: How to Read; CON-001; Decision Record DEC-060.
- Plan: Technical Context; research.md section 3 (ADR-001); section 6 (checkpoint CP-1).
- Tasks: not yet generated (`/speckit-tasks`); expected slice S1.

## Validation

CP-1: Node 22 is available for verification; `npm ci` succeeds from the lock file; `tsc --noEmit` passes in strict mode; a trivial Vitest test passes; the contract-validation script passes (already executed once: 23 of 23 checks under Node 24). Review: the human approves the runtime-floor recommendation.
