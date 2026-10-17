# ADR-005: Agent Invocation: Abstract AgentPort with Scripted and External-Work Adapters

## Status

**Accepted.** Approved by the human candidate on 2026-10-16, recorded as DEC-074.

## Context

AI-assisted implementation must be coordinated and gated by human review (DEC-001, FR-133). The orchestrator must not depend on a specific model provider, must keep secrets out of the core path, and must produce honest evidence about what was AI-generated and what was scripted (Constitution X). Tests need deterministic agents.

## Decision Drivers

Provider independence; deterministic tests (K3); honesty of evidence; no API keys in the core path; human review of AI output; schedule.

## Options Considered

**A. Abstract `AgentPort` with two adapters: scripted agents and an external-work adapter.**
- Approach: the orchestrator writes a content-addressed work package and a work item; an AI-assisted session or a human claims it with a lease and submits an artifact; scripted agents answer deterministically for tests and fault injection.
- Advantages: no provider coupling or credentials in the core; deterministic tests; real AI-assisted work enters through the same gate; evidence modes are structural.
- Disadvantages: live runs need a human and an AI session at hand; file-based handoff is not a production design.
- Risks: R-08 live runs depend on availability; forged mode labels.
- Impact: port, two adapters, work-item lifecycle.
- Assessment: demonstrates controlled autonomy honestly.

**B. Direct model-provider API adapter now.** Advantages: fully automated runs. Disadvantages: credentials and cost in the core, nondeterminism, extra security surface, time. Risk: scope creep. Assessment: deferred to backlog (BL-01).

**C. Scripted agents only.** Advantages: simplest. Disadvantages: the AI-assisted claim becomes unverifiable. Assessment: insufficient.

## Decision

Define an abstract **`AgentPort`** (`offer`, `claim`, `submit`, `release`) and implement two adapters: **scripted** (deterministic fixtures, `SCRIPTED` evidence) and **external-work** (file inbox and outbox, `LIVE_EXTERNAL` evidence). Agents authenticate with the agent credential and act within a role scope (orchestration-model.md section 9). The evidence mode is set by the engine from the adapter that delivered the submission, never by the submitter. A provider API adapter is backlog item BL-01.

## Rationale

It keeps the specification's contract (what the orchestrator expects from agents) separate from invocation, avoids secrets in the core path, and makes every artifact's provenance explicit.

## Consequences

- Positive: provider independence; deterministic tests; honest evidence labels.
- Negative: live demonstration is partly manual; two adapters to maintain.
- Operational: `inbox/` and `outbox/` directories (git-ignored); work-item leases.
- Testing: port contract tests; schema-invalid and out-of-scope submission tests; a test that SCRIPTED output cannot be labelled LIVE_EXTERNAL.
- Governance: every generated artifact passes G-CODE before it is complete or merge-eligible (FR-133).

## Risks and Mitigations

- R-08 availability: scripted rehearsals; stop condition SC-5.
- TH-09 forged mode label: mode derived by the engine; POL-TRC-002 check.
- TH-06 prompt injection through requirement text: role scopes, credential separation, schema validation, nothing applied before G-CODE.

## Reversibility

High. The port isolates the choice; adding a provider adapter does not change the engine.

## Traceability

- Requirements: FR-109, FR-133, NFR-011, DEC-001, ASM-017.
- Specification: FR-109, FR-133; AMB-007 resolution.
- Plan: orchestration-model.md section 9; research.md ADR-005.
- Tasks: not yet generated; expected slices S4, S6.

## Validation

Port contract tests; scoped-action tests with a hostile requirement fixture; mode-label tests; one live work item processed end to end in Scenario A.
