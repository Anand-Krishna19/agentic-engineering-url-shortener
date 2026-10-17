# Reliability and Recovery Design

**Feature**: `001-agentic-sdlc-url-shortener` | **Spec**: [spec.md](spec.md) v1.11 | **Plan**: [plan.md](plan.md) | **Model**: [orchestration-model.md](orchestration-model.md)

Design only. Covers FR-007, FR-017 to FR-020, FR-117 to FR-123, NFR-002, NFR-008, Constitution VIII. Numeric values are the approved PVTs (PVT-008 to PVT-011) or labelled plan proposals (PA).

## 1. Failure Classification

A failure is **transient** if a retry of the same operation, unchanged, can reasonably succeed. It is **permanent** if retrying cannot help (a defect, a rule violation, or a decision needed). Classification is made by a single function per plane so that behavior is testable; every classified failure carries a stable `error_code`.

| Plane | Transient | Permanent |
|-------|-----------|-----------|
| Application | Persistence timeout or busy; collision-recovery exhaustion (PA-008); a lease-expired request aborted by the atomic commit (`request_superseded`, OD-01); readiness lost | Unexpected internal error (an invariant failed); stored data inconsistent |
| Application (not failures) | Validation rejections (400), rate limiting (429), conflicts (409), not found (404), expired (410) are normal outcomes | n/a |
| Control | Persistence busy or timeout; agent attempt timeout; lease expiry; interrupted process; schema-invalid agent submission; failed validation tests; scanner unavailable offline | Out-of-scope agent action; fabricated evidence; cyclic task dependency; invariant violation; failed compensation |
| Control (not failures) | A policy FAIL, a NOT_READY readiness result, a failing test result, and a human rejection are results of the workflow, not node failures | n/a |

## 2. Retries, Backoff, and Timeouts

| Operation | Eligibility | Bound | Backoff | Timeout per attempt | Source |
|-----------|-------------|-------|---------|---------------------|--------|
| Application persistence access | Transient only | 3 retries after the first attempt | Exponential, 1 s base, doubling (1 s, 2 s, 4 s), no jitter in the prototype | 10 s | PVT-009, PVT-010, FR-020 |
| Short-code collision | Collision only | 3 attempts with a new code (PVT-007), then transient failure | None needed (new random code) | n/a | FR-007, PVT-007, PA-008 |
| Control node, deterministic | Transient only | 3 retries | As above | 10 s | PA-002, FR-117 |
| Control node, agent work | Transient only | 3 retries | As above, measured on the `Clock` port | 60 minutes logical | PA-002 |
| Node resumption after interruption | Lease expiry or process interruption | 3 resumptions per node, then safe-stop (SS-6) | none | n/a | PA-003 |
| Human gates | Not retried | One escalation | n/a | 24 h, escalate, 24 h, safe-stop | PVT-008, DEC-044 |

Rules: a retry never repeats a COMMITTED non-idempotent effect (it adopts the recorded result via the effect ledger); a permanent failure is never retried; the retry count and every backoff are recorded as audit events and `node_attempts`. Tests use the simulated `Clock`, so a 4 s backoff or a 24 h timeout costs no real time, and each such test labels its events `SIMULATED` (ADR-010, DEC-044).

## 3. Idempotency and Duplicate-Execution Protection

| Operation | Mechanism |
|-----------|-----------|
| Short-link creation with an `Idempotency-Key` | Per-client key; signature (normalized URL + canonical metadata + canonical expiry); states IN_PROGRESS, COMPLETED, FAILED; 60-second lease; atomic check-and-commit; 24-hour retention from the terminal state (DEC-016 to DEC-034). Details in data-model.md section 2.2. |
| Short-link creation without the header | Not deduplicated by design (DEC-009). |
| Node attempt | Idempotency key `run_id + node_key + plan_version + input_hash`; a duplicate dispatch adopts the existing attempt. |
| Work submission | Idempotent on `(work_item_id, content_hash)`; a repeat returns the same result. |
| Gate decision | A repeated identical decision returns the stored approval record; a conflicting decision on a decided gate returns 409 `gate_not_open`. |
| Audit write | `(run_id, seq)` is unique, so a duplicate write cannot create a second event. |
| Effects | The effect ledger records `INTENDED` then `COMMITTED` per idempotency key; recovery never re-applies a COMMITTED effect. |

## 4. Fallback

| Where | Fallback | Constraint |
|-------|----------|-----------|
| Agent work node, retries exhausted | `HUMAN_AUTHORED_SUBMISSION` (live) or `ALTERNATE_SCRIPTED_AGENT` (scripted profile) | Same schema validation and gates; audited; never lowers a policy, security, or approval requirement (FR-118 NAC) |
| Analytics capture failure | Redirect proceeds without recording the event (fail-open); the failure is logged and audited (DEC-007) | The mapping is never corrupted; the count may be a lower bound, visible through the failure records |
| Scanner unavailable (offline) | Run the scan from the cached advisory data and label the evidence `OFFLINE` | A policy outcome based on stale data is flagged in the evidence; the human may decline to accept it at G-SEC |
| Persistence unavailable on the application plane | None: return 503 and report not-ready | No success is ever reported for an unsaved mapping (FR-019) |
| Redis unavailable (application plane) | **PostgreSQL-only mode** (DEC-067): no replay cache, no advisory lock (row-level locking instead), rate limiting through PostgreSQL-based checks | Slower but correct; never open; the degradation is logged, counted, audited, and shown in readiness while the service stays ready |

