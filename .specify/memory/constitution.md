# Agentic Software Engineering System: URL Shortener Constitution

This constitution governs a production-grade engineering assessment submission. The URL
shortener is the demonstration domain. The central differentiator is a governed, stateful,
non-linear agentic software engineering orchestration system that transforms requirements
into reviewable engineering outcomes across the software development lifecycle.

Reviewers assess working behavior, architecture, engineering decisions, AI-assisted
development process, task decomposition, testing discipline, governance, traceability,
change history, documentation, and engineering judgment.

## Core Principles

### I. Specification Before Implementation

- Production implementation MUST NOT begin without an approved specification.
- Requirements MUST be testable and traceable.
- Functional and non-functional requirements MUST remain distinguishable.
- Ambiguities MUST be resolved or recorded as explicit assumptions.
- Material upstream changes MUST trigger downstream impact analysis.
- Existing code MUST NOT become an undocumented substitute for the specification.

### II. Explicit Agentic Orchestration

- The orchestration system MUST be more than sequential agent chaining.
- It MUST use an explicit dependency graph or equivalent stateful model.
- It MUST support sequential paths, parallel paths, synchronization, branching, dynamic
  replanning, interruption, and resumption.
- Every stage MUST define inputs, outputs, entry criteria, exit criteria, ownership, and
  failure behavior.
- Workflow state, cross-stage context, artifact provenance, and decision lineage MUST be
  preserved.
- Agent autonomy MUST be bounded, observable, and auditable.

### III. Human Governance

- Humans retain ownership of requirements, architecture, security-sensitive decisions,
  material exceptions, destructive changes, release readiness, and final quality.
- High-impact actions MUST require explicit human approval.
- Approval, rejection, escalation, timeout, and safe-stop behavior MUST be defined.
- Mandatory approval gates MUST NOT be silently skipped.
- Lack of response MUST NOT be interpreted as approval.

### IV. Test-Driven Engineering

- Red-green-refactor TDD MUST be applied to domain and orchestration behavior wherever
  technically practical.
- An initially failing test MUST be written before the corresponding implementation.
- The test MUST be verified to fail for the expected reason.
- Only the minimum behavior needed to pass MUST be implemented.
- Refactoring MUST occur only while tests remain green.
- The test suite MUST include unit, integration, API contract, orchestration transition,
  reliability, security, and end-to-end tests.
- Task completion MUST require executed validation, not merely generated code.

### V. Security and Privacy by Design

- External input MUST be validated and normalized.
- Acceptable URL schemes MUST be restricted.
- Malicious redirect and abuse scenarios MUST be addressed.
- Secrets and sensitive information MUST NOT be exposed in logs.
- Secure configuration defaults MUST be applied.
- Least privilege and explicit trust boundaries MUST be used.
- Authentication assumptions, rate limiting, threat scenarios, and security trade-offs
  MUST be documented.
- Dependency scanning and secret scanning MUST be included in release readiness.

### VI. Compliance and Change-Control Policy Enforcement

- Versioned policy guardrails MUST be defined covering security, compliance, privacy, audit
  retention, approved dependencies, software licensing, and change control.
- Every orchestration run MUST identify the policy version evaluated.
- Every applicable policy check MUST produce exactly one outcome: PASS, FAIL,
  EXCEPTION-REQUESTED, or NOT-APPLICABLE.
- A failed mandatory policy check MUST block downstream workflow progression.
- A policy exception MUST require explicit human approval and MUST record: applicable
  policy, reason, scope, approving authority, compensating control, approval timestamp, and
  expiry or review condition.
- Changes to approved requirements, architecture, schemas, workflow states, security
  controls, or release criteria MUST pass through formal impact analysis and change
  approval.
- Release readiness MUST fail if a mandatory compliance or change-control policy remains
  violated or has an unapproved exception.
- Policy outcomes and exceptions MUST be included in audit and traceability evidence.

### VII. Architecture and Maintainability

- Domain logic, API delivery, persistence, orchestration, policy enforcement, telemetry, and
  infrastructure concerns MUST be separated.
- Explicit interfaces MUST be preferred for external dependencies.
- Material architectural decisions and rejected alternatives MUST be recorded.
- Complexity that cannot be justified by requirements or demonstrability MUST be avoided.
- Code MUST be modular, readable, testable, and replaceable.

### VIII. Reliability and Recovery

