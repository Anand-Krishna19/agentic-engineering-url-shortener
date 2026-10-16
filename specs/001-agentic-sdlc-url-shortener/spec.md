# Feature Specification: Agentic Software Engineering System: URL Shortener

**Feature Branch**: `001-agentic-sdlc-url-shortener`

**Created**: 2026-10-16

**Status**: Draft v0.2 (clarification decisions DEC-001 to DEC-005 recorded 2026-10-16; the specification as a whole is not yet approved; AMB-001 to AMB-006, AMB-009, and AMB-010 remain open)

**Input**: User description: "Build a production-grade prototype titled 'Agentic Software Engineering System: URL Shortener' that demonstrates a governed agentic execution system transforming software requirements into reviewable engineering outcomes across the complete SDLC, using a URL shortener as the demonstration domain."

## How to Read This Specification

This specification is implementation-independent. It deliberately chooses no framework, programming language, database, cloud provider, agent framework, or deployment platform.

**Requirement classification** (every requirement carries exactly one class):

| Class | Meaning |
|-------|---------|
| **Confirmed** | Stated directly in the assessment input. |
| **Derived** | Not stated verbatim, but necessary to satisfy a Confirmed requirement or the ratified constitution (v1.0.0). Source is cited. |
| **Proposed** | A validation target or scope choice with no numeric/explicit source. It is an assumption requiring human approval and MUST NOT be represented as a confirmed client requirement. Once the human candidate approves it (see Decision Record), it is labelled **Approved (demonstration goal)**; it still MUST NOT be represented as a confirmed client requirement. |

**Identifier scheme** (stable; never reused or renumbered):

| Prefix | Meaning | Prefix | Meaning |
|--------|---------|--------|---------|
| `US-n` | User journey | `NFR-nnn` | Non-functional requirement |
| `SCN-X` | Required scenario (A, B, C) | `ASM-nnn` | Assumption |
| `FR-0nn` | Functional requirement, URL shortener domain | `CON-nnn` | Constraint |
| `FR-1nn` | Functional requirement, orchestration | `AMB-nnn` | Ambiguity (open) |
| `PVT-nnn` | Validation target | `EXC-nnn` | Exclusion |
| `DEC-nnn` | Recorded human decision | `FR-133` onward | Added by a recorded decision |
| `EV-xxx` | Required evidence type | `SC-nnn` | Success criterion |

Each requirement lists `AC` (observable acceptance criteria), `NAC` (negative acceptance criteria: what MUST NOT happen), and `Evidence` (evidence types from the Evidence Catalogue). Tests, designs, tasks, and implementation will cite these IDs for bidirectional traceability.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - API Consumer Creates and Uses Short Links (Priority: P1)

An API consumer submits a long URL and receives a short link. Anyone following the short link is redirected to the original destination. The consumer can see basic redirect statistics for the link.

**Why this priority**: This is the demonstration domain and the baseline ("existing URL shortener") that Scenario B later modifies.

**Independent Test**: Create a short link for a valid URL, resolve it, confirm the destination, confirm the visit is counted.

**Acceptance Scenarios**:

1. **Given** a valid absolute URL, **When** the consumer requests a short link, **Then** a unique short code and short link are returned and the mapping persists.
2. **Given** an existing short link, **When** it is resolved before expiry, **Then** the caller is redirected to the original destination and the visit is recorded.
3. **Given** an invalid or disallowed URL, **When** the consumer requests a short link, **Then** the request is rejected with a clear, non-sensitive reason and nothing is stored.
4. **Given** an expired short link, **When** it is resolved, **Then** no redirect occurs and an expired-link outcome is returned.

---

### User Story 2 - Software Engineer Drives a Governed Workflow (Priority: P1)

A software engineer submits a requirement, starts a workflow, inspects its state, and sees staged outputs (normalized requirement, decomposition, design, implementation, tests, documentation, security findings).

**Why this priority**: The orchestration system is the central differentiator of the assessment.

**Independent Test**: Submit a requirement; confirm a workflow with an identifier exists, stages progress through defined entry and exit conditions, and the state is inspectable at any time.

**Acceptance Scenarios**:

1. **Given** a submitted requirement, **When** the engineer creates a workflow, **Then** a workflow with a unique run identifier and the evaluated policy version is created.
2. **Given** a running workflow, **When** the engineer inspects it, **Then** current state, completed stages, pending stages, blocked paths, and decision lineage are shown.
3. **Given** a stage whose entry criteria are unmet, **When** execution is attempted, **Then** the stage does not start and the reason is recorded.

---

### User Story 3 - Human Reviewer Approves, Rejects, or Clarifies (Priority: P1)

A human reviewer receives approval and clarification requests, approves or rejects them with a recorded reason, and sees the downstream effect of their decision.

**Why this priority**: Human governance is non-waivable (Constitution III).

**Independent Test**: Reach a mandatory approval gate; verify that no progress occurs without an explicit decision, including after a timeout.

**Acceptance Scenarios**:

1. **Given** a pending mandatory approval, **When** the reviewer approves, **Then** the gated path continues and the approval is audited.
2. **Given** a pending approval, **When** the reviewer rejects, **Then** the gated path does not continue, the rejection reason is recorded, and downstream impact is identified.
3. **Given** a pending approval, **When** the approval timeout elapses with no response, **Then** the workflow enters a defined non-approving state (escalate or safe-stop) and never proceeds as if approved.

---

### User Story 4 - Release Owner Obtains a Release-Readiness Outcome (Priority: P2)

A release owner requests a release-readiness determination and receives a deterministic outcome with supporting policy results, test evidence, open risks, and exceptions.

**Why this priority**: Release readiness is a required orchestration stage and a constitutional gate.

**Independent Test**: Run the determination once with all mandatory policies passing and once with an unapproved violation; the outcomes differ deterministically.

**Acceptance Scenarios**:

1. **Given** all mandatory policy checks PASS and required evidence exists, **When** readiness is determined, **Then** the outcome is READY and the evidence is cited.
2. **Given** a mandatory policy check FAIL or an unapproved exception, **When** readiness is determined, **Then** the outcome is NOT-READY and the blocking items are listed.

