# ADR-016: Application Architecture: Two Planes, Ports and Adapters, Minimal Shared Kernel

## Status

**Proposed.** Not yet explicitly approved as a standalone decision; requires approval.

## Context

The product has two cooperating parts: the URL shortener (application plane) and the governed orchestrator (control plane). Constitution VII requires separated concerns (domain, API delivery, persistence, orchestration, policy enforcement, telemetry, infrastructure), explicit interfaces for external dependencies, and avoidance of unjustified complexity. Data ownership must be separate, and the control plane must not read the shortener's database (plan section 1.5).

## Decision Drivers

Separation of concerns and data ownership; testability behind ports; traceability in one history; simplicity; avoidance of distributed-system overhead.

## Options Considered

**A. One repository, two planes in separate packages, a minimal shared kernel (clock, ids, canonical JSON, hashing, errors, telemetry ports), ports and adapters inside each plane.**
- Advantages: clear ownership; one history for traceability; ports make adapters replaceable.
- Disadvantages: discipline needed to keep the kernel small.
- Risks: boundary erosion.
- Impact: directory layout, import-boundary rules.
- Assessment: demonstrates architecture clearly.

**B. Two repositories or services.** Advantages: hard isolation. Disadvantages: deployment and coordination overhead without assessment benefit. Rejected.

**C. A single monolithic module.** Disadvantages: weak separation; hides the planes. Rejected.

## Decision

Use **option A**. Layout: `src/kernel`, `src/shortener/{domain,app,adapters}`, `src/orchestrator/{domain,governance,reliability,agents,observability,adapters}`; two PostgreSQL databases; the planes share no domain code. ESLint import rules enforce direction (adapters depend on domain, never the reverse) and plane separation; the control plane never queries the shortener's database.

## Rationale

It gives the separation reviewers look for at the lowest cost and keeps the whole lifecycle in a single auditable history.

## Consequences

- Positive: replaceable adapters; testable domain; clear ownership.
- Negative: more files and interfaces than a quick prototype.
- Operational: two processes, one repository.
- Testing: import-boundary tests (POL-ARCH-001); domain tests with no I/O.
- Governance: architecture changes require G-ARCH and G-CHG.

## Risks and Mitigations

- Boundary erosion: lint rules and a boundary test run in `verify`.

## Reversibility

Medium. Splitting into services later is straightforward because planes already share no domain code.

## Traceability

- Requirements: NFR-004, Constitution VII, POL-ARCH-001, POL-ARCH-002.
- Specification: NFR-004 (maintainability).
- Plan: plan.md sections 1 and 5; traceability.md section 3.
- Tasks: not yet generated; expected slices S1, S2.

## Validation

Boundary tests; review of the layout at G-ARCH.
