# ADR-002: Web Framework: Fastify, Contract-First

## Status

**Proposed.** Fastify was explicitly approved by the human (DEC-060). The configuration requirements and drift controls below are planner additions awaiting approval.

## Context

Both planes expose HTTP APIs (FR-001 to FR-023 and FR-101 to FR-133) with machine-checkable contracts (OpenAPI 3.1, JSON Schema 2020-12) that were authored before any code (Constitution I). Error responses must be RFC 9457 problem details with stable reason codes. Some inputs must be rejected, not tolerated: for example `ttl_seconds` must produce `unsupported_expiry_representation` (DEC-024), and unknown fields must produce `malformed_request`.

## Decision Drivers

Contract fidelity (no silent input mutation), schema validation at the boundary, testability, performance headroom for PVT-001 to PVT-005, plugin-based separation of concerns, reviewer legibility.

## Options Considered

**A. Fastify 5.** Approach: register request and response schemas taken from the contract; one error handler maps validation and domain errors to problem details. Advantages: built-in schema validation and fast serialization; encapsulated plugins fit ports and adapters; `onRoute` hook enables route-drift testing; native `pino` logging. Disadvantages: defaults are permissive in ways that violate the contract (Ajv strips unknown properties and coerces types). Risks: a default silently accepts input the contract rejects. Impact: explicit Ajv configuration and a test per documented error. Assessment: strongest contract-first story.

**B. Express.** Advantages: ubiquitous. Disadvantages: no built-in schema validation; contract conformance would be hand-built. Risk: validation gaps. Impact: more custom code. Assessment: weaker evidence of contract-first.

**C. NestJS.** Advantages: structure and DI. Disadvantages: decorators and heavy framework conventions obscure the explicit ports-and-adapters design; larger surface. Risk: time. Assessment: more ceremony than value.

**D. Hono.** Advantages: light. Disadvantages: less mature schema and plugin ecosystem for this need. Assessment: acceptable but no advantage.

## Decision

Use **Fastify 5**, contract-first: request and response schemas come from the authored OpenAPI documents. Ajv is configured with **`removeAdditional: false`, `coerceTypes: false`, `useDefaults: false`, strict mode on**. A single error handler produces RFC 9457 problem details using the contract's reason codes. Every route declares response schemas so serialization cannot leak undeclared fields. An `onRoute` hook collects method, path, and status codes for the drift test (CV-05).

## Rationale

Fastify makes the contract executable at runtime, so the authored file and the behavior cannot silently diverge, and the Ajv settings turn permissive defaults into the strict behavior the specification requires. It matches the human's stated reasons (built-in schema validation, performance, separation of concerns).

## Consequences

- Positive: invalid input is rejected at the boundary with stable reasons; responses cannot leak fields; route drift is testable.
- Negative: the contract must be expressible in Fastify's per-route schema form; some OpenAPI features (for example conditionals across fields) need manual validation.
- Operational: one logger (pino) and one metrics registry integration per process.
- Testing: a test per documented error code; a test that an unknown field is rejected, not stripped; contract-conformance wrapper on every response (CV-04).
- Governance: any change to a route or schema is an API change under the change-record process (contracts/README.md).

## Risks and Mitigations

- R-03 default behavior differs from the contract: Ajv settings above plus explicit tests.
- Framework major-version churn: lock file; adapter kept thin.

## Reversibility

High. Delivery is an adapter over use cases; contracts are framework-independent.

## Traceability

- Requirements: FR-001, FR-003, FR-009, FR-016, FR-019, FR-021, FR-102, NFR-004, NFR-010.
- Specification: Functional Requirements (domain and orchestration); DEC-024, DEC-033.
- Plan: plan.md section 2.1 (`C-API`); research.md ADR-002; contracts/README.md CV-01 to CV-10.
- Tasks: not yet generated; expected slices S1, S2.

## Validation

Slice 2 contract-conformance tests; the strict-input test; the route drift test; problem-detail tests for every reason code in the contracts.
