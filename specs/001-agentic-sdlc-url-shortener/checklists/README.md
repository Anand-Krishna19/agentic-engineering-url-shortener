# Quality and Readiness Checklists: Agentic Software Engineering System: URL Shortener

**Created**: 2026-10-17 | **Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md)

Reviewer-owned requirements-quality checklists. **No item is checked**; checkbox state belongs to the reviewer, and `/speckit-implement` reads it as a gate. `[M]` mandatory, `[O]` optional; `G0` evaluable now, `G1` after `/speckit-tasks` and `/speckit-analyze`. `[Gap]` and `[Conflict]` mark places where current documents are silent or disagree. `requirements.md` is the separate built-in spec-quality checklist.

## Checklists

| Area | File | Items | Mandatory | Optional |
|------|------|-------|-----------|----------|
| 1 Requirements | [requirements-quality.md](requirements-quality.md) | 20 | 19 | 1 |
| 2 Architecture | [architecture.md](architecture.md) | 18 | 17 | 1 |
| 3 ADRs | [adr.md](adr.md) | 17 | 15 | 2 |
| 4 Agentic orchestration | [orchestration.md](orchestration.md) | 19 | 18 | 1 |
| 5 Controlled autonomy | [controlled-autonomy.md](controlled-autonomy.md) | 16 | 15 | 1 |
| 6 Human approvals | [human-approvals.md](human-approvals.md) | 17 | 16 | 1 |
| 7 Security | [security.md](security.md) | 20 | 19 | 1 |
| 8 Compliance and change control | [compliance-change-control.md](compliance-change-control.md) | 22 | 21 | 1 |
| 9 Reliability and recovery | [reliability-recovery.md](reliability-recovery.md) | 19 | 18 | 1 |
| 10 Observability and auditability | [observability-audit.md](observability-audit.md) | 19 | 18 | 1 |
| 11 TDD and testing | [tdd-testing.md](tdd-testing.md) | 19 | 18 | 1 |
| 12 Greenfield scenario | [scenario-greenfield.md](scenario-greenfield.md) | 15 | 14 | 1 |
| 13 Brownfield scenario | [scenario-brownfield.md](scenario-brownfield.md) | 16 | 15 | 1 |
| 14 Ambiguous-requirement scenario | [scenario-ambiguous.md](scenario-ambiguous.md) | 16 | 15 | 1 |
| 15 Documentation | [documentation.md](documentation.md) | 15 | 15 | 0 |
| 16 Traceability | [traceability.md](traceability.md) | 18 | 17 | 1 |
| 17 GitHub evidence | [github-evidence.md](github-evidence.md) | 16 | 15 | 1 |
| 18 Release readiness | [release-readiness.md](release-readiness.md) | 19 | 18 | 1 |
| 19 Assessment submission | [assessment-submission.md](assessment-submission.md) | 14 | 13 | 1 |
| **Total** | 19 files | **335** | **316** | **19** |

## Detection matrix

Each failure pattern you listed is covered by at least one item (`file:CHKnnn`).

