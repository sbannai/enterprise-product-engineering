# v34-to-228 Requirements Reconciliation — Technical Crosswalk

**Source:** Customer & Admin Workspace Wireframe v34 (2026-10-27)  
**Candidate register:** `EPER_CW_Wireframe_v34_Requirements_Source_Export.csv` (45 complete source rows, original statements and acceptance criteria retained)  
**Approved baseline:** 228 requirements, Chapters 463–500 (38 chapters)  
**Baseline source:** `WHOLE_BATCH_228_REQUIREMENT_ACCEPTANCE_MATRIX.md`, `FINAL_228_REQUIREMENT_EXECUTION_REGISTER.json`, `traceability/EM_OPS_228_REQUIREMENT_DOMAIN_AND_CONTRACT_RECONCILIATION.csv`  
**Decision:** Technical reconciliation completed; v1.6.0 remains a draft pending owner approval.

## 1. What the 228 baseline actually says

The current 228 acceptance matrix records 228/228 BRD identifiers, 228/228 SRS identifiers, 228/228 capability bindings and six shared capability families. It explicitly marks requirement-specific acceptance as **PENDING** and production closure as **NOT ASSERTED**. Its 228 rows are generic repeated control patterns:
- XX01 authoritative records and lifecycle history
- XX02 role-based authorization
- XX03 business validation
- XX04 audit evidence
- XX05 exception handling
- XX06 governed reporting

The baseline SRS v2 adds cross-cutting controls (SRS-002 through SRS-020), including tenant/application authorization, durable assignment, price/payment authority, asynchronous scheduler/workers, approval and external-action gates, integration secret handling, assets, ticketing, audit, live-vs-preview state and responsive UI.

**Important reconciliation limit:** These are shared engineering controls, not 228 domain-specific customer-workspace acceptance specifications. The repository does not establish an exact approved HLD/LLD/domain locator that makes a customer-workspace feature fully covered by a particular chapter REQ. We therefore do not fabricate exact REQ-463xx…REQ-500xx matches. Each candidate is linked to the relevant cross-cutting SRS controls and capability pattern(s), while retaining its own candidate ID.

## 2. Disposition summary

| Result | Count | Meaning |
|---|---:|---|
| Candidate rows preserved | 45 | All IDs, statements, acceptance criteria, priority proposals and wireframe locators retained in the source CSV |
| Fully covered by one exact 228 requirement | 0 | No false exact mapping claimed |
| Partially supported by shared 228 controls | 45 | Common security, audit, workflow, data or reporting controls apply, but do not replace the feature acceptance criteria |
| Draft additive requirements proposed | 45 | Candidate v1.6.0 entries; not yet owner-approved |
| Existing 1.5.0 approval overlap | 4 | CW-007, CW-011, CW-018, CW-020 depend on/extend EPER-ACT-APPROVAL-001 |
| 228 baseline changes | 0 | Existing IDs, chapters and acceptance status remain unchanged |

This is a complete technical classification of the available source—not an assertion that owner approval or feature delivery has occurred.

## 3. Candidate-by-candidate crosswalk

