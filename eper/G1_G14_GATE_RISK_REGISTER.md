# EPER — G1–G14 Gate Risk Register

## Scope
Chapters 463–500 | 228 Requirements | 38 Chapters | G1–G14

## Risk control principle
Risks are recorded separately from evidence status. A risk is not treated as closed merely because an engineering artifact exists.

| ID | Gate | Risk | Likelihood | Impact | Current control | Residual state | Mitigation / next action | Owner |
|---|---|---|---|---|---|---|---|---|
| R-001 | G3 | Authoritative HLD/LLD locators are not fully reconciled in the repository baseline | Medium | High | Architecture/design artifacts and source-controlled mappings exist | OPEN | Reconcile authoritative locators requirement-by-requirement | Architecture / Product |
| R-002 | G4 | Requirement-specific contract joins may diverge from authoritative source evidence | Low | High | Governed DATA/API/EVENT contracts and integrity tests | CONTROLLED | Perform source reconciliation where required | Architecture / Engineering |
| R-003 | G6 | Engineering verification could be mistaken for business/UAT acceptance | Medium | High | Acceptance-wave documents explicitly preserve the evidence boundary | CONTROLLED | Maintain separation of test, UAT, release and production evidence | QA / Engineering |
| R-004 | G7 | Requirement-level UAT/business acceptance evidence is absent from the current repository baseline | High | Critical | Gate remains PENDING | OPEN | Acquire execution results, approver identity/date and defect/retest linkage | Business / UAT |
| R-005 | G8 | Traceability freeze could be executed before all prerequisite evidence is reconciled | Medium | Critical | Freeze preparation only; no freeze claim | CONTROLLED | Complete entry checklist and authorized freeze decision | Evidence Owner |
| R-006 | G9 | CI PASS for the reconciliation test is not yet verified | High | Critical | G9 explicitly held PENDING / NOT FROZEN | OPEN | Verify workflow result for commit 8b6e1df54ea7d81ec89421f51d8e06f4597683f9 | Evidence Owner / QA |
| R-007 | G9 | Downstream UAT/release/production evidence may not reconcile to the frozen requirement baseline | High | Critical | Downstream gates remain pending | OPEN | Join authoritative downstream evidence before freeze | Evidence Owner |
| R-008 | G10 | Implementation closure could be incorrectly interpreted as production closure | Low | Critical | G10 scope explicitly limited to implementation | CONTROLLED | Preserve implementation-only wording in closure artifacts | Engineering / QA |
| R-009 | G11 | Controlled release package, version/build identity and approvals are not evidenced | High | High | Gate remains PENDING | OPEN | Assemble release candidate and approval evidence | Release Management |
| R-010 | G12 | Production deployment and OPS validation evidence are not evidenced | High | Critical | Gate remains PENDING | OPEN | Capture deployment, smoke, monitoring and OPS sign-off | Operations / SRE |
| R-011 | G13 | Final business acceptance/certification and exception disposition are not evidenced | High | Critical | Gate remains PENDING | OPEN | Obtain authorized final decision and dated sign-off | Business / Certification |
| R-012 | G14 | Audit archive, certificates, exceptions, sign-offs and submission manifest are not evidenced as complete | High | Critical | Gate remains PENDING | OPEN | Assemble controlled closure package after upstream gates | Audit / Closure |
| R-013 | G1–G14 | Evidence drift between repository artifacts and authoritative source documents | Medium | High | Controlled evidence registers and traceability artifacts | CONTROLLED | Reconcile source changes before gate promotion | Evidence Owner |
| R-014 | G1–G14 | Duplicate or incomplete requirement identity could invalidate reconciliation | Low | Critical | Registry cardinality and chapter controls | CONTROLLED | Re-run 228/38/6 population checks before freeze | QA / Evidence Owner |

## Critical risks

### R-006 — G9 CI verification
This is the immediate technical gate risk. The existence of commit `8b6e1df54ea7d81ec89421f51d8e06f4597683f9` does not establish a CI PASS. The workflow result must be independently verified.

### R-004/R-007 — downstream acceptance reconciliation
Executable engineering verification covers the governed capability behavior, but it does not substitute for authoritative UAT, release, production or final acceptance evidence.

### R-010/R-011/R-012 — final closure chain
Production validation, final acceptance/certification and audit closure remain sequential downstream controls.

## Risk treatment rules

1. OPEN risks block the affected gate when the risk corresponds to an unmet exit criterion.
2. CONTROLLED risks remain visible and require continued evidence integrity.
3. No risk is marked CLOSED solely because a generated document or test exists.
4. Risk closure requires evidence that satisfies the corresponding gate exit criterion.
5. Any material source change requires reassessment of impacted gates.

## Current risk posture

- Critical/open: downstream UAT, G9 CI verification, downstream reconciliation, release, production, final acceptance and audit closure.
- Controlled: source integrity, routing, contracts, verification-boundary separation, freeze preparation and implementation-only closure.
- Production-closed requirements asserted: **0**.
- G9: **PENDING / NOT FROZEN**.
