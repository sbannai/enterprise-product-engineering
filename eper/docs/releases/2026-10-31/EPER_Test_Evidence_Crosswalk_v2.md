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

## PR #273 verified CI and artifact evidence — 31 Oct 2026

The earlier CI snapshot above was superseded by the following completed runs on the PR's current head `daac7419f670ea54753e432b5d44de1786c8e4b7` (the workflow executes the PR merge ref for its matrix artifact):

- Dedicated 228 Requirement Pilot Test Matrix: run #5444 / run ID `41202845883`, SUCCESS. Artifact `EPER-REEXEC-003-228-REQUIREMENT-TEST-MATRIX-41202845883`, artifact ID `13043083648`.
- Artifact inspection: the matrix JSON identifies merge commit `bba95c644adf99f5ca36bb0544ee030a4af71ccc`, whose second parent is PR head `daac7419f670ea54753e432b5d44de1786c8e4b7`. It records **38/38 chapters PASS**, **259/259 automated tests PASS**, and **228/228 requirement IDs** mapped to test source and named execution output with `chapterSuiteStatus=PASS`. All 228 statuses are explicitly `AUTOMATED_PILOT_TEST_PASS_NOT_BUSINESS_UAT`.
- Local pilot HTTP smoke: **28/28 checks PASS** across the **9 chapters that expose HTTP pilot apps**. The other 29 chapters have no HTTP app in this run's scope; this is not 38-chapter HTTP coverage. Checks include health, unauthenticated access denial and unknown-route handling where applicable.
- Integrated Validation run #5444 / run ID `41202845981`, attempt 2: SUCCESS. Payment API + PostgreSQL + receipt contracts, full PostgreSQL-enabled test suite, migrations and migration repeatability passed; six-family runtime, release/G9 and readiness evidence jobs passed. Its embedded 228-matrix job is intentionally skipped for pull requests; the separate matrix workflow above supplied that evidence.
- On the PR head, EPER CI, six-family HTTP smoke, G9, controlled technical simulation, container runtime smoke, release candidate build and controlled QA re-execution also completed SUCCESS.

Evidence boundaries: the matrix artifact's recorded commit is the synthetic PR merge commit, not the branch head SHA itself; its parent relationship ties it to the reviewed PR head. These are automated pilot/technical results, not business acceptance. Artifact metadata explicitly records `businessAcceptance=NOT_EXECUTED` and `formalUatSignoff=NOT_EXECUTED`.

## Acceptance gaps to close
1. Re-run the 228/38 requirement pilot matrix on the documentation head or record a justified skip and separate approved evidence.
2. Attach same-head payment/receipt check completion and artifacts.
3. Add explicit UI accessibility acceptance, provider integration sandbox evidence, backup/restore and failover/fencing drills.
4. Complete requirement-ID-to-test-ID-to-artifact mapping against the protected 228 baseline; this document is a domain crosswalk, not a substitute for the canonical 228-row traceability register.
5. Record tester, reviewer, timestamp, environment, commit SHA, run URL, artifact URI and defect disposition for every executed case.

**Governance:** Test source files and successful CI jobs do not authorize Business UAT. Business UAT remains HOLD pending all entry gates and explicit owner authorization.
