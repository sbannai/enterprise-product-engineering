# EPER Test-to-Implementation Evidence Crosswalk — 31 Oct 2026

**Scope:** Evidence inventory for PR #273 documentation baseline. This maps proposed TC IDs to existing test suites on `main`; it does not assert that the current PR's tests ran or passed. Confirm exact run SHA before acceptance.

| Test register IDs | Existing suite(s) on main | Observed scenario coverage | Evidence interpretation |
|---|---|---|---|
| TC-SEC-001..005 | `eper/tests/tenant-isolation-regressions.test.mjs`; `eper/tests/postgres-tenant-application-assignment-store.test.mjs`; `eper/tests/customer-access-authorization.test.mjs`; `eper/tests/tenant-context-enforcement.test.mjs` | Tenant-scoped identifiers, durable assignment grant/revoke, stale version conflict, regrant version, audit rollback, actor/application authorization | Unit/contract coverage exists; run-level evidence still required |
| TC-COM-001..004 | `eper/tests/admin-pricing-ui.test.mjs`; `eper/tests/market-price-book.test.mjs`; `eper/tests/market-pricing-api.test.mjs`; `eper/tests/localization.test.mjs`; `eper/tests/localization-api.test.mjs` | Admin pricing UI, market price book/resolver, localization behavior | Verify exact price snapshot and no FX mutation end-to-end |
| TC-PAY-001..006 | `eper/tests/payment-gateway.test.mjs`; `eper/tests/payment-readiness.test.mjs`; `eper/tests/payment-production-guard.test.mjs`; `eper/tests/postgres-payment-store.integration.test.mjs`; `eper/tests/report-pdf-generation.test.mjs` | Signature rejection, tenant-scoped receipt, idempotency, ambiguous provider timeout/reconciliation, readiness fail-closed, persisted PDF digest and retry stability | Payment/receipt CI currently has an in-progress check on PR #273; verify completion and artifacts |
| TC-SCH-001..005 | `eper/tests/campaign-scheduler-worker.test.mjs`; `eper/tests/campaign-scheduler-store.test.mjs`; `eper/tests/campaign-scheduler-postgres-dispatch-race.integration.test.mjs`; `eper/tests/campaign-scheduler-api.test.mjs` | Worker claim, SKIP LOCKED, idempotent enqueue, bounded retry/dead-letter, lease completion, stale recovery, dispatch authorization, cancellation race and tenant scope | Strong unit/integration design coverage; inspect latest same-head PostgreSQL race evidence |
| TC-AI-001..004 | `eper/tests/ai-integrations-admin.test.mjs`; `eper/tests/agent-workflows.test.mjs`; `eper/tests/campaign-dispatch-authorization.test.mjs` | Versioned tenant config, principal tenant mapping, application-isolated drafts/approvals, fail-closed policy | Need explicit live external provider execution proof only after approval; no production sends authorized |
| TC-AUD-001..002 | `eper/tests/audit-event-store.test.mjs`; `eper/tests/audit-evidence-immutability.test.mjs`; `eper/tests/persistent-audit-reporting.test.mjs`; scheduler store suite | Transactional audit append/rollback, evidence immutability and audit/report scope | Verify export/search audit coverage and integrity chain in dedicated acceptance |
| TC-TKT-001..002 | `eper/tests/ticketing-api.test.mjs`; `eper/tests/ticketing-contract.test.mjs`; `eper/tests/postgres-ticket-store.test.mjs` | Actor/application denial, tenant isolation, idempotent ticket creation, response envelope, privileged support queue scoping | Validate support role matrix against approved authority matrix |
| TC-ASSET-001 | `eper/tests/customer-assets-api.test.mjs`; `eper/tests/storage-download-adapter.test.mjs` | Tenant+actor scope, HTTPS host allowlist, audited short-lived download URL, fail-closed audit/storage behavior | Verify provider-specific integration and malware/content scanning requirements |
| TC-API-001 | `eper/tests/api-response-contract.test.mjs`; `eper/tests/api-response.test.mjs` | Standardized success/error envelope and response contract | Run against complete route inventory |
| TC-UX-001 | `eper/tests/admin-feedback-ticketing-ui.test.mjs`; `eper/tests/admin-workflow-ui.test.mjs`; `eper/tests/admin-pricing-ui.test.mjs`; `eper/tests/campaign-scheduler-wireframe.test.mjs` | Selected UI contracts and responsiveness | Accessibility/keyboard/screen-reader audit remains explicit acceptance task |
| TC-DB-001..002 | `eper/tests/postgres-core-adapters.test.mjs`; `eper/tests/postgres-transaction.test.mjs`; relevant PostgreSQL integration suites | Durable store contracts, transaction behavior, database integration | Backup/restore, failover fencing, RPO/RTO drills remain not evidenced by these suites |

## PR #273 same-head CI snapshot
Head: `690960661e4d0def87d2a527a844e0c9c0678c22`.

At snapshot time: build-and-test, release-candidate, controlled QA re-execution, container health, six-family HTTP smoke, G9 reconciliation and controlled technical UAT simulation reported success. Payment API + PostgreSQL + receipt contracts was still in progress. The 228 requirements / 38 chapter pilot matrix check was skipped on this PR. Therefore do not label the PR fully green and do not treat the skipped pilot matrix as a pass.

## Acceptance gaps to close
1. Re-run the 228/38 requirement pilot matrix on the documentation head or record a justified skip and separate approved evidence.
2. Attach same-head payment/receipt check completion and artifacts.
3. Add explicit UI accessibility acceptance, provider integration sandbox evidence, backup/restore and failover/fencing drills.
4. Complete requirement-ID-to-test-ID-to-artifact mapping against the protected 228 baseline; this document is a domain crosswalk, not a substitute for the canonical 228-row traceability register.
5. Record tester, reviewer, timestamp, environment, commit SHA, run URL, artifact URI and defect disposition for every executed case.

**Governance:** Test source files and successful CI jobs do not authorize Business UAT. Business UAT remains HOLD pending all entry gates and explicit owner authorization.
