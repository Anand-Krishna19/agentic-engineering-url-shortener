# ADR-008: Observability and Measurement Model

## Status

**Proposed.** Requires explicit approval.

## Context

Constitution IX requires a correlation identifier per execution, recorded transitions, and logs, metrics, traces, and workflow history that allow reconstruction. FR-131 requires reliability and orchestration measurements, and the plan requires MTTR with a fixed formula, unrecovered failures reported separately, stated populations and exclusions, and demonstration data never presented as production statistics.

## Decision Drivers

Minimal moving parts; correlation across signals; honest labelling; derivable measurements; testability; reversibility.

## Options Considered

**A. `pino` JSON logs (Fastify's native logger, with redaction), `prom-client` metrics, a small span recorder to JSONL, and one measurement query layer over the audit and failure tables.**
- Advantages: few dependencies; correlation ids already in audit events; redaction paths enforce "no secrets in logs".
- Disadvantages: traces are local files; no backend UI.
- Risks: reviewers may expect OpenTelemetry (R-11).
- Impact: Telemetry port, three adapters, report builder.
- Assessment: sufficient evidence with small surface.

**B. OpenTelemetry SDK with exporters.** Advantages: standard. Disadvantages: more dependencies and configuration; no backend to show. Backlog (BL-02).

**C. Logs only.** Disadvantages: no metrics or traces; fails Constitution IX. Rejected.

## Decision

Use **option A** behind a `Telemetry` port. The run id is the correlation id; applications also use a per-request `request_id`; `trace_id` is stored on audit events. Metrics are catalogued in observability.md section 3. Measurements are produced by one query layer as documents conforming to `measurement-report.schema.json`. **MTTR = total recovery duration across recovered failure events ÷ number of recovered failure events**; unrecovered failures are excluded from the denominator and reported separately; `OPEN`, `SIMULATED`-clock, synthetic, and human-intervention events are stratified or excluded with listed reasons; every report carries population, exclusions, data nature, and limitations. Every evidence item carries `agent_mode` and `clock_kind`.

## Rationale

It satisfies the specification with the smallest design, keeps all signals correlated, and makes the measurement rules explicit and testable.

## Consequences

- Positive: reconstructable executions; auditable measurements; no secret leakage by construction.
- Negative: no trace viewer; custom span format.
- Operational: log and trace files under `evidence/`; `/metrics` bound to loopback.
- Testing: correlation-id equality across log, audit event, and span; redaction tests; an MTTR test (two recovered, one unrecovered gives `total / 2` and unrecovered count 1; zero recovered gives null).
- Governance: POL-OBS-001 to POL-OBS-004; demonstration measurements labelled.

## Risks and Mitigations

- R-11 expectation of OpenTelemetry: the port makes it a swap.
- Misleading metrics: labelled populations, limitations always present, illustrative examples never in evidence bundles.

## Reversibility

High.

## Traceability

- Requirements: FR-130, FR-131, NFR-005, NFR-006, Constitution IX.
- Specification: Evidence Catalogue; NFR-005; PVT-013.
- Plan: observability.md sections 1 to 7; research.md ADR-008.
- Tasks: not yet generated; expected slice S7.

## Validation

The tests above; a produced report validates against its schema; a reviewer recomputes MTTR by hand from the listed individual recoveries.