- Transient and permanent failures MUST be classified.
- Bounded retries MUST be used where appropriate, with defined backoff and timeout behavior.
- Repeatable operations MUST be idempotent.
- Fallback behavior MUST be defined.
- Rollback and compensation MUST be distinguished.
- Safe-stop conditions MUST be defined.
- Deterministic terminal outcomes MUST be preserved.
- Controlled resumption after interruption MUST be supported.
- Evidence of success, failure, retry, compensation, recovery, and latency MUST be captured.

### IX. Observability and Auditability

- Each orchestration execution MUST be assigned a correlation or run identifier.
- State transitions, decisions, approvals, retries, failures, replanning events, and
  terminal outcomes MUST be recorded.
- Audit evidence MUST include actor type, action, timestamp, affected artifact or state,
  result, and reason.
- Logs, metrics, traces, and workflow history MUST support reconstruction of an execution.
- Demonstration metrics MUST be clearly distinguished from production measurements.

### X. Traceability and Repository Integrity

- Traceability MUST be maintained across requirement, scenario, decision, design, task,
  implementation, test, validation, documentation, and evidence.
- Commits MUST be small and logically coherent; messages MUST describe engineering intent.
- Approval, test, execution, and operational evidence MUST NOT be fabricated.
- AI-generated artifacts MUST receive human review and ownership.
- Documentation MUST evolve with implementation.

### XI. Evidence-Based Completion

A feature or task is complete only when all of the following hold:

1. Applicable requirements are identified.
2. Decisions and assumptions are recorded.
3. Acceptance criteria are satisfied.
4. Required tests have been executed successfully.
5. Security and reliability checks are complete.
6. Documentation is current.
7. Traceability is complete.
8. Residual risks and limitations are disclosed.
9. Required approval is recorded.
10. Evidence is available for reviewer verification.

## Governance Requirements

### Compliance Assessment During Planning

- `/speckit-plan` MUST include a Constitution Check mapping the plan to each principle I-XI
  with a status of PASS, FAIL, EXCEPTION-REQUESTED, or NOT-APPLICABLE and a short
  justification.
- A FAIL blocks progression to tasks until resolved or an exception is approved.
- The Constitution Check MUST be repeated after design artifacts are produced, and
  `/speckit-analyze` MUST treat constitution conflicts as CRITICAL findings.

### Exceptions

- Any team member or agent MAY propose an exception; only the human candidate MAY approve.
- Proposals MUST record the fields required by Principle VI and the affected principle.
- Approved exceptions MUST be stored as versioned artifacts, referenced from the plan, and
  included in audit and traceability evidence.
- Expired exceptions are treated as unapproved.

### Non-Waivable Principles

The following MUST NOT be waived by any exception:

- Principle III (Human Governance), including no approval by silence.
- Principle X prohibition on fabricating approval, test, execution, or operational evidence.
- Principle VI rule that a failed mandatory policy check blocks progression and that
  exceptions require explicit human approval.
- Principle XI (Evidence-Based Completion).

All other principles MAY be waived only through an approved exception.

### Amendments and Versioning

- Amendments MUST be proposed in writing with rationale, impact analysis on existing
  artifacts, and a migration plan, and MUST be approved by the human candidate.
- The constitution uses semantic versioning:
  - MAJOR: backward-incompatible removal or redefinition of a principle or governance rule.
  - MINOR: a new principle or section, or materially expanded guidance.
  - PATCH: clarification, wording, or typo fixes with no semantic change.
- Each amendment MUST update the version line and Last Amended date.
- Constitution changes MUST be committed separately from implementation changes.

### Conflict Resolution

- Conflicts between this constitution and any plan, task, or implementation are resolved in
  favor of this constitution, subject to the authority hierarchy: official assessment
  requirements, then this constitution, then approved specification and clarifications, then
  plan and contracts, then ADRs, then tasks, then implementation.
- Where two principles conflict, the more restrictive requirement applies; if still
  ambiguous, work MUST stop and the conflict MUST be escalated to the human candidate and
  recorded as a decision.

### Release Blocking

- Release readiness MUST fail when any principle is violated without an approved,
  unexpired exception, when any non-waivable principle is violated, or when any Principle XI
  criterion is unmet.
- Release readiness MUST be declared only by the human candidate, based on reviewable
  evidence.

**Version**: 1.0.0 | **Ratified**: 2026-10-16 | **Last Amended**: 2026-10-16
