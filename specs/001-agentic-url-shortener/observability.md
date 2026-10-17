# Observability, Audit, and Measurement Design

**Feature**: `001-agentic-sdlc-url-shortener` | **Spec**: [spec.md](spec.md) v1.11 | **Plan**: [plan.md](plan.md) | **Schemas**: [contracts/](contracts/)

Design only. Covers FR-130, FR-131, NFR-005, NFR-006, Constitution IX, and the MTTR requirement. Telemetry sits behind a `Telemetry` port (ADR-008): `pino` structured JSON logs (Fastify's native logger, with redaction paths), `prom-client` metrics, and a small span recorder.

## 1. Signals

| Signal | Where | Format | Retention (ASM-016) |
|--------|-------|--------|---------------------|
| **Logs** | Both planes, to stdout and a rotating file | One JSON object per line: `ts`, `level`, `plane`, `event`, `request_id` or `run_id`, `correlation_id`, `trace_id`, `span_id`, `attempt_id`, outcome fields. No secrets, tokens, client addresses, or destination URLs (FR-013, NFR-001). | Duration of the prototype |
| **Metrics** | `/metrics` on each plane (loopback only by default) | Prometheus text, see section 3 | In-process; exported snapshots are evidence |
| **Traces** | Span recorder to `evidence/traces/*.jsonl` | W3C-compatible 128-bit `trace_id`, 64-bit `span_id`, parent, name, start, end, status, attributes | Duration of the prototype |
| **Audit events** | `audit_events` (control plane), `app_audit_events` (application plane) | Schema [audit-event.schema.json](contracts/schemas/audit-event.schema.json); hash-chained, append-only | Duration of the prototype; never purged by an automated process (POL-RET-001) |
| **State-transition history** | `audit_events` rows with `action=NODE_STATE_CHANGED` plus `from_state` and `to_state` | Gapless `seq` per run | Same |
| **Decision history** | `decisions`, `assumptions`, `ambiguities`, `clarifications` and `DECISION_RECORDED` audit events | Linked by `decision_id`, `causation_id` | Same |
| **Approval history** | `approvals` with authenticated identity and subject hash, plus `APPROVAL_*` events | | Same |
| **Retry evidence** | `node_attempts` (outcome, attempt_no) plus `RETRY_SCHEDULED` events and `failure_events` | | Same |
| **Compensation evidence** | `effects` rows and `COMPENSATION_*` events | | Same |
| **Replanning evidence** | `plan_versions`, `ARTIFACT_MARKED_STALE`, `REPLAN_PROPOSED`, `REPLAN_APPLIED` events with the affected set | | Same |

## 2. Correlation

- The run identifier is the correlation identifier for everything a run does (NFR-005). Every log line, metric exemplar, span, audit event, artifact, and work item carries it.
- Application requests get a `request_id` (a time-ordered id) returned in every problem body and logged. It appears in the application audit record when applicable.
- Span structure: one root span per HTTP request or per node attempt; child spans for persistence calls, validation, policy checks, and agent work items. The `trace_id` is stored on audit events (`data.trace_id`) so a reviewer can move from audit to trace.
- A test asserts that for a sample of requests and runs the correlation id is present and equal in the log, the audit event, and the span (no orphaned records).

## 3. Metrics Catalogue

| Metric | Type | Labels | Plane |
|--------|------|--------|-------|
| `urlshort_http_requests_total` | counter | `route`, `status` | App |
| `urlshort_redirect_latency_seconds` | histogram | none | App |
| `urlshort_create_latency_seconds` | histogram | none | App |
| `urlshort_rate_limited_total` | counter | `dimension` (`token`, `ip_hash`) | App |
| `urlshort_idempotency_events_total` | counter | `kind` (`replay`, `conflict`, `in_progress`, `lease_abort`) | App |
| `urlshort_analytics_capture_failures_total` | counter | none | App |
| `urlshort_persistence_failures_total` | counter | `class` (`transient`, `permanent`) | App |
| `urlshort_code_collisions_total` | counter | none | App |
| `urlshort_ready` | gauge | none | App |
| `urlshort_degraded_mode` | gauge | `reason` (`redis_unavailable`) | App |
| `orch_runs_total` | counter | `status`, `release_outcome`, `agent_mode` | Control |
| `orch_node_attempts_total` | counter | `node_key`, `outcome` | Control |
| `orch_retries_total` | counter | `node_key` | Control |
| `orch_fallbacks_total`, `orch_compensations_total` | counter | `result` | Control |
| `orch_safe_stops_total` | counter | `trigger` (SS-1 to SS-7) | Control |
| `orch_resumptions_total` | counter | `node_key` | Control |
| `orch_gate_wait_seconds` | histogram | `gate_key`, `clock_kind` | Control |
| `orch_policy_evaluations_total` | counter | `policy_id`, `outcome` | Control |
| `orch_audit_chain_verifications_total` | counter | `result` | Control |
| `orch_run_duration_seconds` | histogram | `human_wait` (`inclusive`, `exclusive`) | Control |

Metric labels never contain client addresses, tokens, or URLs.

## 4. Measurements to Calculate or Demonstrate

All measurements are produced by one query layer over the tables and emitted as a document conforming to [measurement-report.schema.json](contracts/schemas/measurement-report.schema.json). Each report states its **measurement population**, **exclusions**, and **limitations**, and carries `data_nature` (`DEMONSTRATION` or `ACTUAL_LOCAL_EXECUTION`). None is a production statistic (Constitution IX, FR-129 NAC, POL-OBS-004).

| Measurement | Definition |
|-------------|------------|
| Workflow success rate | `completed_runs / terminal_runs` over the population. COMPLETED includes runs whose readiness outcome is NOT_READY (a correct governed outcome); the NOT_READY share and the SAFE_STOPPED and CANCELLED counts are reported beside it. |
| Failure rate | `failed_attempts / attempts`, where a failed attempt is any node attempt with a FAILED_*, TIMED_OUT, INTERRUPTED, or ABORTED outcome. Test-result failures and policy FAILs are not attempt failures. |
| Retry frequency | `retries / node_executions` (a retry is an attempt after the first for the same node instance). |
| Rollback and compensation frequency | Counts of effects rolled back and compensated, and their ratio to all effects. |
| End-to-end latency | `terminal_at - created_at` per run, reported twice: inclusive of human waiting, and exclusive (the sum of node execution time on the critical path). Distribution with count, minimum, p50, p95, and maximum. |
| Recovery duration (individual) | See section 5. |
| Unrecovered failure count | Failure events with status UNRECOVERED, reported separately. |

## 5. Mean Time to Recovery (MTTR)

**Formula (fixed):**

```text
MTTR = Total recovery duration across recovered failure events
       ÷ Number of recovered failure events
```

Unrecovered failures are **not** in the denominator and are reported separately as `unrecovered_failure_count`.

### 5.1 Captured per failure event (`failure_events`)

| Field | Definition |
|-------|------------|
| failure-detected timestamp (`detected_at`) | The moment the system first observed the failure: the end of a failed attempt, the expiry-scan time for an interruption, or the moment a failed persistence call returned. For a process killed outright the time of the crash is unobservable, so the detection time is the restart scan time; the downtime before detection is **not** counted (disclosed limitation). |
| recovery-start timestamp (`recovery_started_at`) | When the recovery action began: the retry attempt's start, the resume dispatch, the fallback activation, or the compensation start. |
| recovery-complete timestamp (`recovery_completed_at`) | When the affected operation next reached success: the retried or resumed attempt SUCCEEDED, the fallback produced a valid result, or compensation finished. |
| individual recovery duration (`recovery_duration_ms`) | `recovery_completed_at - detected_at`, in milliseconds, on the stated clock. It includes any backoff wait. |
| recovery mechanism | `RETRY`, `RESUME`, `FALLBACK`, `COMPENSATION`, or `HUMAN_INTERVENTION` (or `NONE` while unrecovered). |
| recovered versus unrecovered status | `RECOVERED`, `UNRECOVERED`, or `OPEN` (not yet resolved when the report runs). |
| clock kind | `WALL` or `SIMULATED`. |
| synthetic | True for injected faults. |

### 5.2 Derived in the report

- **Number of recovered failure events**: count of events in the population with status RECOVERED.
- **Total recovery duration**: the sum of their `recovery_duration_ms`.
- **MTTR calculation**: `total_recovery_duration_ms / recovered_failure_events`, null when there are zero recovered events (never a divide by zero, never computed over unrecovered events).
- **Individual recoveries** are listed with their mechanisms so reviewers can recompute the figure by hand.

### 5.3 Measurement population and exclusions

| Rule | Treatment |
|------|-----------|
| Population | A stated set of runs (selected by scenario tag, agent mode, and date), recorded in the report |
| Failure events with `OPEN` status | Excluded from MTTR and counted separately as open |
| Unrecovered events | Excluded from the denominator; reported in `unrecovered_failure_count` and `unrecovered_events` |
| `SIMULATED`-clock events | Excluded from the WALL-clock MTTR and reported as their own stratum, so simulated timeouts are never mixed into real durations (DEC-044) |
| Synthetic (injected) events | Reported as their own stratum; the headline MTTR states whether it includes them |
| `HUMAN_INTERVENTION` recoveries | Excluded from the headline MTTR because human latency is not a system property; reported separately |
| Approval and clarification waiting, planned suspensions | Never failures; excluded entirely |

### 5.4 Demonstration-data limitations (always in the report)

- The environment is one local machine with no concurrent users; durations reflect a quiet system.
- Most failures are synthetic injections; they exercise recovery paths but do not represent organic failure rates.
- The population is small (the three scenarios plus targeted fault-injection runs), so the figure has no statistical confidence; it is not extrapolable.
- A run mixing `LIVE_EXTERNAL` and `SCRIPTED` nodes is labelled `MIXED`; AI-session latency is not a property of the system.
- None of these figures is a production measurement.

### 5.5 Worked arithmetic (illustrative only)

Two recovered events of 3 000 ms and 1 000 ms and one unrecovered event give `MTTR = (3000 + 1000) / 2 = 2000 ms`, with `unrecovered_failure_count = 1` reported separately. This shows the rule only; the numbers are invented and are not evidence. The corresponding illustrative document is `contracts/examples/measurement-report.illustrative.json`.

## 6. Mechanisms to Produce the Evidence

| Mechanism | What it does |
|-----------|--------------|
| `orch events <run>` / `GET .../events` | Reconstruct the timeline in sequence order (FR-130) |
| `orch audit verify` / `POST /v1/audit/verify` | Recompute hash chains; report the first bad event |
| `orch report measurements` / `GET .../measurements` and `/v1/measurements/summary` | Emit the measurement report for a stated population |
| `orch export <run>` | Write a self-contained evidence bundle: run state, lineage, audit events, decisions, approvals, policy evaluations, failure events, measurements, with `agent_mode` and `clock_kind` on every item and content hashes for every file |
| Span and log files | `evidence/traces/`, `evidence/logs/` |

The final report never states a measurement without a link to an export produced by these mechanisms.

## 7. Evidence Honesty Rules

1. Every evidence item carries `agent_mode` (`LIVE_EXTERNAL`, `SCRIPTED`, or `MIXED`), `clock_kind`, and (for failures) `synthetic`.
2. Illustrative examples are named `*.illustrative.json` and never appear in an evidence bundle.
3. A SCRIPTED run cannot be labelled LIVE_EXTERNAL (POL-TRC-002 check).
4. A missing measurement is shown as absent, never estimated.
5. Evidence is hashed at export; the final summary cites hashes so reviewers can verify files were not altered afterwards.