---

### User Story 5 - Assessment Reviewer Audits an Execution (Priority: P2)

An assessment reviewer reconstructs a complete execution from recorded evidence and verifies traceability from requirement to evidence.

**Why this priority**: Reviewers assess governance, traceability, and engineering judgment from evidence, not claims.

**Independent Test**: Pick any completed or stopped run and reconstruct its timeline, decisions, approvals, retries, and outcome without access to anything but recorded evidence.

**Acceptance Scenarios**:

1. **Given** a completed run, **When** the reviewer inspects the audit record, **Then** every state transition shows actor type, action, timestamp, affected artifact or state, result, and reason.
2. **Given** any requirement ID, **When** the reviewer follows its trace, **Then** linked scenario, decision, design, task, implementation, test, validation, documentation, and evidence are reachable, or the gap is explicitly shown.
3. **Given** evidence of any kind, **When** the reviewer inspects it, **Then** it is labelled as actual execution evidence or as illustrative/demonstration data.

---

### Required Scenarios

#### SCN-A - Greenfield

**Path**: Requirement → Decomposition → Design → Implementation → Testing → Documentation → Validation → Release Readiness.

1. **Given** a requirement that is complete, consistent, testable, and within approved policy and architecture boundaries, **When** the workflow runs, **Then** it proceeds without an artificial clarification gate.
2. **Given** that no clarification was requested, **Then** the workflow records the requirement-quality checks performed, the reason clarification was not required, the resulting decomposition, API and schema impacts, acceptance criteria, and traceable execution evidence.
3. **Given** a material ambiguity emerges later, **When** it is detected, **Then** only the affected path is suspended, governed clarification and impact analysis are invoked, and the path resumes from the correct state after explicit approval; unaffected paths continue.

#### SCN-B - Brownfield

An enhancement, refactor, or defect correction against the existing URL shortener. Per DEC-002, the existing URL shortener is the baseline established by SCN-A, so SCN-B is demonstrated after SCN-A. Example change requests named by the approver (illustrative, not yet selected): "add IP-based rate limiting" or "modify short-code length". The specific change request MUST be chosen and recorded before SCN-B starts.

1. **Given** a change request against the existing system, **When** the workflow starts, **Then** before any code change it identifies impacted components, interfaces, data flows, tests, documentation, regression risks, and rollout/rollback considerations.
2. **Given** that impact analysis is incomplete, **When** implementation is attempted, **Then** implementation does not start.
3. **Given** impact analysis shows a change to approved requirements, architecture, schemas, workflow states, security controls, or release criteria, **Then** formal change approval is required before implementation.

#### SCN-C - Ambiguous Requirement

Incomplete, unclear, or conflicting input.

1. **Given** ambiguous input, **When** ingestion and normalization run, **Then** the ambiguity is detected and recorded.
2. **Given** a detected material ambiguity, **Then** unsafe implementation on the affected path is prevented and human clarification is requested.
3. **Given** a clarification answer, **Then** the decision is recorded, downstream impact is identified, affected artifacts are updated, and the workflow resumes at the correct state.

### Edge Cases

- Two clients request short links for the same URL at the same time (concurrent and duplicate requests).
- A short link is resolved at the instant of its expiry.
- A generated short code collides with an existing code.
- The persistence layer is unavailable or slow during creation, resolution, analytics capture, or workflow-state save.
- Analytics capture fails while the redirect itself could succeed.
- A destination URL is syntactically valid but unsafe (disallowed scheme, internal/loopback target, redirect loop onto the service itself).
- An approver responds after a timeout has already triggered safe-stop.
- Upstream output changes while parallel downstream paths are mid-execution.
- Execution is interrupted between a side effect and its state record.
- A compensation action itself fails.
- A policy exception expires while a run is in progress.
- A requirement contains conflicting statements (for example, a fixed expiry and a never-expire rule).

## Requirements *(mandatory)*

### Functional Requirements: URL Shortener Domain

**URL creation**

- **FR-001** [Confirmed] The service MUST create a short link from a valid absolute URL, returning a unique short code and the corresponding short link.
  - AC: A valid URL yields a short code; resolving it reaches the original destination.
  - NAC: A creation request MUST NOT return a short code that does not resolve, nor store a partial mapping when creation fails.
  - Evidence: EV-TEST, EV-LOG
- **FR-002** [Derived: constitution V] The service MUST normalize accepted URLs by documented rules (see AMB-003) before storage and comparison.
  - AC: Equivalent inputs per the documented rules produce the same normalized destination.
  - NAC: Normalization MUST NOT alter the destination's meaning, nor silently discard a non-equivalent component.
  - Evidence: EV-TEST

**Invalid URL rejection**

- **FR-003** [Confirmed] The service MUST reject invalid URLs (malformed, empty, over the maximum length, missing host) with a clear, non-sensitive reason and store nothing.
  - AC: Each invalid class returns a rejection with a stable reason category.
  - NAC: A rejected request MUST NOT create a mapping, consume a short code, or write analytics.
  - Evidence: EV-TEST
- **FR-004** [Derived: constitution V] The service MUST accept only an allow-listed set of URL schemes and MUST reject all others, including schemes that execute content or access local resources.
  - AC: Allow-listed schemes are accepted; disallowed schemes are rejected.
  - NAC: Disallowed schemes MUST NOT be accepted, stored, or redirected to.
  - Evidence: EV-TEST
- **FR-005** [Derived: constitution V] The service MUST reject destinations that target the service itself or non-public network locations, and MUST address open-redirect and abuse scenarios by documented rules.
  - AC: Self-referencing and non-public-network destinations are rejected.
  - NAC: The service MUST NOT redirect to a target that creates a redirect loop through itself.
  - Evidence: EV-TEST, EV-ART (threat scenarios)

**Short-code uniqueness**

