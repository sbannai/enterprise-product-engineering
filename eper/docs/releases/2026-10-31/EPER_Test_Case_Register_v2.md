# EPER Test Case Register — v2
**Baseline:** 2026-10-31 | **Status:** Test design; execution status NOT RUN unless a run artifact is linked.

| ID | Area | Scenario / expected result | Priority |
|---|---|---|---|
| TC-SEC-001 | Tenant | Tenant A cannot list/read Tenant B application; non-disclosing denial | P0 |
| TC-SEC-002 | Actor assignment | Actor without application assignment cannot read settings/assets/tickets/agents | P0 |
| TC-SEC-003 | Assignment revoke | Revocation blocks subsequent API and worker action; history retained | P0 |
| TC-SEC-004 | Regrant/version | Regrant increments version; stale version returns conflict | P1 |
| TC-SEC-005 | Fail closed | Assignment/policy store unavailable; protected request denied, no fallback | P0 |
| TC-COM-001 | Product Admin | Customer role cannot access product catalogue/pricing controls | P1 |
| TC-COM-002 | Price resolver | Explicit approved product+market+effective price returned deterministically | P0 |
| TC-COM-003 | Locale | Changing locale changes formatting only, not quote amount/currency | P0 |
| TC-COM-004 | Price snapshot | Catalogue price change does not mutate accepted quote/subscription snapshot | P0 |
| TC-PAY-001 | Payment | Valid test order binds tenant, application, amount and currency | P0 |
| TC-PAY-002 | Payment | Invalid signature/order/amount/currency cannot mark paid | P0 |
| TC-PAY-003 | Webhook | Duplicate signed webhook creates one financial effect | P0 |
| TC-PAY-004 | Unknown state | Timeout/unknown provider state enters reconciliation; no receipt | P0 |
| TC-PAY-005 | Receipt | Captured payment creates unique PDF receipt matching transaction | P0 |
| TC-PAY-006 | Receipt access | Unpaid, failed, unauthorized and cross-tenant downloads denied | P0 |
| TC-SCH-001 | Scheduler | Due schedule triggers without browser/timer polling | P0 |
| TC-SCH-002 | Scheduler | Concurrent workers cannot dispatch same event twice | P0 |
| TC-SCH-003 | Recovery | Worker restart/stale lease recovery retries within policy | P0 |
| TC-SCH-004 | Cancel/pause | Pause/cancel/consent revocation fences pending dispatch | P0 |
| TC-SCH-005 | Diagnostics | Tenant-scoped execution diagnostics expose safe reason, not secrets | P1 |
| TC-AI-001 | AI drafts | Draft is persisted and tenant/application scoped | P1 |
| TC-AI-002 | Maker-checker | Creator cannot self-approve where separation applies | P0 |
| TC-AI-003 | External action | Approval alone does not send/publish/write CRM | P0 |
| TC-AI-004 | Consent | Opt-out/revoked consent blocks queued external action | P0 |
| TC-AUD-001 | Audit | High-risk mutation and audit commit atomically; audit failure rolls back/fails closed | P0 |
| TC-AUD-002 | Audit | Denied/failed access and privileged search/export are audited | P1 |
| TC-TKT-001 | Ticketing | Client sees own assigned application only | P0 |
| TC-TKT-002 | Ticketing | Product Admin cross-tenant queue requires explicit permission and audit | P0 |
| TC-ASSET-001 | Assets | Untrusted/credentialed storage URL rejected; download is actor scoped | P0 |
| TC-API-001 | API | Standard envelope, stable error code and correlation ID across routes | P1 |
| TC-UX-001 | UI | Responsive keyboard-accessible loading/empty/error/success states | P1 |
| TC-DB-001 | Persistence | PostgreSQL restart preserves assignments, schedules, audit and transactions | P0 |
| TC-DB-002 | Resilience | DB outage causes safe fail-closed behavior; no in-memory authoritative fallback | P0 |

Execution columns to populate per run: commit SHA, workflow/run URL, environment, test command, result, artifact link, defect/ticket, tester, timestamp and reviewer. Do not infer PASS from merge status or test-file existence.
