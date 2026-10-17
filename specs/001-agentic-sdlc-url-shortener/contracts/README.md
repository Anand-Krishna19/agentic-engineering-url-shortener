# Contracts, Schemas, Compatibility, and Change Control

**Feature**: `001-agentic-sdlc-url-shortener` | **Spec**: [../spec.md](../spec.md) v1.13 | **Plan**: [../plan.md](../plan.md)

These are the explicit, versioned API and schema deliverables. They are authored before any implementation (Constitution I) and are the canonical source; code and tests conform to them, not the reverse (ADR-009).

## 1. Deliverables

| File | Kind | Version | Owner | Serves |
|------|------|---------|-------|--------|
| [shortener.openapi.yaml](shortener.openapi.yaml) | OpenAPI 3.1 API contract (application plane) | 1.0.0 | Application plane | FR-001 to FR-023 |
| [control-plane.openapi.yaml](control-plane.openapi.yaml) | OpenAPI 3.1 API contract (control plane) | 1.0.0 | Control plane | FR-101 to FR-133 |
| [schemas/problem.schema.json](schemas/problem.schema.json) | Error schema (control plane); the shortener's `Problem` schema is inside its OpenAPI | 1.0.0 | Control plane | FR-019, NFR-001 |
| [schemas/workflow-state.schema.json](schemas/workflow-state.schema.json) | Workflow-state schema | 1.0.0 | Control plane | FR-102, FR-104 to FR-107 |
| [schemas/approval.schema.json](schemas/approval.schema.json) | Approval record and decision request | 1.0.0 | Control plane | FR-114 to FR-116, FR-123 |
| [schemas/audit-event.schema.json](schemas/audit-event.schema.json) | Audit-event schema | 1.0.0 | Control plane | FR-130, NFR-006 |
| [schemas/policy-evaluation.schema.json](schemas/policy-evaluation.schema.json) | Policy-evaluation schema | 1.0.0 | Control plane | FR-124, FR-125 |
| [schemas/policy-catalogue.schema.json](schemas/policy-catalogue.schema.json) and [policy-catalogue.v1.0.draft.json](policy-catalogue.v1.0.draft.json) | Policy catalogue schema and the draft catalogue | schema 1.0.0, catalogue v1.0 (draft) | Control plane | FR-101, FR-124, DEC-048 |
| [schemas/failure-event.schema.json](schemas/failure-event.schema.json) | Failure and recovery event (MTTR source) | 1.0.0 | Control plane | FR-117 to FR-121, FR-131 |
| [schemas/measurement-report.schema.json](schemas/measurement-report.schema.json) | Measurement report | 1.0.0 | Control plane | FR-131, NFR-005 |
| [schemas/change-record.schema.json](schemas/change-record.schema.json) | API or schema change record | 1.0.0 | Control plane | FR-126, Constitution VI |
| Persistence schemas | See [../data-model.md](../data-model.md) sections 2 and 3 (tables) | v1.0 (migration 0001 per plane) | Each plane | FR-006 to FR-020, FR-107 |
| [examples/](examples/) | Representative examples, each named `*.illustrative.json` | n/a | Control plane | Reviewer aid |

**Examples are illustrative.** Their values are invented to show shape. They are not execution evidence and MUST NOT be cited as such (Constitution X).

## 2. Versioning Rules

Every contract carries a semantic version (`MAJOR.MINOR.PATCH`). The application API additionally carries the major version in the path (`/v1`); a new major version is a new path prefix served alongside the old one until consumers migrate.

| Change | Version impact | Examples |
|--------|----------------|----------|
| Removing or renaming a path, field, header, enum value, or reason code; making a request field required; tightening validation of previously accepted input (shorter maximum length, fewer allowed schemes); changing a status code or the meaning of a reason code; changing redirect semantics; changing the idempotency-signature canonicalization; changing the code alphabet or length that a client may rely on; adding authentication where none existed; changing a persisted field's meaning | **MAJOR** | Making `url` stricter than 2048 characters; changing 302 to 301 |
| Adding an optional request field whose absence preserves behavior; adding a response field; adding an endpoint; adding an optional header; adding a response `reason` value | **MINOR** | CR-001: optional `metadata` on create (see `examples/change-record.illustrative.json`) |
| Documentation, description, or example fixes with no behavior change | **PATCH** | Clarifying text |

Rules that make MINOR changes safe: consumers MUST ignore unknown response fields and MUST handle an unknown `reason` as the generic failure for its HTTP status. This is stated in the API description and tested with a consumer-tolerance test.

Special rules:

- **Idempotency signature.** Because keys are retained 24 hours, any change to canonicalization breaks in-flight keys, so it is MAJOR. CR-001 is designed to avoid this: absent metadata and an empty map both canonicalize to `{}`, so v1.0 signatures remain valid under v1.1 (DEC-025).
- **Persistence.** Migrations are numbered and applied once per plane. Use expand then contract: add nullable columns or tables first; never drop or rename a column in the same release. A destructive migration needs a G-DESTR approval. Every migration has a tested down step or a documented compensation (rollback versus compensation per ASM-014). Applied migrations are checksummed.
- **Audit-event schema.** Adding an optional field or an `action` value is MINOR. Changing the hash computation is MAJOR and requires a chain-version field so old chains stay verifiable.
- **Policy catalogue.** Adding a policy is MINOR. Changing a policy's `severity` or `exception_allowed`, or removing a policy, is MAJOR. Every run records the catalogue version it evaluated (FR-101); a catalogue change is a change request under G-CHG.

