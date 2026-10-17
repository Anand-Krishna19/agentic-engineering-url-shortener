# ADR-004: Orchestration Model: A Small Custom In-Process Engine

## Status

**Accepted.** Approved by the human candidate on 2026-10-16, recorded as DEC-073.

## Context

The central differentiator of the assessment is a governed, stateful, non-linear orchestration system (Constitution II; FR-103 to FR-123). It must have an explicit dependency model, parallel paths and synchronization, branching, interruption and resumption, human gates, bounded retries, fallback, compensation, safe-stop, and dynamic replanning, all with audit-grade evidence. A linear chain of agents is explicitly insufficient (CON-005).

## Decision Drivers

Explicit and inspectable semantics (K5); determinism with a simulated clock (K3); no unjustified distributed-system complexity (K6); schedule (K2); reviewer legibility (K8).

## Options Considered

**A. Small custom engine, in-process, persisted in PostgreSQL.**
- Approach: a profile-defined graph, node and run state machines, a scheduler with leases, gates, and an effect ledger (orchestration-model.md).
- Advantages: every required semantic is first-party and testable with a simulated clock; no extra infrastructure.
- Disadvantages: roughly ten source files to write and test; risk of incorrect durable-execution semantics.
- Risks: R-06 schedule, R-07 semantics errors.
- Impact: the largest single build item (slices S4 to S6).
- Assessment: directly demonstrates orchestration design.

**B. LangGraph or a similar agent framework.** Advantages: ready-made graph abstractions. Disadvantages: constrains gate, replan, and audit semantics; nondeterministic agent coupling; framework lock-in. Risk: hides the design being assessed. Impact: adapters to force governance into the framework. Assessment: weaker evidence of original design.

**C. Temporal.** Advantages: durable execution, retries. Disadvantages: server infrastructure, steep learning curve, workflow-code determinism rules. Risk: setup and time. Assessment: disproportionate for a single-node prototype.

**D. Airflow or Prefect.** Advantages: DAG scheduling. Disadvantages: batch-oriented, heavy, awkward for human gates and replanning. Assessment: poor fit.

**E. BPMN engine (Camunda or Zeebe).** Advantages: gates and user tasks. Disadvantages: heavy infrastructure; modeling outside the repository. Assessment: disproportionate.

## Decision

Build a **small custom in-process orchestration engine in TypeScript**, persisted in PostgreSQL (the control plane's database), implementing the model in [orchestration-model.md](../../specs/001-agentic-sdlc-url-shortener/orchestration-model.md): profile `sdlc/1`, 19 node types with branch-wise fan-out, 15 node states with an explicit transition table, 10 gates, SAFE_STOPPED terminal state, lease-based execution, and replanning by plan versions. Scheduling and leases use PostgreSQL; the control plane uses no Redis.

## Rationale

The assessment evaluates the orchestration design itself. Only a first-party engine lets every required semantic be explicit, inspectable, and deterministic under test, and avoids infrastructure the specification discourages.

## Consequences

- Positive: complete control and evidence of each semantic; deterministic tests.
- Negative: more code to write and maintain; no ecosystem support.
- Operational: one control-plane process (scheduler plus worker pool) and a CLI.
- Testing: table-driven transition tests (every allowed and prohibited pair), dependency-order property tests with `fast-check`, resume and replan tests.
- Governance: the node catalogue and profile are versioned artifacts; changing a node or gate is a workflow-state change requiring G-CHG (FR-126).

## Risks and Mitigations

- R-06 overrun: scope tiers, checkpoints, the feature set kept deliberately small (plan section 6).
- R-07 semantic errors: transition-table tests, property tests, fault injection (reliability.md).

## Reversibility

Medium. Nodes, ports, the audit schema, and the contracts are engine-independent, so another engine could run the same node catalogue; the persistence layout is tied to this engine.

## Traceability

- Requirements: FR-103 to FR-123, NFR-011, CON-005, Constitution II.
- Specification: Functional Requirements: Agentic SDLC Orchestration; SCN-A, SCN-B, SCN-C.
- Plan: plan.md section 2.2; orchestration-model.md; research.md ADR-004.
- Tasks: not yet generated; expected slices S4, S5, S6.

## Validation

Transition-table tests; graph and join tests; the three scenarios; fault-injection runs FI-07 to FI-14; review of the node catalogue against FR-104.