- **FR-006** [Confirmed] Every short code MUST be unique across all active and expired links.
  - AC: No two distinct mappings share a code, including under concurrent creation.
  - NAC: A collision MUST NOT overwrite an existing mapping or redirect to the wrong destination.
  - Evidence: EV-TEST
- **FR-007** [Confirmed] The service MUST generate short codes and MUST handle a generation collision by a bounded, documented recovery (retry with a new code, then fail safely).
  - AC: A forced collision results in a new unique code or a defined failure.
  - NAC: Collision handling MUST NOT loop unbounded or leak internal state.
  - Evidence: EV-TEST, EV-LOG

**Redirect resolution**

- **FR-008** [Confirmed] Resolving a valid, unexpired short code MUST redirect to its original destination.
  - AC: The redirect target equals the normalized stored destination.
  - NAC: Resolution MUST NOT redirect for unknown, expired, or disabled codes.
  - Evidence: EV-TEST
- **FR-009** [Confirmed] Resolving an unknown or malformed short code MUST return a not-found outcome that does not disclose whether such a code ever existed.
  - AC: Unknown and malformed codes yield the same not-found outcome.
  - NAC: The response MUST NOT reveal internal identifiers or stored data.
  - Evidence: EV-TEST

**Expiration**

- **FR-010** [Confirmed] A short link MUST support expiration; after its expiry instant it MUST NOT redirect (policy and defaults per AMB-001).
  - AC: Before expiry the link redirects; at and after expiry it returns the expired-link outcome.
  - NAC: An expired link MUST NOT redirect, MUST NOT count as a successful redirect in analytics, and MUST NOT have its code reassigned.
  - Evidence: EV-TEST
- **FR-011** [Derived] The expiry decision MUST be consistent under concurrent resolution at the expiry boundary (a single, documented comparison rule).
  - AC: Resolutions on either side of the boundary yield deterministic outcomes.
  - NAC: Two resolutions at the same instant MUST NOT receive contradictory outcomes.
  - Evidence: EV-TEST

**Analytics**

- **FR-012** [Confirmed] The service MUST capture basic redirect analytics for each successful redirect (at minimum count and time; further fields per AMB-002).
  - AC: N successful redirects result in a visit count of N.
  - NAC: Failed, expired, or unknown resolutions MUST NOT increment the successful-redirect count.
  - Evidence: EV-TEST, EV-METRIC
- **FR-013** [Derived: constitution V] Analytics MUST NOT store or log sensitive data beyond the approved fields.
  - AC: Stored analytics fields exactly match the approved field list.
  - NAC: Raw personal identifiers, full secrets, or full destination query secrets MUST NOT appear in analytics or logs.
  - Evidence: EV-TEST, EV-LOG
- **FR-014** [Derived] A failure of analytics capture MUST NOT corrupt the mapping; whether it blocks the redirect MUST follow a documented policy (see AMB-002).
  - AC: Injected analytics failure yields the documented behavior and an observable failure record.
  - NAC: An analytics failure MUST NOT silently drop the failure record.
  - Evidence: EV-TEST, EV-LOG

**Idempotency and duplicates**

- **FR-015** [Confirmed] Repeating an identical creation request MUST have a documented idempotent outcome (semantics per AMB-004).
  - AC: Repeated identical requests do not create unintended duplicate mappings.
  - NAC: A retry after a timeout MUST NOT create a second, different mapping for the same idempotent request.
  - Evidence: EV-TEST
- **FR-016** [Derived] An idempotent request replay MUST be distinguishable from a first-time creation in the response.
  - AC: A replay is identifiable as a replay.
  - NAC: A replay MUST NOT be reported as a new creation.
  - Evidence: EV-TEST

**Concurrency**

- **FR-017** [Confirmed] The service MUST behave correctly under concurrent creation and resolution requests.
  - AC: Concurrent creates yield unique codes; concurrent resolves return correct destinations; counts equal the number of successful redirects.
  - NAC: Concurrency MUST NOT cause lost analytics updates, duplicate codes, or cross-linked destinations.
  - Evidence: EV-TEST, EV-METRIC
- **FR-018** [Derived] Requests that conflict on the same resource MUST resolve deterministically (one outcome, no partial state).
  - AC: Conflicting requests produce a single consistent final state.
  - NAC: No request MUST observe a half-created mapping.
  - Evidence: EV-TEST

**Persistence failures**

- **FR-019** [Confirmed] On a persistence failure the service MUST fail safely with a classified (transient or permanent), non-sensitive error, and MUST NOT report success for an unsaved mapping.
  - AC: Injected persistence failure yields a classified failure with no success claim.
  - NAC: The service MUST NOT return a short link that was not durably stored, nor expose internal error detail.
  - Evidence: EV-TEST, EV-LOG
- **FR-020** [Derived] Transient persistence failures MUST use bounded retries with defined backoff and timeout (targets in PVT-009 and PVT-010).
  - AC: A transient failure that clears within the bound results in success; one that does not results in a defined failure.
  - NAC: Retries MUST NOT be unbounded or create duplicate mappings.
  - Evidence: EV-TEST, EV-METRIC

**Operational health and abuse controls**

- **FR-021** [Confirmed] The service MUST expose operational health distinguishing at least liveness and readiness (including dependency state).
  - AC: Healthy state reports ready; a failed dependency reports not-ready while liveness remains accurate.
  - NAC: Health output MUST NOT expose secrets, credentials, or internal topology.
  - Evidence: EV-TEST
- **FR-022** [Derived: constitution V] The service MUST apply rate limiting to creation and resolution by a documented policy (thresholds proposed in PVT-006).
  - AC: Requests above the limit receive a defined rate-limited outcome.
  - NAC: Rate limiting MUST NOT block unrelated clients or leak other clients' usage.
  - Evidence: EV-TEST

### Functional Requirements: Agentic SDLC Orchestration

**Workflow lifecycle**

- **FR-101** [Confirmed] The system MUST create a workflow from a submitted requirement, assigning a unique run identifier and recording the policy version evaluated.
  - AC: Each workflow has a unique run ID and a recorded policy version.
  - NAC: A workflow MUST NOT start without a run ID or a policy version.
  - Evidence: EV-AUDIT, EV-TEST