| Candidate ID | v34 capability / module | Supporting baseline controls | Existing additive overlap | Disposition |
|---|---|---|---|---|
| EPER-CW-001 | Customer workspace shell | SRS-002, SRS-020; XX02 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-002 | Tenant/application context | SRS-002, SRS-003; XX02 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-003 | Overview dashboard | SRS-018, SRS-020; XX06 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-004 | Help Center knowledge base | SRS-002, SRS-018, SRS-020; XX01/XX06 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-005 | Growth Hub asset library | SRS-002, SRS-014, SRS-015; XX01/XX02/XX04 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-006 | Growth Hub campaign content | SRS-009, SRS-011, SRS-012, SRS-013; XX01/XX03/XX05 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-007 | Growth Hub approvals | SRS-011, SRS-012, SRS-013; XX02/XX04 | EPER-ACT-APPROVAL-001 (1.5.0) | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-008 | Application KPI monitoring | SRS-018, SRS-020; XX06 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-009 | Campaign creation | SRS-009, SRS-011, SRS-012; XX01/XX03 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-010 | Campaign lifecycle | SRS-009, SRS-011, SRS-012, SRS-017; XX03/XX04/XX05 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-011 | Approval bound to content version | SRS-011, SRS-012, SRS-013; XX02/XX04 | EPER-ACT-APPROVAL-001 (1.5.0) | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-012 | Asynchronous campaign scheduler | SRS-009, SRS-010, SRS-011; XX05 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-013 | Idempotent campaign delivery | SRS-009, SRS-010, SRS-013; XX03/XX05 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-014 | Campaign queue visibility | SRS-009, SRS-010, SRS-018; XX06 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-015 | Provider-neutral agent orchestration | SRS-012, SRS-013, SRS-014; XX02/XX03 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-016 | Sales agent assistance | SRS-012, SRS-013; XX03/XX06 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-017 | Marketing agent assistance | SRS-012, SRS-013, SRS-014; XX03/XX05 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-018 | Native CRM agent assistance | SRS-011, SRS-012, SRS-013; XX02/XX04 | EPER-ACT-APPROVAL-001 (1.5.0) | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-019 | Agent run monitor | SRS-009, SRS-017, SRS-018; XX04/XX06 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-020 | Agent approval inbox | SRS-011, SRS-012, SRS-013, SRS-017; XX02/XX04 | EPER-ACT-APPROVAL-001 (1.5.0) | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-021 | Notification application configuration | SRS-002, SRS-014, SRS-017; XX02/XX04 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-022 | Firebase project topology | SRS-014, SRS-017; XX01/XX02 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-023 | Secure notification secret references | SRS-014, SRS-017; XX02/XX04 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-024 | Notification event subscriptions | SRS-014, SRS-017; XX03/XX04 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-025 | Notification audience targeting | SRS-002, SRS-011, SRS-014; XX02 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-026 | Notification delivery observability | SRS-017, SRS-018, SRS-019; XX04/XX06 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-027 | Ticket submission | SRS-002, SRS-016, SRS-017; XX01/XX02/XX04 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-028 | Ticket evidence reference | SRS-015, SRS-016, SRS-017; XX01/XX04 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-029 | Ticket triage and lifecycle | SRS-016, SRS-017; XX03/XX04/XX05 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-030 | Customer ticket list | SRS-002, SRS-016; XX02/XX06 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-031 | Ticket conversation and replies | SRS-016, SRS-017; XX01/XX04 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-032 | Product Admin ticket queue | SRS-002, SRS-016, SRS-017; XX02/XX06 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-033 | Ticket assignment and status update | SRS-002, SRS-003, SRS-016, SRS-017; XX02/XX03/XX04 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-034 | Internal notes and customer replies separation | SRS-016, SRS-017; XX02/XX04 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-035 | Ticket queue export | SRS-002, SRS-016, SRS-017; XX02/XX04/XX06 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-036 | P1 evidence qualification | SRS-016, SRS-017; XX03/XX04/XX06 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-037 | P1 threshold review gate | SRS-016, SRS-017, SRS-018; XX03/XX06 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-038 | Application settings and integration references | SRS-002, SRS-003, SRS-014, SRS-017; XX01/XX02/XX04 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-039 | Localized pricing behavior | SRS-005, SRS-006, SRS-007; XX01/XX03/XX04 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-040 | Activity and audit trail | SRS-017; XX04 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-041 | Server-side tenant isolation and RBAC | SRS-002, SRS-003, SRS-004, SRS-017; XX02/XX04 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-042 | Responsive and accessible workspace UX | SRS-020; XX06 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-043 | Customer support service-level visibility | SRS-016, SRS-017, SRS-018; XX06 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-044 | Ticket triage severity governance | SRS-016, SRS-017; XX03/XX04/XX05 | None | ADDITIVE_1_6_0_DRAFT |
| EPER-CW-045 | No false live-state presentation | SRS-018, SRS-019; XX04/XX06 | None | ADDITIVE_1_6_0_DRAFT |

**Interpretation:** “Supporting baseline controls” means the candidate must reuse those controls. It does not mean the feature is already delivered or fully covered. The XX pattern labels are capability-family links; they are not exact requirement-ID matches.

## 4. Version and approval control

The repository's controlled feature-addition register records `EPER-ACT-APPROVAL-001` as v1.5.0 and says the next new feature addition is v1.6.0. The workbook's proposed v1.5.0 therefore cannot be adopted as-is.

