# Wireframe v34 — Requirements Baseline and Reconciliation Control

**Source wireframe:** `eper/product-baselines/EPER_Customer_Admin_Workspace_Wireframe_v34_Campaign_Scheduler_Agents_Ticketing_2026-10-27.html`  
**Source register export:** `eper/docs/requirements/source/EPER_CW_Wireframe_v34_Requirements_Source_Export.csv`  
**Source date:** 2026-10-27  
**Review baseline:** `a1b93decff2f292a0a81453c27801607ca5f7946`  
**Status:** Technical reconciliation completed and recorded in `EPER_V34_TO_228_REQUIREMENTS_CROSSWALK.md`; all 45 candidates remain additive v1.6.0 draft pending owner approval and feature-level acceptance evidence.  
**Owner instruction:** Use wireframe v34 as the customer/admin workspace baseline. Future changes must be added to the controlled requirements register and shared.

## 1. Protect the existing approved baseline

The approved product baseline remains **228 requirements across 38 chapters (463–500)**. Nothing in this document replaces, renumbers, weakens or silently changes those requirements.

The v34-derived source contains **45 candidate workspace requirements**, IDs `EPER-CW-001` through `EPER-CW-045`. They cover customer workspace navigation, tenant/application context, Help Center, Growth Hub, campaigns, approvals, scheduler, agents, notifications, ticketing, admin support, P1 triage, settings, localized pricing, audit, RBAC and responsive UX.

The source export explicitly marks these as wireframe-defined and implementation-unverified. A prototype is not evidence of persistence, API integration, authentication, external dispatch or production behavior.

## 2. Version conflict resolved conservatively

The repository's existing controlled change register `EPER_PRODUCT_REQUIREMENTS_CHANGE_CONTROL_v1.4.md` already records version **1.5.0** for the owner-directed human-approval control `EPER-ACT-APPROVAL-001`, and states that the next new feature addition must use **1.6.0**.

The Library workbook was labelled “v1.5.0 draft”, which conflicts with that repository history. Therefore:
- Do not publish the v34-derived 45 requirements as an approved v1.5.0 register.
- Treat the preserved v34 requirements as the candidate content for **v1.6.0 draft**.
- Retain all 45 source IDs and statements during reconciliation; do not discard or silently rewrite them.
- Version 1.6.0 remains draft until the mapping and owner approval are recorded.

## 3. Technical reconciliation result (2026-11-01)

The controlled crosswalk `EPER_V34_TO_228_REQUIREMENTS_CROSSWALK.md` now records the complete disposition of all 45 preserved source rows:

| Reconciliation result | Count | Disposition |
|---|---:|---|
| Exact full coverage by an approved 228 requirement | 0 | No exact REQ/acceptance-criterion match is asserted |
| Partial support from shared baseline controls | 45 | Reuse applicable SRS-002…SRS-020 and XX01–XX06 controls; these do not satisfy feature acceptance |
| Additive candidate requirements | 45 | Retained as `ADDITIVE_1_6_0_DRAFT`; not approved for release |
| Existing v1.5.0 approval-control overlap | 4 | CW-007, CW-011, CW-018 and CW-020 reference `EPER-ACT-APPROVAL-001` and must preserve its human-approval rule |
| Changes to approved 228 IDs or 38 chapters | 0 | Baseline unchanged |

The 228 baseline available for this comparison provides common engineering controls and capability patterns, but does not provide exact domain-specific customer-workspace acceptance criteria for these 45 features. Therefore, the crosswalk deliberately records **zero exact matches** rather than inventing REQ-463xx…REQ-500xx links. The 45 source IDs, original statements and acceptance criteria remain preserved in the source export.

This completes the **technical classification** of v34 against the available approved baseline. It does not constitute owner approval of v1.6.0, proof that any feature is implemented, or production acceptance. Any future evidence of exact coverage must identify the specific approved REQ ID and acceptance criterion and update the crosswalk/register without deleting source IDs.

## 4. Reconciliation fields

The controlled v1.6.0 register must carry these additional fields for every candidate:

| Field | Purpose |
|---|---|
| Source ID | Original EPER-CW ID; immutable |
| Source wireframe section/line | Source trace |
| Existing REQ ID(s) | Exact 228-baseline mapping, if any |
| Disposition | MAP_TO_EXISTING / ADDITIVE_1_6_0 / SPLIT_OR_COMPOSITE / OWNER_DECISION_REQUIRED |
| Gap/rationale | Why the mapping is complete or why new scope is needed |
| Acceptance criteria | Testable expected behavior |
| UI evidence | Real implementation path, not only prototype |
| API contract | Endpoint, authorization and validation |
| Data/persistence | Schema, migration, ownership and retention |
| Events/audit | Events and attributable evidence |
| Security | Tenant/application/RBAC and negative tests |
| Test evidence | Exact commit, workflow and result |
| Owner approval | Decision, date and reference |

## 5. High-risk cross-cutting rules from v34

- **Tenant/application security:** derive identity and scope server-side; never trust UI hiding or caller-supplied tenant/actor context.
- **Scheduler:** scheduled work must execute independently of browser lifetime; use durable schedules/claims, retries, idempotency and observable outcomes. Do not make browser polling the scheduler.
- **External actions:** agent-generated messages, publication and CRM writes remain proposals until explicit human approval; re-check authorization, scope, approved content version and idempotency at execution.
- **Notifications:** store secret references only; never expose service-account JSON, private keys or tokens to customer UI/logs.
- **Ticketing:** separate internal staff notes from customer-visible replies; enforce customer application scope and authorized admin tenant scope on the server.
- **Pricing:** currency display and actual charged amount must come from approved price-book resolution, not cosmetic formatting.
- **Live-state honesty:** clearly label demo/sample/disconnected data; never represent it as persisted live state.

## 6. Next engineering sequence

1. Keep all 45 rows in the controlled v1.6.0 draft; obtain owner approval before promoting the additive scope or its proposed priorities.
2. For each feature as it is implemented, link its immutable source ID to UI, API, PostgreSQL/data, events/audit, security and executable acceptance evidence.
3. Build complete customer journeys in dependency order: identity and tenant/application context → workspace → Help Center/Growth Hub → ticket submission/history → admin support operations → settings → scheduler/agents/notifications/pricing.
4. Update this register and the v1.6.0 draft on every requirement change; do not silently alter the 228 baseline.

## 7. Acceptance boundary

The source wireframe and source-register export remain preserved in GitHub. The technical crosswalk classifies all 45 candidates as additive v1.6.0 draft items, with zero exact full-coverage matches and zero changes to the 228 approved requirements. This is a classification result, not owner approval, implementation evidence or release acceptance. The 228 approved requirements remain unchanged.