- **FR-102** [Confirmed] The system MUST let authorized users inspect any workflow's current state, stage statuses, blocked paths, pending approvals, artifacts, and decision lineage.
  - AC: Inspection reflects state consistent with the audit record.
  - NAC: Inspection MUST NOT modify workflow state.
  - Evidence: EV-TEST, EV-AUDIT
- **FR-103** [Confirmed] The system MUST support the stages: requirement ingestion, normalization, ambiguity detection, human clarification, task decomposition, architecture and design, implementation, testing, documentation, security and risk validation, release-readiness determination, and final engineering summary.
  - AC: Each stage is represented and reachable in the workflow model.
  - NAC: A stage MUST NOT be reported complete without its exit criteria being met.
  - Evidence: EV-TEST, EV-ART
- **FR-104** [Confirmed] Every stage MUST define inputs, outputs, entry criteria, exit criteria, ownership, and failure behavior, and the system MUST enforce entry and exit conditions.
  - AC: A stage with unmet entry criteria does not start; one with unmet exit criteria does not complete.
  - NAC: Enforcement MUST NOT be bypassable by direct state edits.
  - Evidence: EV-TEST, EV-AUDIT

**Orchestration model**

- **FR-105** [Confirmed] Stage ordering MUST be governed by explicit dependencies or an equivalent state-transition model, not a fixed linear chain.
  - AC: The dependency model is inspectable and drives execution order.
  - NAC: Execution order MUST NOT be hard-coded outside the model.
  - Evidence: EV-ART, EV-TEST
- **FR-106** [Confirmed] The system MUST execute independent activities in parallel and MUST synchronize before any dependent activity starts.
  - AC: Independent stages overlap in time; a dependent stage starts only after all its dependencies complete.
  - NAC: A dependent stage MUST NOT start with an incomplete dependency.
  - Evidence: EV-TEST, EV-AUDIT
- **FR-107** [Confirmed] The system MUST persist workflow state so that it survives interruption and is the source of truth for resumption.
  - AC: State reloaded after interruption equals the last recorded state.
  - NAC: In-memory-only state MUST NOT be the sole record of progress.
  - Evidence: EV-TEST
- **FR-108** [Confirmed] The system MUST preserve cross-stage context and decision lineage (what was decided, by whom or what, based on which inputs, affecting which artifacts).
  - AC: Any artifact's lineage is retrievable back to the originating requirement.
  - NAC: Lineage MUST NOT be overwritten or rewritten after the fact.
  - Evidence: EV-AUDIT, EV-ART
- **FR-109** [Derived: constitution II] Agent autonomy MUST be bounded: each agent role MUST have a defined permitted-action scope, and out-of-scope actions MUST be blocked and recorded.
  - AC: An out-of-scope action attempt is denied and audited.
  - NAC: An agent MUST NOT grant itself approval or widen its own scope.
  - Evidence: EV-TEST, EV-AUDIT

**Requirement understanding and ambiguity**

- **FR-110** [Confirmed] The system MUST normalize an ingested requirement into a structured, testable form and record the requirement-quality checks performed.
  - AC: A normalized requirement lists check results (complete, consistent, testable, in policy and architecture boundaries).
  - NAC: Normalization MUST NOT invent requirements absent from the input.
  - Evidence: EV-ART, EV-AUDIT
- **FR-111** [Confirmed] The system MUST detect incomplete, unclear, or conflicting requirement content and classify it (material vs non-material).
  - AC: Seeded ambiguous input is flagged with a classification and reason.
  - NAC: A material ambiguity MUST NOT be resolved silently by the system.
  - Evidence: EV-TEST, EV-AUDIT
- **FR-112** [Confirmed] A complete, consistent, testable, in-boundary requirement MUST proceed without a clarification gate, and the system MUST record why clarification was not required.
  - AC: The run records the checks and the explicit no-clarification-needed reason.
  - NAC: The system MUST NOT insert an artificial clarification gate for a clean requirement.
  - Evidence: EV-AUDIT, EV-ART
- **FR-113** [Confirmed] Material ambiguity MUST suspend only the affected path, request human clarification, record the decision, run impact analysis, update affected artifacts, and resume at the correct state.
  - AC: Unaffected paths continue; the affected path resumes at the stage that consumed the ambiguous content.
  - NAC: Implementation MUST NOT proceed on an unresolved material ambiguity on the affected path.
  - Evidence: EV-TEST, EV-AUDIT

**Human approval**

- **FR-114** [Confirmed] The system MUST enforce human approval checkpoints at mandatory gates and support approve, reject, and escalate outcomes, each with a recorded reason and actor.
  - AC: A gated path advances only on explicit approval.
  - NAC: A gate MUST NOT be skipped, and approval MUST NOT be inferred from silence or timeout.
  - Evidence: EV-AUDIT, EV-TEST
- **FR-115** [Derived: constitution III] Each gate MUST define timeout, escalation, and safe-stop behavior.
  - AC: Timeout behavior follows the gate definition (PVT-008).
  - NAC: A timeout MUST NOT be treated as approval.
  - Evidence: EV-TEST, EV-AUDIT
- **FR-116** [Derived: constitution III] A rejection MUST propagate: the gated path stops, downstream impact is identified, and the system proposes a re-plan, awaiting human decision.
  - AC: A rejection yields an impact record and a pending replan proposal.
  - NAC: A rejection MUST NOT leave the gated path in a running state.
  - Evidence: EV-AUDIT, EV-TEST

**Reliability and recovery**

- **FR-117** [Confirmed] The system MUST apply bounded retries with backoff and timeout to recoverable stage failures, and MUST classify failures as transient or permanent.
  - AC: Transient failures retry up to the bound; permanent failures do not retry.
  - NAC: Retries MUST NOT exceed the bound or repeat a non-idempotent side effect.
  - Evidence: EV-TEST, EV-METRIC, EV-AUDIT