- Preserve all 45 IDs and their original source statements/acceptance criteria.
- Carry them as **v1.6.0 DRAFT** until the owner explicitly approves the additive scope, priority and release commitment.
- The four approval-related candidates must reference EPER-ACT-APPROVAL-001; they must not weaken or duplicate its human-approval rule.
- Any split, merge, clarification or deferral must be recorded in a new revision, retaining the original source ID.
- No 228 baseline ID, chapter, or acceptance criterion is changed by this crosswalk.

## 5. Evidence and implementation status

The v34 HTML is a prototype and the 45 source rows are wireframe-defined. This crosswalk does not convert them into implemented requirements.

Initial repository inspection confirms:
- Customer ticket APIs and PostgreSQL ticket persistence exist, with tenant/actor/application checks and idempotent customer submission paths.
- Customer browser identity has since advanced beyond the initial bearer-mapping baseline: merged PRs #310, #324 and #329 provide durable OIDC login transactions, PostgreSQL browser sessions, host-only Secure/HttpOnly/SameSite cookies, CSRF protection, tenant/application assignment checks, a least-privilege customer role, and a synthetic-IdP Chromium journey covering ticket submission/reply, assigned-application settings, logout and persisted session revocation. This is technical synthetic-IdP evidence, not proof of production IdP onboarding, discovery/JWKS rotation or credential/key lifecycle. The Product Admin/support queue remains bearer-credential authenticated; no support-admin OIDC browser session is evidenced.
- Scheduler schema, worker code and dispatch controls exist; complete provider dispatch, worker supervision, production operations and end-to-end customer visibility remain to be evidenced.
- Notification provider topology/secret management, native CRM, KPI data feeds, content/asset management, Help Center and admin ticket operations need feature-by-feature verification; a design or placeholder UI is not implementation evidence.

**No candidate is marked implemented or accepted here.** The next implementation gate is to bind each v1.6.0 candidate to UI, API, PostgreSQL schema, event/audit, authorization and executable acceptance tests.

## 6. Owner decision required

The technical classification is complete. Before promoting v1.6.0 from draft, the owner must confirm that these 45 additive feature statements and their proposed Must/Should priorities represent the intended product scope. This is the only approval boundary; it does not block preserving the source or continuing work on already-approved 228 requirements.

## 7. Owner-directed commercial additions — separate from the 45 v34 source rows

The v1.6.0 register now carries ten owner-directed commercial additions, EPER-CW-046 through EPER-CW-055. They are **not** additional rows from the original v34 wireframe export. Keep the original 45 source rows, source CSV, source statements and their dispositions unchanged. This section links the separate commercial additions to the same shared baseline controls without inventing exact REQ-463xx…REQ-500xx matches.

| Candidate ID | Commercial capability | Supporting baseline controls | Shared capability families | Disposition |
|---|---|---|---|---|
| EPER-CW-046 | Customer lifecycle status, effective date, reason, actor and audited history | SRS-002, SRS-003, SRS-017; XX01/XX02/XX03/XX04/XX05 | Authoritative records, authorization, validation, audit, exceptions | OWNER_DIRECTED_ADDITIVE_1_6_0_DRAFT |
| EPER-CW-047 | Versioned customer tariff assignment for single-/multi-application billing, limits, price, currency and interval | SRS-002, SRS-005, SRS-006, SRS-007, SRS-017; XX01/XX02/XX03/XX04 | Records, authorization, validation, audit | OWNER_DIRECTED_ADDITIVE_1_6_0_DRAFT |
| EPER-CW-048 | Server-side metering and reconciliation of active applications and billable scope | SRS-017, SRS-018, SRS-019; XX01/XX04/XX06 | Records, audit, governed reporting | OWNER_DIRECTED_ADDITIVE_1_6_0_DRAFT |
| EPER-CW-049 | Fail-closed enforcement of customer tariff and application/add-on entitlement boundaries across synchronous and asynchronous entry points | SRS-002, SRS-003, SRS-009, SRS-010, SRS-011, SRS-017; XX02/XX03/XX04/XX05 | Authorization, validation, audit, exceptions | OWNER_DIRECTED_ADDITIVE_1_6_0_DRAFT |
| EPER-CW-050 | Product Admin commercial compliance, deviation monitoring and controlled exception/remediation | SRS-002, SRS-017, SRS-018, SRS-019; XX02/XX04/XX06 | Authorization, audit, governed reporting | OWNER_DIRECTED_ADDITIVE_1_6_0_DRAFT |
| EPER-CW-051 | Customer-facing single-/multi-application tariff mobility with explicit consent and price/entitlement validation | SRS-002, SRS-003, SRS-005, SRS-006, SRS-007, SRS-017; XX01/XX02/XX03/XX04 | Records, authorization, validation, audit | OWNER_DIRECTED_ADDITIVE_1_6_0_DRAFT |
| EPER-CW-052 | Safe downgrade with explicit selection of applications to retain/deactivate; preserve application data | SRS-002, SRS-003, SRS-017; XX02/XX03/XX04/XX05 | Authorization, validation, audit, exceptions | OWNER_DIRECTED_ADDITIVE_1_6_0_DRAFT |
| EPER-CW-053 | Product Admin tariff catalogue price creation, versioning, activation, scheduling and retirement | SRS-005, SRS-006, SRS-007, SRS-017; XX01/XX03/XX04 | Records, validation, audit | OWNER_DIRECTED_ADDITIVE_1_6_0_DRAFT |
| EPER-CW-054 | Price integrity across tariff switching, quotation, invoice, payment and receipt snapshots | SRS-005, SRS-006, SRS-007, SRS-017; XX01/XX03/XX04/XX05 | Records, validation, audit, exceptions | OWNER_DIRECTED_ADDITIVE_1_6_0_DRAFT |
| EPER-CW-055 | Customer Admin explicitly selects application assignments to revoke during a tariff downgrade; commit revocations, tariff acceptance/history and audit atomically | SRS-002, SRS-003, SRS-017; XX01/XX02/XX03/XX04/XX05 | Records, authorization, validation, audit, exceptions | OWNER_DIRECTED_ADDITIVE_1_6_0_DRAFT |