| Failure pattern | Items |
|-----------------|-------|
| Linear chaining disguised as orchestration | [orchestration](orchestration.md):CHK001, [orchestration](orchestration.md):CHK003 |
| Missing persistent state | [orchestration](orchestration.md):CHK007, [orchestration](orchestration.md):CHK008 |
| Missing dependency representation | [orchestration](orchestration.md):CHK002 |
| Missing synchronization | [orchestration](orchestration.md):CHK012 |
| Missing decision lineage | [orchestration](orchestration.md):CHK009, [scenario-ambiguous](scenario-ambiguous.md):CHK008, [traceability](traceability.md):CHK012 |
| Missing approval enforcement | [controlled-autonomy](controlled-autonomy.md):CHK002, [human-approvals](human-approvals.md):CHK003 |
| Missing compliance policy evaluation | [compliance-change-control](compliance-change-control.md):CHK001, [compliance-change-control](compliance-change-control.md):CHK004 |
| Policy execution without a recorded policy version | [compliance-change-control](compliance-change-control.md):CHK003 |
| Compliance failure that does not block progression | [compliance-change-control](compliance-change-control.md):CHK007, [compliance-change-control](compliance-change-control.md):CHK008, [release-readiness](release-readiness.md):CHK003 |
| Unapproved policy exception | [compliance-change-control](compliance-change-control.md):CHK010 |
| Missing compensating control | [compliance-change-control](compliance-change-control.md):CHK009 |
| Expired policy exception | [compliance-change-control](compliance-change-control.md):CHK011 |
| Material change without impact analysis | [compliance-change-control](compliance-change-control.md):CHK015, [scenario-brownfield](scenario-brownfield.md):CHK006 |
| Architecture, schema, security, or workflow change without formal approval | [architecture](architecture.md):CHK016, [compliance-change-control](compliance-change-control.md):CHK016, [scenario-brownfield](scenario-brownfield.md):CHK007 |
| Approval inferred from silence | [human-approvals](human-approvals.md):CHK004 |
| Unlimited retries | [controlled-autonomy](controlled-autonomy.md):CHK004, [reliability-recovery](reliability-recovery.md):CHK002 |
| Invalid rollback claims | [reliability-recovery](reliability-recovery.md):CHK007 |
| Missing compensation | [reliability-recovery](reliability-recovery.md):CHK008 |
| Missing safe-stop | [reliability-recovery](reliability-recovery.md):CHK010 |
| Missing resume behavior | [orchestration](orchestration.md):CHK017, [reliability-recovery](reliability-recovery.md):CHK011 |
| Missing dynamic replanning | [orchestration](orchestration.md):CHK015 |
| Incomplete audit evidence | [controlled-autonomy](controlled-autonomy.md):CHK008, [observability-audit](observability-audit.md):CHK002, [observability-audit](observability-audit.md):CHK003 |
| Fabricated results | [controlled-autonomy](controlled-autonomy.md):CHK014, [human-approvals](human-approvals.md):CHK007, [observability-audit](observability-audit.md):CHK014, [tdd-testing](tdd-testing.md):CHK016, [scenario-greenfield](scenario-greenfield.md):CHK014, [scenario-ambiguous](scenario-ambiguous.md):CHK014, [github-evidence](github-evidence.md):CHK012, [github-evidence](github-evidence.md):CHK013, [github-evidence](github-evidence.md):CHK014, [assessment-submission](assessment-submission.md):CHK007 |
| Implementation preceding specification or tests | [tdd-testing](tdd-testing.md):CHK001, [tdd-testing](tdd-testing.md):CHK002, [tdd-testing](tdd-testing.md):CHK018, [github-evidence](github-evidence.md):CHK006 |
| Undocumented architecture drift | [architecture](architecture.md):CHK015, [adr](adr.md):CHK016 |
| Orphan requirements | [traceability](traceability.md):CHK003, [traceability](traceability.md):CHK006 |
| Orphan tasks | [traceability](traceability.md):CHK007, [traceability](traceability.md):CHK008 |
| Orphan implementation | [traceability](traceability.md):CHK009 |
| Orphan tests | [traceability](traceability.md):CHK010 |
| Documentation inconsistent with behavior | [documentation](documentation.md):CHK006, [documentation](documentation.md):CHK007 |
| Unsupported completion claims | [requirements-quality](requirements-quality.md):CHK011, [controlled-autonomy](controlled-autonomy.md):CHK015, [tdd-testing](tdd-testing.md):CHK017, [scenario-greenfield](scenario-greenfield.md):CHK012, [scenario-brownfield](scenario-brownfield.md):CHK015, [documentation](documentation.md):CHK003, [documentation](documentation.md):CHK008, [github-evidence](github-evidence.md):CHK016, [release-readiness](release-readiness.md):CHK012, [release-readiness](release-readiness.md):CHK013, [assessment-submission](assessment-submission.md):CHK005, [assessment-submission](assessment-submission.md):CHK006 |