- **FR-118** [Confirmed] The system MUST support fallback behavior when a stage or capability fails, with the fallback recorded.
  - AC: An injected failure triggers the defined fallback and is audited.
  - NAC: A fallback MUST NOT lower a mandatory policy, security, or approval requirement.
  - Evidence: EV-TEST, EV-AUDIT
- **FR-119** [Confirmed] The system MUST support rollback or compensation of completed effects, distinguishing the two, and MUST record each action and its result.
  - AC: A failure after partial effects triggers the defined rollback or compensation to a consistent state.
  - NAC: A failed compensation MUST NOT be silently ignored; it MUST escalate.
  - Evidence: EV-TEST, EV-AUDIT
- **FR-120** [Confirmed] The system MUST enter safe-stop when continuation is unsafe (for example policy FAIL, exhausted retries, failed compensation, approval timeout) and preserve a deterministic terminal state with the reason.
  - AC: Each defined unsafe condition leads to safe-stop with a recorded reason.
  - NAC: Safe-stop MUST NOT discard state or evidence.
  - Evidence: EV-TEST, EV-AUDIT
- **FR-121** [Confirmed] The system MUST resume safely after a recoverable interruption, continuing from persisted state without duplicating completed side effects.
  - AC: A run interrupted at any point resumes and reaches the same outcome as an uninterrupted run.
  - NAC: Resumption MUST NOT re-execute completed non-idempotent effects or skip unfinished work.
  - Evidence: EV-TEST, EV-AUDIT
- **FR-122** [Confirmed] The system MUST dynamically re-plan when upstream outputs change, determining affected downstream stages and invalidating or re-running only those.
  - AC: A changed upstream artifact marks dependent artifacts stale and re-plans them.
  - NAC: Re-planning MUST NOT re-run unaffected completed stages without cause.
  - Evidence: EV-TEST, EV-AUDIT
- **FR-123** [Confirmed] Governance MUST be preserved during re-planning: approvals, policy checks, and gates apply to the new plan, and previously granted approvals are not carried over where the approved content has changed.
  - AC: Changed approved content requires re-approval.
  - NAC: Re-planning MUST NOT bypass a gate or reuse an approval for materially changed content.
  - Evidence: EV-AUDIT, EV-TEST

**Policy, change control, and security**

- **FR-124** [Derived: constitution VI] The system MUST evaluate versioned policy guardrails (security, compliance, privacy, audit retention, approved dependencies, licensing, change control) and record each check as PASS, FAIL, EXCEPTION-REQUESTED, or NOT-APPLICABLE.
  - AC: Every applicable check has exactly one recorded outcome and policy version.
  - NAC: A check MUST NOT end without an outcome.
  - Evidence: EV-AUDIT, EV-TEST
- **FR-125** [Derived: constitution VI] A FAIL on a mandatory policy MUST block downstream progression until resolved or a human-approved exception exists.
  - AC: Downstream stages do not start while a mandatory FAIL is unresolved.
  - NAC: An exception MUST NOT be approved by an agent, and MUST NOT lack any required field (policy, reason, scope, approver, compensating control, timestamp, expiry or review condition).
  - Evidence: EV-AUDIT, EV-TEST
- **FR-126** [Derived: constitution VI] Changes to approved requirements, architecture, schemas, workflow states, security controls, or release criteria MUST pass formal impact analysis and change approval.
  - AC: Such a change has an impact record and an approval before taking effect.
  - NAC: These changes MUST NOT take effect on agent authority alone.
  - Evidence: EV-ART, EV-AUDIT
- **FR-127** [Confirmed] The system MUST perform a security and risk validation stage including dependency scanning, secret scanning, and threat-scenario review, with findings recorded.
  - AC: The stage produces findings or an explicit clean result with the scan evidence.
  - NAC: The stage MUST NOT be marked complete without running the scans.
  - Evidence: EV-TEST, EV-ART

**Delivery outcomes**

- **FR-128** [Confirmed] The system MUST determine release readiness as a deterministic outcome (READY or NOT-READY) citing policy results, test evidence, residual risks, exceptions, and approvals.
  - AC: The same inputs always give the same outcome and the same cited evidence.
  - NAC: READY MUST NOT be issued with a mandatory FAIL, an unapproved or expired exception, missing required evidence, or a missing release-owner approval.
  - Evidence: EV-AUDIT, EV-TEST
- **FR-129** [Confirmed] The system MUST produce a final engineering summary describing what was built, decisions, deviations, test and validation results, residual risks, and links to evidence.
  - AC: The summary's claims each link to recorded evidence.
  - NAC: The summary MUST NOT state results without recorded evidence, nor present demonstration data as production measurements.
  - Evidence: EV-ART
- **FR-130** [Confirmed] The system MUST record audit-grade execution evidence: each state transition, decision, approval, retry, failure, re-plan, and terminal outcome with actor type, action, timestamp, affected artifact or state, result, and reason.
  - AC: A run can be reconstructed from the audit record alone.
  - NAC: Audit records MUST NOT be editable or deletable by workflow actors, nor omit any required field.
  - Evidence: EV-AUDIT
- **FR-131** [Confirmed] The system MUST expose reliability and orchestration measurements (stage durations, retries, failures, fallbacks, compensations, safe-stops, approval wait times, resumptions).
  - AC: Each listed measurement is retrievable per run.
  - NAC: Measurements MUST NOT be fabricated; demonstration figures MUST be labelled as such.
  - Evidence: EV-METRIC
- **FR-133** [Derived: DEC-001] The orchestration system MUST coordinate and gate AI-assisted implementation: AI-generated code and tests MUST pass through human review and validation gates before being considered complete or merged, and the system MUST NOT autonomously deploy or finalize code without those human checkpoints.
  - AC: Each generated code or test artifact has a recorded human review decision and executed validation before its status becomes complete or merge-eligible.
  - NAC: Generated artifacts MUST NOT be marked complete or merged, and nothing MUST be deployed or finalized, without a recorded human review decision; absence of review MUST NOT count as approval.
  - Evidence: EV-APPROVAL, EV-TEST, EV-AUDIT
