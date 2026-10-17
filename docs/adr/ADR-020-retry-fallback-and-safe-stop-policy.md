# ADR-020: Retry, Fallback, and Safe-Stop Policy

## Status

**Proposed.** The approved numbers (PVT-009, PVT-010, PVT-011), the safe-stop semantics (DEC-045, DEC-050), and the assumptions PA-002 and PA-003 were approved; this ADR consolidates them into one policy and awaits approval.

## Context

The system must classify failures as transient or permanent, retry within bounds with backoff and timeouts, support fallback that never lowers a requirement, and enter a deterministic terminal safe-stop when continuation is unsafe (FR-117 to FR-121, Constitution VIII). A human wait is not a failure; a policy FAIL or a failing test is a result, not a node failure.

## Decision Drivers

Determinism; bounded behavior; safety (never weaken governance); evidence capture (failure and recovery events for MTTR); testability on a simulated clock.

## Options Considered

**A. One central policy: classification function per plane; at most 3 retries with exponential backoff (1 s, 2 s, 4 s, no jitter); per-attempt timeouts by node type; fallback only after the retry bound and only if defined; seven explicit safe-stop triggers; SAFE_STOPPED is terminal.**
- Advantages: predictable and testable; consistent across nodes.
- Disadvantages: no jitter (acceptable at single-node scale); fixed bounds.
- Risks: mis-classification.
- Impact: a policy module, failure events, trigger table.
- Assessment: demonstrates controlled autonomy.

**B. Per-node ad hoc policies.** Disadvantages: inconsistent, hard to evidence. Rejected.

**C. A retry library with default settings.** Disadvantages: hides semantics and bounds; no effect-ledger awareness. Rejected.

## Decision

Use **option A**. Bounds (PVT-009, PVT-010, PA-002, PA-003): 3 retries after the first attempt; backoff 1 s doubling; 10 s timeout for deterministic nodes and policy checks; 60 minutes logical for external-work nodes; at most 3 resumptions per node. Fallback options: `HUMAN_AUTHORED_SUBMISSION` for agent nodes (or an alternate scripted agent in scripted profiles), analytics fail-open, cached scan data labelled OFFLINE; a fallback never lowers a policy, security, or approval requirement. **Safe-stop triggers**: SS-1 permanent failure or exhausted retries and fallback on a required node; SS-2 failed compensation; SS-3 two gate timeouts; SS-4 mandatory policy FAIL unresolved at the end of the 24-hour logical window; SS-5 audit chain failure; SS-6 resumptions exceeded; SS-7 control-plane persistence unavailable beyond the bound. Safe-stop preserves all state and evidence, is terminal, and is never resumed; recovery is a new run (DEC-050).

## Rationale

A single policy is the only way to make retries, fallbacks, and stops consistent, testable, and auditable.

## Consequences

- Positive: predictable recovery; clean MTTR evidence; no weakening of governance.
- Negative: fixed parameters; no jitter.
- Operational: durations are configurable and simulated in tests (labelled).
- Testing: retry, timeout, fallback, safe-stop, and resume suites; fault injection FI-01 to FI-16; no repeated committed non-idempotent effect.
- Governance: fallback and safe-stop are audit events; POL-REL-001 and POL-REL-002.

## Risks and Mitigations

- Mis-classification: one classifier per plane with exhaustive tests.
- Retry amplification: bounded attempts; non-idempotent effects guarded by the effect ledger (ADR-021).

## Reversibility

High (parameters) to medium (trigger set).

## Traceability

- Requirements: FR-117 to FR-121, FR-020, NFR-002, NFR-008, PVT-009 to PVT-011, DEC-041, DEC-045, DEC-050, PA-002, PA-003.
- Specification: Reliability and recovery.
- Plan: reliability.md; orchestration-model.md sections 4, 5.1, 7.2, 7.4.
- Tasks: not yet generated; expected slice S6.

## Validation

The suites above; the must-run fault-injection subset; a reviewer recomputes MTTR from failure events.
