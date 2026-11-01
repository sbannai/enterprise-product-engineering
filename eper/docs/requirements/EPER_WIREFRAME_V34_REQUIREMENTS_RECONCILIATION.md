# Wireframe v34 — Requirements Baseline and Reconciliation Control

**Source wireframe:** `eper/product-baselines/EPER_Customer_Admin_Workspace_Wireframe_v34_Campaign_Scheduler_Agents_Ticketing_2026-10-27.html`  
**Source register export:** `eper/docs/requirements/source/EPER_CW_Wireframe_v34_Requirements_Source_Export.csv`  
**Source date:** 2026-10-27  
**Review baseline:** `a1b93decff2f292a0a81453c27801607ca5f7946`  
**Status:** Source preserved; additive requirement reconciliation is pending.  
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

## 3. Mandatory reconciliation before implementation promotion

For every `EPER-CW-001…045` row, record one disposition:

1. **MAP_TO_EXISTING** — identify the exact existing `REQ-463xx…REQ-500xx` requirement(s) and acceptance criterion that fully cover it.
2. **ADDITIVE_1_6_0** — demonstrate that no existing approved requirement fully covers it; retain the new ID and add testable acceptance criteria.
3. **SPLIT_OR_COMPOSITE** — split the candidate into independently testable requirements or identify all linked existing requirements.
4. **OWNER_DECISION_REQUIRED** — retain unchanged and block implementation until the ambiguity is resolved.

Do not infer mappings from a broad capability label or the XX01–XX06 pattern. Each mapping needs a specific acceptance-criterion comparison. Multiple v34 rows may map to one existing requirement and one v34 row may need multiple mappings; record the relationship explicitly.

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

1. Reconcile the 45 candidates against the 228 approved requirements and the existing v1.5.0 change-control register.
2. Publish the resulting additive v1.6.0 draft with owner decisions and a complete traceability matrix.
3. Link each approved v1.6.0 requirement to the six capability families, API, UI, PostgreSQL/data, events/audit, security and tests.
4. Build complete customer journeys in dependency order: identity and tenant/application context → workspace → Help Center/Growth Hub → ticket submission/history → admin support operations → settings → scheduler/agents/notifications/pricing.
5. Update this register on every requirement change; no new feature begins without a versioned requirement and acceptance criteria.

## 7. Acceptance boundary

This PR preserves the exact source wireframe and source-register export in GitHub and documents the version conflict and reconciliation rule. It does **not** claim that the 45 candidate requirements are approved, mapped, implemented, tested or released. The 228 approved requirements remain unchanged. Business UAT remains unauthorized until all entry gates are evidenced and owner-approved.