- **FR-132** [Derived: constitution X] The system MUST maintain bidirectional traceability linking requirement, scenario, decision, design, task, implementation, test, validation, documentation, and evidence, and MUST show gaps explicitly.
  - AC: Traversal works in both directions from any linked item.
  - NAC: A gap MUST NOT be hidden or reported as complete.
  - Evidence: EV-ART, EV-AUDIT

### Key Entities

- **Short Link**: a mapping from a unique short code to a normalized destination URL, with creation time, expiry, and status (active, expired).
- **Redirect Event**: one successful resolution of a Short Link, with time and approved analytics fields.
- **Creation Request**: a submitted URL plus idempotency information (per AMB-004).
- **Requirement**: a submitted statement of need with ID, normalized form, quality-check results, and ambiguity classification.
- **Workflow Run**: one orchestration execution with run ID, policy version, overall state, and terminal outcome.
- **Stage**: a unit of work with inputs, outputs, entry and exit criteria, owner, failure behavior, and status.
- **Dependency Graph / State Model**: the explicit relation governing stage order, parallelism, and synchronization.
- **Artifact**: any stage output (decomposition, design, code change, test result, document, report) with provenance and staleness status.
- **Decision**: a recorded choice with actor, rationale, inputs, and affected artifacts (decision lineage).
- **Approval Gate / Approval Record**: a mandatory checkpoint and its decision (approve, reject, escalate, timeout) with actor and reason.
- **Clarification Request**: a question raised on a material ambiguity and its recorded answer.
- **Policy / Policy Check / Policy Exception**: versioned guardrail, its outcome per run, and the human-approved exception record.
- **Audit Record**: an immutable evidence entry with actor type, action, timestamp, affected item, result, reason.
- **Impact Analysis**: the identified effects of a change on components, interfaces, data flows, tests, documentation, regression risk, and rollout/rollback.
- **Readiness Determination**: the READY / NOT-READY outcome with its cited basis.
- **Measurement**: a recorded reliability or orchestration metric, labelled actual or demonstration.

## Non-Functional Requirements *(mandatory)*

Numeric targets are approved demonstration goals (see Validation Targets and DEC-003), not client requirements, because the assignment gives none. Each NFR is verifiable by the cited evidence.

- **NFR-001 Security** [Derived: constitution V] External input MUST be validated; secrets MUST NOT appear in logs, artifacts, or evidence; defaults MUST be secure; authentication assumptions, rate limiting, and threat scenarios MUST be documented. NAC: no secret in any repository artifact, log, or audit record. Evidence: EV-TEST, EV-ART.
- **NFR-002 Reliability** [Confirmed: reliability controls] Failures MUST be classified, retried within bounds, and end in a deterministic terminal state (PVT-009, PVT-010, PVT-011). NAC: no silent failure and no unbounded retry. Evidence: EV-TEST, EV-METRIC.
- **NFR-003 Scalability** [Derived] The service MUST sustain the proposed reference load (PVT-004, PVT-005) without incorrect results. NAC: overload MUST NOT corrupt data; it degrades by defined rate-limit behavior. Evidence: EV-METRIC (labelled demonstration unless measured in a production-like environment).
- **NFR-004 Maintainability** [Derived: constitution VII] Concerns (domain, delivery, persistence, orchestration, policy, telemetry, infrastructure) MUST be separable and independently testable behind explicit interfaces. NAC: no concern may depend on another's internals. Evidence: EV-ART, EV-TEST.
- **NFR-005 Observability** [Confirmed: operational health; Derived: constitution IX] Each run and request MUST carry a correlation or run identifier across logs, metrics, and workflow history. NAC: no orphaned, uncorrelated records. Evidence: EV-LOG, EV-METRIC.
- **NFR-006 Auditability** [Confirmed] Audit evidence MUST allow full reconstruction of an execution (FR-130). NAC: audit data is append-only to workflow actors. Evidence: EV-AUDIT.
- **NFR-007 Performance** [Derived] Redirect, creation, health, and workflow-inspection latency MUST meet the proposed targets (PVT-001 to PVT-003). NAC: observability or analytics MUST NOT push redirect latency beyond target. Evidence: EV-METRIC.
- **NFR-008 Recoverability** [Confirmed] Interrupted runs MUST resume from persisted state within the proposed bound (PVT-011) with no duplicated effects. NAC: no lost approval, decision, or audit record on recovery. Evidence: EV-TEST, EV-AUDIT.
- **NFR-009 Testability** [Derived: constitution IV] Every requirement MUST have at least one executable verification; domain and orchestration behavior MUST be developed test-first where practical (PVT-012). NAC: no task counts as complete without executed validation. Evidence: EV-TEST.
- **NFR-010 Change safety** [Confirmed: brownfield; Derived: constitution VI] Changes MUST be preceded by impact analysis and be reversible or compensable; regressions MUST be detectable by the existing test suite. NAC: no change without recorded impact analysis. Evidence: EV-ART, EV-TEST.
- **NFR-011 Controlled autonomy** [Confirmed] Agent actions MUST be bounded by scope, observable, auditable, and interruptible; high-impact actions MUST require human approval. NAC: no agent action outside its scope, and no self-approval. Evidence: EV-AUDIT, EV-TEST.

### Validation Targets (Approved demonstration goals)

**Status**: PVT-001 to PVT-015 approved by the human candidate on 2026-10-16 (DEC-003) as the demonstration goals for this prototype.

These are **not** confirmed client requirements. Any change to a target is a change to an approved item and MUST pass impact analysis and change approval (Constitution VI).