## 5. Rollback, Compensation, and Safe-Stop

Defined in [orchestration-model.md](orchestration-model.md) sections 5 and 7.3. Summary: transactional writes roll back; audit records, approvals, committed code, and external sends are compensate-only (DEC-056); a failed compensation escalates to safe-stop (SS-2); safe-stop is terminal and recovery needs a new run (DEC-050).

## 6. Resumption (FR-121, NFR-008, PVT-011)

The startup recovery scan (orchestration-model.md section 7.2) restores progress from persisted state and the effect ledger. Target: resume within 60 seconds with zero duplicated side effects (PVT-011), demonstrated on the wall clock in the demonstration environment and labelled demonstration. The approach never trusts in-memory state (FR-107).

## 7. Partial Failure and Dependency Unavailability

| Situation | Behavior |
|-----------|----------|
| One parallel branch fails permanently | Siblings drain to a safe boundary; no dependents start; compensate the failed branch's committed effects; safe-stop (SS-1) |
| A node fails after some effects committed | ROLLBACK effects abort; COMPENSATE_ONLY effects compensate in reverse order; the outcome is recorded per effect |
| A transaction partially fails | Atomic: nothing becomes visible; the attempt is classified transient or permanent |
| The application persistence layer is unavailable | 503 with `Retry-After` on create and resolve; `/readyz` reports not ready while `/healthz` stays alive (FR-021) |
| The control-plane persistence layer is unavailable | No state change is acknowledged; running attempts that cannot persist are treated as interrupted; the run is quarantined and recovery runs on return (SS-7) |
| The external-work adapter (inbox) is unavailable | The node stays `AWAITING_WORK`; the work-item lease expiry produces a transient failure and a retry or fallback |
| The audit chain fails verification | SS-5 for affected active runs; readiness reports `AUDIT_CHAIN_BROKEN` |
| Clock jumps backwards | Lease and expiry decisions use the `Clock` port; a non-monotonic reading is a permanent failure of that attempt, not silently accepted |

## 8. Fault-Injection Catalogue (source of recovery evidence)

Injected faults are **synthetic**. They produce real recovery behavior, but the resulting failure events are flagged `synthetic=true` and reported in a separate stratum from organic events; they are never presented as production failure behavior.

| ID | Fault | Plane | Expected behavior | Requirements |
|----|-------|-------|-------------------|--------------|
| FI-01 | Persistence transient error for N attempts, then success | App | Retries within bound; success; no duplicate mapping | FR-019, FR-020 |
| FI-02 | Persistence transient error beyond the bound | App | 503; no FAILED record; key still usable | FR-020, DEC-033 |
| FI-03 | Unexpected internal error | App | 500; FAILED record with the key; replayed for 24 h | DEC-029 |
| FI-04 | Analytics capture failure | App | Redirect still succeeds; failure logged and audited | FR-014 |
| FI-05 | Slow request outlives its 60 s lease while a retry supersedes it | App | The late commit is aborted atomically; one mapping | FR-017, DEC-034, LIM-002 |
| FI-06 | Concurrent duplicate same-key requests | App | One executes; the other gets 409 in-progress or a replay | FR-017, FR-018 |
| FI-07 | Agent attempt timeout | Control | Retry, then fallback | FR-117, FR-118 |
| FI-08 | Agent returns a schema-invalid submission | Control | Transient with feedback; bounded | FR-117 |
| FI-09 | Process killed after an effect commit and before the state transition | Control | Recovery adopts the committed effect; no duplicate | FR-121 |
| FI-10 | Process killed mid-attempt | Control | Lease expiry; interruption recorded; resume; recovery event with mechanism `RESUME` | FR-121, PVT-011 |
| FI-11 | Compensation action fails | Control | Escalate; SS-2; failure UNRECOVERED | FR-119, FR-120 |
| FI-12 | Approval gate times out (simulated) | Control | Escalate, then safe-stop; late response rejected | FR-115, DEC-041 |
| FI-13 | Audit row tampered | Control | Trigger rejects an in-database edit; out-of-band edit detected by verify; SS-5 | FR-130, FR-120 |
| FI-14 | Mandatory policy FAIL unresolved past the window (simulated) | Control | SS-4 | FR-125, DEC-045 |
| FI-15 | Scanner offline | Control | Cached-data fallback, evidence labelled OFFLINE | FR-127 |
| FI-16 | Redis killed mid-run | App | PostgreSQL-only mode: correct idempotent outcomes, PostgreSQL-based rate limiting, no advisory lock; degradation audited | FR-015, FR-022, DEC-067 |

## 9. Failure-Mode Analysis (summary)

| Component | Failure mode | Detection | Response | Evidence |
|-----------|--------------|-----------|----------|----------|
| Create handler | Crash after mapping insert, before response | Client timeout; next retry with the same key | Replay of the stored COMPLETED response; with the lease the record is consistent | Idempotency tests, audit |
| Redirect handler | Counter update fails | Exception caught around analytics only | Redirect still returned; failure audited | FR-014 test |
| Reaper | Runs late | Lazy checks on read | Expired records treated as absent regardless | FR-018 test |
| Scheduler | Crash | Lease expiry on restart | Recovery scan | FI-09, FI-10 |
| Audit writer | Disk full | Write error | Whole transaction aborts; node cannot advance; transient or permanent by error | Reliability tests |
| Gate decision | Approver submits a stale subject hash | Hash mismatch | 409 `approval_subject_changed` | Approval tests |