### Commercial crosswalk interpretation

1. The original v34 reconciliation remains exactly 45 source rows: 0 exact full-coverage matches, 45 partial-support links to shared controls, and 45 additive v1.6.0 draft candidates. The four existing approval overlaps remain linked to EPER-ACT-APPROVAL-001.
2. EPER-CW-046–055 are ten additional owner-directed commercial requirements in the v1.6.0 draft register. They do not change the original v34 source export, the approved 228 requirement IDs, or the 38 chapters.
3. The supporting SRS/XX references identify reusable cross-cutting controls only. They are not exact chapter requirement mappings and do not establish feature completion.
4. No commercial addition is marked fully covered by the 228 baseline. No unsupported exact REQ-463xx…REQ-500xx locator is asserted.
5. The v1.6.0 addendum remains a draft pending the owner's formal disposition of its additive scope and priority. Owner-directed scope recording is not a change to the approved 228/38 baseline.

### Implementation evidence boundary

The commercial requirements are traceable here, but their implementation status must be assessed independently across UI, API, PostgreSQL, audit, authorization and executable tests. In particular, customer lifecycle enforcement is not equivalent to a complete Admin lifecycle-management UI; tariff catalogue publication is not equivalent to metering/deviation monitoring; and tariff acceptance is not complete price-integrity integration through quote, invoice, payment and receipt. Do not infer implementation or operational readiness from this crosswalk.


## 8. Owner-directed workflow and customer-settings additions — separate from the 45 v34 source rows

The v1.6.0 draft register also contains four owner-directed additions, EPER-CW-056 through EPER-CW-059. They are **not** additional rows from the original v34 wireframe export. This section records their relationship to reusable 228-baseline controls without inventing exact REQ-463xx…REQ-500xx matches.

| Candidate ID | Additive capability | Supporting baseline controls | Shared capability families | Disposition |
|---|---|---|---|---|
| EPER-CW-056 | Tenant/application-scoped configurable workflow Rule Engine | SRS-002, SRS-003, SRS-009, SRS-010, SRS-011, SRS-017; XX01/XX02/XX03/XX04/XX05 | Authoritative records, authorization, validation, audit, exceptions | OWNER_DIRECTED_ADDITIVE_1_6_0_DRAFT |
| EPER-CW-057 | Versioned visual Workflow Designer with draft, validation, simulation and controlled publication | SRS-002, SRS-003, SRS-009, SRS-010, SRS-011, SRS-017, SRS-018; XX01/XX02/XX03/XX04/XX05/XX06 | Authoritative records, authorization, validation, audit, exceptions, governed reporting | OWNER_DIRECTED_ADDITIVE_1_6_0_DRAFT |
| EPER-CW-058 | Customer-wide alert/video defaults inherited by applications with authorized application overrides | SRS-002, SRS-003, SRS-014, SRS-017, SRS-018; XX01/XX02/XX03/XX04/XX05/XX06 | Authoritative records, authorization, validation, audit, exceptions, governed reporting | OWNER_DIRECTED_ADDITIVE_1_6_0_DRAFT |
| EPER-CW-059 | Central platform/customer policy boundaries over inherited and application-specific alert/video settings | SRS-002, SRS-003, SRS-014, SRS-017, SRS-018, SRS-019; XX02/XX03/XX04/XX05/XX06 | Authorization, validation, audit, exceptions, governed reporting | OWNER_DIRECTED_ADDITIVE_1_6_0_DRAFT |