| ID | Target (approved) | Related |
|----|-----------------|---------|
| PVT-001 | Redirect resolution p95 latency ≤ 100 ms at reference load | NFR-007 |
| PVT-002 | Short-link creation p95 latency ≤ 300 ms at reference load | NFR-007 |
| PVT-003 | Health and workflow-inspection p95 latency ≤ 500 ms | NFR-007 |
| PVT-004 | Sustain 100 redirects/second with zero incorrect redirects | NFR-003 |
| PVT-005 | Sustain 10 creations/second with zero duplicate codes | NFR-003 |
| PVT-006 | Rate limit proposal: 60 creations/minute and 600 resolutions/minute per client | FR-022 |
| PVT-007 | Short codes ≥ 7 characters; collision recovery ≤ 3 attempts | FR-007 |
| PVT-008 | Approval timeout 24 h, then escalate; second timeout 24 h, then safe-stop | FR-115 |
| PVT-009 | Max 3 retries per recoverable failure | FR-020, FR-117 |
| PVT-010 | Backoff exponential from 1 s, per-attempt timeout 10 s | FR-020, FR-117 |
| PVT-011 | Resume after interruption within 60 s with 0 duplicated side effects | FR-121 |
| PVT-012 | ≥ 90 % statement coverage on domain and orchestration logic; 100 % of FRs have ≥ 1 executed test | NFR-009 |
| PVT-013 | 100 % of state transitions have a complete audit record | FR-130 |
| PVT-014 | 0 high/critical unresolved findings from dependency and secret scans at release readiness | FR-127 |
| PVT-015 | Analytics visit count equals successful redirects exactly in the concurrency test | FR-017 |

### Evidence Catalogue

| ID | Evidence type | Rule |
|----|---------------|------|
| EV-TEST | Executed test result (name, time, outcome, environment) | MUST come from an actual run. |
| EV-LOG | Structured log excerpt tied to a run or correlation ID | MUST be from actual execution. |
| EV-METRIC | Measured metric with method and environment | MUST be labelled **actual** or **demonstration**. |
| EV-AUDIT | Audit record(s) per FR-130 | MUST be immutable to workflow actors. |
| EV-ART | Reviewable artifact (document, model, report, scan output) | MUST carry provenance. |
| EV-APPROVAL | Recorded human decision | MUST be recorded from a human actor; never inferred. |

Illustrative evidence MUST be labelled as such and MUST NOT be presented as execution evidence.

## Constraints, Exclusions, Ambiguities

### Constraints

- **CON-001** [Confirmed] No framework, programming language, database, cloud, agent framework, or deployment platform is chosen in this specification; technology selection requires human approval at the plan stage.
- **CON-002** [Confirmed] SpecKit is the sole lifecycle methodology; no competing planning, task, memory, or execution methodology is used.
- **CON-003** [Confirmed] The ratified constitution v1.0.0 governs; its non-waivable principles (III, X fabrication ban, VI blocking rule, XI) apply.
- **CON-004** [Confirmed] No implementation begins before approved specification, plan, tasks, and analysis.
- **CON-005** [Confirmed] A linear sequence of agents is insufficient evidence of orchestration (see FR-105, FR-106).

### Exclusions (Approved 2026-10-16, DEC-004)

The prototype is API/CLI-based. This statement records the approver's scope; it adds no requirement.

- **EXC-001** A graphical user interface for end users or reviewers.
- **EXC-002** Actual deployment to a production environment (release readiness is determined, not released).
- **EXC-003** Multi-tenant billing, user account management, or custom domains.
- **EXC-004** Rich analytics (geolocation, device profiling, real-time dashboards, exports).
- **EXC-005** Link editing and deletion by consumers (see AMB-005).
- **EXC-006** Distributed multi-region operation and disaster recovery beyond the recoverability targets.

### Ambiguities (AMB-007 and AMB-008 resolved; the other eight remain open)

Open items list a working interpretation used only so the spec is testable. It is **not** a decision. Open: AMB-001 to AMB-006, AMB-009, AMB-010.

- **AMB-001 Expiration policy.** Is expiry optional or mandatory? Is there a default lifetime? Can consumers set it? What is returned after expiry? *Working interpretation: optional consumer-supplied expiry with a configurable default; expired links return a distinct expired outcome.* Affects FR-010, FR-011.
- **AMB-002 Analytics scope.** Which fields beyond count and time (referrer, client category) are in scope given privacy? Retention period? Does analytics failure block the redirect? *Working interpretation: count and timestamp only; capture failure does not block the redirect and is recorded.* Affects FR-012 to FR-014.
- **AMB-003 URL normalization and limits.** Which normalizations (case, trailing slash, default ports, fragments, tracking parameters) and what maximum length? Allow-listed schemes? *Working interpretation: standard syntactic normalization only; web schemes only; maximum length proposed at implementation-independent 2048 characters.* Affects FR-002 to FR-005.
- **AMB-004 Idempotency semantics.** Does the same URL always yield the same code, or is idempotency keyed by a client-supplied request token? *Working interpretation: client-supplied request token; same URL without a token may create separate links.* Affects FR-015, FR-016.
- **AMB-005 Link management and access.** Are authentication, ownership, custom aliases, disabling, or deletion in scope? *Working interpretation: anonymous creation with documented rate limiting; no custom aliases, editing, or deletion.* Affects FR-022, EXC-005, NFR-001.
- **AMB-006 Redirect permanence.** Permanent or temporary redirect semantics, given caching versus analytics accuracy. *Working interpretation: temporary, so that every visit is observable.* Affects FR-008, FR-012.
- **AMB-007 Meaning of "controlled implementation".** **RESOLVED by DEC-001 (2026-10-16).** The orchestration system coordinates and gates AI-assisted implementation; see DEC-001 and FR-133. Affected: FR-103, FR-109, FR-114, SCN-A.
- **AMB-008 Brownfield baseline.** **RESOLVED by DEC-002 (2026-10-16).** The output of SCN-A is the baseline for SCN-B; see DEC-002. Affected: SCN-B.
- **AMB-009 Approver model.** Who may approve, how identity is established, and whether there are distinct roles (reviewer, release owner). *Working interpretation: a single human candidate holds all approval authority, with roles recorded separately.* Affects FR-114, FR-125, FR-128.
- **AMB-010 Reference environment for performance claims.** What environment makes PVT figures meaningful? *Working interpretation: a single-node demonstration environment; results labelled demonstration.* Affects NFR-003, NFR-007.

## Assumptions

