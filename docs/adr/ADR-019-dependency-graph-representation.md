# ADR-019: Dependency Graph Representation: Versioned Profile, Branch Fan-Out, Named Predicates

## Status

**Proposed.** Requires explicit approval.

## Context

Stage order must be governed by explicit dependencies or an equivalent state model (FR-105). The system must run independent activities in parallel and synchronize before dependents (FR-106), suspend only an affected path on a material ambiguity (FR-113), and re-plan without re-running unaffected stages (FR-122). Conditional branches must be inspectable, not hidden in code.

## Decision Drivers

Inspectability; testability of ordering; precise granularity for "affected path"; stable history under replanning; no free-form code in edges.

## Options Considered

**A. A versioned workflow profile (`sdlc/1`) defining a node catalogue and edges; instances created per plan version; branch fan-out declared by the decomposition; conditions as named predicates from a registry; slice-level artifact consumption.**
- Advantages: the graph is data, visible and diffable; branches make path granularity precise; predicates are unit-testable.
- Disadvantages: dynamic instantiation per branch adds engine complexity.
- Risks: instance-key mistakes (node key plus branch).
- Impact: profile schema, instantiation logic, predicate registry.
- Assessment: demonstrates a real non-linear model.

**B. Hard-coded control flow in the engine.** Disadvantages: not inspectable; violates "execution order must not be hard-coded outside the model" (FR-105 negative criterion). Rejected.

**C. An external DAG format (YAML pipelines).** Advantages: familiar. Disadvantages: requires a parser and expression language; no better than a typed profile. Rejected.

## Decision

Use **option A**. A profile defines 19 node types, `DEPENDS_ON`, `CONDITIONAL`, and `GATE` edges, and the 10 gates. The decomposition node declares branches; the engine instantiates the branch-scoped nodes (N08 to N11) once per branch with unique key `(run_id, plan_version, node_key, branch)` and keeps run-level nodes single (N12 to N19, N14). Edge conditions are **named predicates** (`has_material_ambiguity`, `no_impacted_components`, `security_sensitive_change`, `has_destructive_effect`, `has_residual_risk`, and others), never free-form code. Plan versions are immutable; each stores its edges.

## Rationale

It makes order and parallelism data, so it is inspectable and testable, and it gives the branch granularity required to suspend only an affected path.

## Consequences

- Positive: inspectable model; precise suspension; deterministic tests.
- Negative: more engine code for dynamic instantiation.
- Operational: profile versions recorded on runs.
- Testing: a property test that no node starts before its dependencies; fan-out and join tests; predicate unit tests; a test that prohibits ordering outside the model.
- Governance: a profile change is a workflow-state change requiring G-CHG.

## Risks and Mitigations

- Complexity of branch instantiation: small, table-driven implementation with exhaustive transition tests.

## Reversibility

Medium. The profile format could be replaced, but the instance and lineage tables depend on the key shape.

## Traceability

- Requirements: FR-104 to FR-106, FR-113, FR-122, FR-126.
- Specification: Orchestration model.
- Plan: orchestration-model.md sections 2 and 10; data-model.md `node_instances` and `edges`.
- Tasks: not yet generated; expected slice S4.

## Validation

The tests above; Scenario A branch suspension demonstration.