## 3. Change Control (every API or schema change)

Each change produces a record conforming to [schemas/change-record.schema.json](schemas/change-record.schema.json) that identifies:

| Field | Meaning |
|-------|---------|
| `owner` | The owning plane or component |
| `from_version` and `to_version`, `version_impact` | Version impact per section 2 |
| `backward_compatibility` | Whether compatible, the list of breaking changes, and notes |
| `affected_consumers` | Who or what consumes the contract (API consumers, tests, the other plane, evidence tooling) |
| `tests` | Tests added or revalidated (minimum one) |
| `documentation` | Documents updated (minimum one) |
| `rollout_or_migration` | Steps, migration script, and rollback or compensation |
| `required_approval` | Gate (G-CHG, plus G-ARCH or G-SEC when relevant) and status |
| `impact_analysis_ref` | Link to the impact analysis artifact |

Process, enforced by the workflow (see [../compliance-and-change-control.md](../compliance-and-change-control.md)):

1. Raise a change request and its change record.
2. Impact analysis identifies components, interfaces, data flows, tests, documentation, regression risks, and rollout or rollback (SCN-B requirement; FR-126).
3. Automated compatibility check classifies the change; a mismatch between declared and computed impact blocks the change.
4. Human approval at G-CHG (and G-ARCH or G-SEC as relevant). No agent may approve (DEC-037).
5. Implement test-first. Revalidate contract, regression, and security tests.
6. Migrate or roll out with the recorded rollback or compensation.
7. Update documentation and traceability; record evidence.

## 4. Executable Contract Validation

Planned as part of the test suite (slice 2 onward). Each check is automated and fails the build.

| ID | Check | How |
|----|-------|-----|
| CV-01 | Both OpenAPI documents are valid OpenAPI 3.1 | `@apidevtools/swagger-parser` in a Vitest test |
| CV-02 | Every schema compiles as a JSON Schema 2020-12 document in Ajv strict mode | Ajv 2020 in a Vitest test |
| CV-03 | Every example validates against its schema | Parameterized test |
| CV-04 | Every response in every API test is validated against the contract (status, headers, body) | A Supertest wrapper that asserts conformance with Ajv, so no test can pass with a non-conforming response |
| CV-05 | Drift: the routes, methods, and status codes the running apps expose equal the authored contracts | Compare the routes, methods, and status codes registered with Fastify (collected by an `onRoute` hook) with the authored contract operations |
| CV-06 | Backward compatibility: a new contract version versus the last released one is classified (removed operation, removed property, newly required property, narrowed enum, tightened constraint, removed status code) and compared with the declared `version_impact` | A small checker with a test per rule; `oasdiff` is backlog hardening (BL-06) |
| CV-07 | Every persisted and emitted audit event, failure event, approval, and policy evaluation validates against its schema | Validation in the writer path and in the verify command |
| CV-08 | The policy catalogue validates and is complete against the constitution MUST list | Completeness test (ADR-014) |
| CV-09 | Consumer tolerance: unknown response fields and unknown reason codes do not break the reference client | Test |
| CV-10 | Migrations apply forward on an empty database and on the previous version, with a tested down step or documented compensation | Migration tests |

### Validation evidence (actual execution, design-time only)

The authored documents were validated twice when this plan was produced, using throwaway scripts **outside the repository** (2026-10-16, one local machine). Both cover CV-01, CV-02, CV-03, and a partial CV-08, plus negative controls.

| Run | Tooling | Result |
|-----|---------|--------|
| Python validators (before the stack decision) | `jsonschema`, `openapi-spec-validator`, `PyYAML`, Python 3.15.0 | **33 checks, 0 failed** (including structural checks of the policy catalogue and eight negative controls) |
| **Approved stack's own tooling** | Node 24.22.0, Ajv 8.20.0 (2020 dialect, **strict mode**), `ajv-formats`, `@apidevtools/swagger-parser` | **23 checks, 0 failed** (both OpenAPI 3.1 documents, nine schemas, seven examples, the policy catalogue, four negative controls) |

Defects found by validation, all fixed before the final runs:

1. `failure-event.schema.json` accepted a `RECOVERED` event whose recovery timestamps were null (found by the Python run's negative control; a null value satisfied `required`). This would have corrupted MTTR.
2. `policy-evaluation.schema.json` accepted `EXCEPTION-REQUESTED` with a null `exception_id` (same cause).
3. `change-record.schema.json` used nested conditional sub-schemas without `"type": "object"`, which the Python validator tolerated but **Ajv strict mode rejected** (found by the Node run). It matters because Fastify validates with Ajv.

Limits of this evidence: it proves the documents are well-formed and the examples and policy catalogue conform. It does **not** prove that any implementation conforms, because no implementation exists yet (CV-04, CV-05, CV-06, CV-07, CV-09, and CV-10 are future checks). It is design-time validation, not a test of behavior. In the implementation, CV-01 to CV-03 and CV-08 run under Vitest using the Node tooling above.