- **ASM-001** The URL shortener is a production-oriented prototype; production deployment is excluded (EXC-002).
- **ASM-002** All PVT-nnn values are approved demonstration goals (DEC-003) and are not client requirements.
- **ASM-003** A single human candidate acts as requirement owner, approver, and release owner, with roles recorded distinctly (AMB-009).
- **ASM-004** The working interpretations in AMB-001 to AMB-006, AMB-009, and AMB-010 apply only until resolved by clarification.
- **ASM-005** Agents may be AI-model-driven or deterministic; the specification constrains their behavior and evidence, not their construction.
- **ASM-006** Reviewers verify from repository artifacts and recorded evidence, not from live access.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reviewer can create a short link for a valid URL and reach the original destination in one pass, and 100 % of invalid or disallowed URL classes in the test set are rejected with nothing stored.
- **SC-002**: In the concurrency demonstration, 0 duplicate short codes and a redirect count equal to the successful-redirect count (PVT-015).
- **SC-003**: All three required scenarios (SCN-A, SCN-B, SCN-C) complete or safe-stop in a demonstration run, each with a reconstructible audit record.
- **SC-004**: For SCN-A with a clean requirement, 0 clarification gates are raised and the reason is recorded; for SCN-C, 0 implementation steps execute on the affected path before clarification.
- **SC-005**: Every mandatory approval gate in a demonstration run has a recorded human decision; 0 gates are passed by timeout or silence.
- **SC-006**: Injected-failure demonstrations show retry, fallback, compensation, safe-stop, and resumption, each with recorded evidence and a deterministic terminal state.
- **SC-007**: An upstream change in a demonstration run re-plans only the affected downstream stages and requires re-approval of changed approved content.
- **SC-008**: Release readiness yields READY only when 0 mandatory policy FAILs and 0 unapproved or expired exceptions exist, and NOT-READY otherwise, identically on repeated determination.
- **SC-009**: 100 % of requirements in this specification trace to at least one scenario or user journey, and 100 % of completed tasks trace to executed test evidence; gaps are listed, not hidden.
- **SC-010**: All performance and scalability claims are labelled actual or demonstration, and 0 approved demonstration goals (PVT-nnn) are presented as confirmed client requirements.

## Decision Record

Human decisions recorded in this specification. Approver: the human candidate (ASM-003). Date: 2026-10-16; no time of day was supplied, so none is recorded. Source: the candidate's written decisions in this session.

| ID | Decision | Resolves / approves | Downstream impact identified |
|----|----------|---------------------|------------------------------|
| DEC-001 | The orchestration system coordinates and gates AI-assisted implementation. The AI generates code and tests; all generated artifacts MUST pass human review and validation gates before being considered complete or merged. The system does not autonomously deploy or finalize code without human checkpoints. | AMB-007 | Added FR-133. Constrains FR-103 (implementation stage), FR-109 (bounded autonomy), FR-114 (gates), SCN-A. Plan must define the review and validation gates for generated artifacts. |
| DEC-002 | Approved working interpretation: SCN-A (Greenfield) establishes the baseline URL shortener; SCN-B (Brownfield) then introduces a specific change request (examples: "add IP-based rate limiting", "modify short-code length") against that baseline. | AMB-008 | SCN-B depends on SCN-A output. The specific SCN-B change request is not yet chosen. "Add IP-based rate limiting" would interact with FR-022 and PVT-006 and AMB-005; "modify short-code length" would interact with FR-007 and PVT-007. |
| DEC-003 | Approved all 15 validation targets as demonstration goals. | PVT-001 to PVT-015 | Targets are demonstration goals, not client requirements (ASM-002, SC-010). Revisions require impact analysis and change approval. |
| DEC-004 | Approved all 6 exclusions. Scope is an API/CLI-based prototype without a graphical UI, production deployment, multi-tenant billing, or rich analytics, sized for a 2-3 day assessment. | EXC-001 to EXC-006 | No requirement added. Plan must not introduce excluded capabilities. The 2-3 day timebox is recorded as context. |
| DEC-005 | Acknowledged: "Confirmed" means stated in the initial `/speckit-specify` input. | Source-of-Confirmed question | Class table and checklist note stand as written. |

## Traceability Seed

Downstream columns are intentionally empty; they are populated by later lifecycle stages from real artifacts and MUST NOT be pre-filled.

| Requirement group | Journeys / scenarios | Design | Tasks | Tests | Evidence |
|-------------------|----------------------|--------|-------|-------|----------|
| FR-001 to FR-005 (creation, validation) | US-1, SCN-A | pending | pending | pending | pending |
| FR-006 to FR-011 (codes, redirect, expiry) | US-1, SCN-A, SCN-B | pending | pending | pending | pending |
| FR-012 to FR-014 (analytics) | US-1, SCN-B | pending | pending | pending | pending |
| FR-015 to FR-020 (idempotency, concurrency, persistence) | US-1, SCN-A | pending | pending | pending | pending |
| FR-021, FR-022 (health, abuse controls) | US-1, US-4 | pending | pending | pending | pending |
| FR-101 to FR-109 (lifecycle, model, autonomy) | US-2, SCN-A | pending | pending | pending | pending |
| FR-110 to FR-113 (requirement understanding) | US-2, US-3, SCN-A, SCN-C | pending | pending | pending | pending |
| FR-114 to FR-116 (approvals) | US-3, SCN-A, SCN-C | pending | pending | pending | pending |
| FR-117 to FR-123 (recovery, replanning) | US-2, US-3, SCN-A, SCN-B, SCN-C | pending | pending | pending | pending |
| FR-124 to FR-127 (policy, change control, security) | US-3, US-4, SCN-B | pending | pending | pending | pending |
| FR-128, FR-129 (readiness, summary) | US-4, US-5, SCN-A | pending | pending | pending | pending |
| FR-130 to FR-132 (audit, metrics, traceability) | US-5 | pending | pending | pending | pending |
| FR-133 (gated AI-assisted implementation; DEC-001) | US-2, US-3, SCN-A, SCN-B | pending | pending | pending | pending |