### Workflow/settings crosswalk interpretation

1. EPER-CW-056–059 are four separate owner-directed v1.6.0 draft additions. They do not increase or alter the original 45 v34 source rows.
2. The SRS/XX references identify reusable cross-cutting controls only. They are not exact chapter-level requirement matches and do not establish that the workflow designer, settings UI or provider operations are implemented.
3. No exact REQ-463xx…REQ-500xx locator is asserted for these additions. The approved 228 requirement IDs, 38 chapters and their acceptance states remain unchanged.
4. Owner disposition of the additive scope remains pending. Recording these candidates in the crosswalk is traceability work, not owner approval or implementation acceptance.

### Implementation evidence boundary

Implementation must still be assessed independently across customer/admin UI, API, PostgreSQL persistence, tenant/application authorization, audit, workflow execution, provider configuration and executable acceptance tests. In particular, workflow Rule Engine/Designer drafts are not equivalent to a published, supervised runtime; inherited alert/video settings are not equivalent to live provider dispatch. Do not infer feature completion from this crosswalk.


## 9. Later draft reconciliation and implementation evidence correction — 2026-11-05

### CW-060 version conflict

Two cumulative change-control drafts reuse EPER-CW-060 with materially different acceptance criteria:

- **v1.6.0 draft (PR #380):** defines CW-060 as a tenant-isolated customer-level asset repository and adds CW-061 as a separate workflow-driven customer application experience.
- **v1.7.0 draft (PR #385):** redefines CW-060 to add customer-wide defaults, per-application INHERIT/ALLOW/DENY, role-level permissions, quarantine/malware scanning, retention, legal hold and asynchronous purge.

This is an acceptance-criteria change, not a harmless wording edit. Do not silently merge the two CW-060 definitions, treat them as two distinct IDs, or infer owner approval. Preserve both draft source documents, keep CW-061 separate, and obtain an explicit owner disposition before promoting either definition. This conflict does not change the approved 228 requirements or 38 chapters.

### Current implementation evidence boundary

- Customer OIDC browser login and the customer ticket journey are implemented and browser-tested on merged PR #329 (head `4d4d217bbe56ec9ab1501de58afae82fd55b5328`; browser run `41385533343`). The test uses a synthetic IdP and verifies secure host-only cookies, durable PostgreSQL session state, role/assignment checks, ticket submission/reply, settings access, logout and revocation. It does not prove production IdP onboarding or key/JWKS lifecycle.
- The support-admin console still accepts a server-issued bearer credential. Ticket triage, status, assignment, severity/P1 rationale, customer-visible versus internal replies, tenant/application scoping and filtered CSV export have API/store/UI tests. The ticket schema does not yet implement first-response/resolution deadlines, SLA breach detection or escalation.
- Customer asset upload remains an open candidate, not a mainline capability. PR #399 tests inject synthetic upload-grant and verification resolvers; its browser E2E is the OIDC journey and does not upload file bytes. The candidate API composition root does not wire a concrete storage upload/download, verification or malware-scanner adapter. No real storage/scanning provider or cloud resource is configured.
- Campaign scheduler worker code is a continuous claim/recover/dispatch loop with lease renewal/fencing, retry/dead-letter and a fail-closed policy gate. Its deployment-owned adapter is still required. The independent workflow-outbox process is proposed in open PR #400; it requires an explicit dispatcher module. Independent process supervision, a metrics/alert sink and an operational recovery rehearsal remain unproven.

These corrections update implementation evidence only. They do not mark any additive candidate accepted, alter the approved baseline, enable external dispatch, or authorize UAT.
