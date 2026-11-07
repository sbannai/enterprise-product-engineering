# Build Status

**Source of truth:** GitHub `main`  
**EPER scope:** Chapters 463–500 / 228 requirements  
**Main SHA at start of this status refresh:** `9c389a0ef376a491dbfeac8706845b6a67bad381`  
**Status updated:** 2026-11-07

## Delivery and validation status

- The last independently observed successful functional CI baseline is `2c380d79c55c9183a42ed534ffd1a504f7d41316` (2026-11-03 16:36 UTC).
- Mainline now includes the customer-asset persistence schema (migrations 021–022), replay-safe policy replacement, and a PostgreSQL 16 CI replay gate. These are persistence-foundation changes, not a complete customer-facing upload feature; exact-SHA CI is still required.
- The combined-status query for the latest customer-asset implementation SHA has not yet returned check evidence through the connected integration. Do not call the latest mainline green until the push-triggered run is observed and its head SHA verified.
- The focused `.github/workflows/ci.yml` workflow is configured for `workflow_dispatch` and pushes to `main` affecting `eper/**`. A status-file push is therefore expected to trigger that lane. The run and its checked-out head SHA must be independently verified before marking the resulting mainline green.
- No workflow run for the current status-refresh commit has yet been confirmed.

## Functional scope and evidence rules

- The controlled baseline remains 228 requirements across Chapters 463–500. Do not alter this baseline without owner approval.
- Report each capability across API, UI, persistence, authorization, audit and operational dimensions; repository presence alone is not completion evidence.
- Main is the sole functional source of truth. PRs are review artifacts and must not hold functionality hostage.
- Implement complete, independently testable slices directly against current main. Do not blindly merge stacked or stale PRs.
- Keep PostgreSQL migrations replay-safe; verify RLS ENABLE/FORCE, tenant/application isolation, least-privilege grants, audit immutability and rollback behavior with real PostgreSQL integration tests where applicable.
- Historical static SQL checks or migration-runner ledger skips are not proof that migration DDL can be executed twice.

## Customer asset upload recovery — 2026-11-07 engineering update

- **Verified CI evidence:** EPER CI run [42326834172](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42326834172) completed successfully on exact main SHA `2885710f9eeca3f356d6e279dce622233bd40de6` at 2026-11-07 01:59:17 UTC. Typecheck, build, the new upload-recovery/provider-binding/migration tests, audit migration chain and PostgreSQL 16 customer-asset migration replay all passed. This validates the schema/service unit-test foundation only; it does not substitute for live PostgreSQL repository replay/identity tests or API/browser acceptance.
- Added the upload reservation service and PostgreSQL repository recovery methods directly on main. The service persists the reservation before requesting a provider capability, derives a canonical SHA-256 fingerprint from tenant/application/actor/asset/file name/MIME type/expected size, and reuses the persisted session on matching retries.
- Grant renewal is bound to the existing provider object reference. The storage adapter rejects a provider response that returns a different external object reference. Provider calls receive the stable idempotency key; signed URLs/tokens remain response-only and are not persisted.
- Added service regression coverage for reserve-before-provider ordering, matching replay, metadata conflict, provider-object mismatch, terminal session states and provider outage retry. Added adapter coverage for provider object binding.
- CI now explicitly runs the upload recovery service, storage adapter and migration contract tests. PostgreSQL 16 replay of migration 023 remains in the migration lane.
- Latest direct-main commits in this slice: `691a234` repository recovery; `9347ed6` provider object binding; `043cca9` upload service; `dbcf459` recovery service tests; `fbae15b` provider adapter tests; `dc6e0ab` focused CI test invocation.
- **Not complete:** API route wiring, exact-SHA CI execution, live PostgreSQL 16 repository integration tests for actor/application/fingerprint replay, lost-provider-response failure injection, durable denial-audit verification, and browser reload/identity-switch tests remain open. Issue #421 stays open. Do not describe this as a released upload feature or authorize Business UAT.

## Customer asset work — current mainline boundary

- 2026-11-07 follow-up: migration `023_customer_asset_upload_recovery.sql` adds a canonical request-fingerprint slot, provider-grant expiry metadata and recovery timestamp to durable upload sessions. The static migration contract test covers the metadata/no-secret contract. PostgreSQL 16 CI now replays migration 023 twice after migrations 021–022. Latest main SHA: `c5fdd997ca6c0462d3d1401f610c60a04f9a9fa7`.
- This is a **persistence prerequisite only**, not the complete retry fix: runtime service code is not present in main yet, request fingerprint computation/comparison and provider-grant reissue/resume are still outstanding. Existing sessions remain compatible because the fingerprint column is nullable during rollout; the runtime must populate it for every new reservation and fail closed on mismatched retries.

- Issue #427's migration 021 replay correction is now present on main. The CI workflow now directly executes migrations 021 and 022 twice against its PostgreSQL 16 service and asserts ENABLE/FORCE RLS, expected policies and selected grants. This remains pending an observed exact-SHA CI run.
- Issue #425 requires real PostgreSQL 16 execution, upgrade, replay, RLS, checksum and data-preservation tests for the customer-asset upload recovery migration. This remains open.
- Runtime upload reservation recovery, session binding, idempotent retries and provider-outcome recovery remain incomplete until implemented and verified on main.
- Do not mark either issue complete based on PR-only code or static checks.

## Backlog and management

- Live backlog snapshot after the 2026-11-07 purge: **29 open PRs and 31 open issues**. GitHub search classifies all 29 open PRs as Draft; 0 are ready for review. Refresh before publishing a later count.
- Purged: PR #428 (replay-safety scope superseded by main), PR #389 (comparative engine evaluation superseded by owner decision), and Issue #388 (PostgreSQL target decision recorded in ADR-EPER-DATA-001). PR #428's related validation issue #427 remains open until exact-SHA CI is observed. PR #377 remains open because its unique documentation updates are not yet in main.
- Merge policy: do not merge a Draft PR to reduce counts. For each draft, reconcile scope against main; close only if superseded/obsolete, otherwise refresh dependencies and evidence before requesting review.
- Do not mass-close PRs/issues. Close only after verifying that the scope is delivered on main or has an explicit documented disposition.
- Every status report should identify exact main SHA, commit purpose, test/run evidence, remaining risks, owner decisions and next action.

## Governance and release state

- Business UAT: **NOT AUTHORIZED / NOT EXECUTED**.
- Business acceptance: pending; automated pilot tests do not imply business acceptance.
- G9 traceability freeze: pending explicit evidence and owner disposition.
- Release authorization: pending.
- Production/operations readiness: pending.
- Certification: pending.
- Main branch protection: **NOT VERIFIED** through the connected GitHub integration; administrator confirmation required.
- PostgreSQL is the approved target persistence engine for local development and integration tests only. No cloud database or chargeable AWS resources are authorized.

## Next actions

1. Observe the PostgreSQL 16 migration replay lane on exact current main SHA; verify run ID, conclusion and diagnostic evidence.
2. Complete PostgreSQL 16 upgrade/data-preservation/RLS isolation assertions for the customer-asset schema.
3. Implement durable upload reservation recovery and verified customer-session binding as a complete mainline feature slice.
4. Wire customer-asset API and UI only after persistence and authorization behavior is proven.
5. Keep Business UAT blocked until every entry gate is evidenced and explicitly approved.

## Customer asset upload authorization — 2026-11-07 latest verified checkpoint

- Current verified main SHA for this checkpoint: `6257d74b6685c358d39210a92ce9e8c700a470ea`.
- Added `customer.asset.upload` to the durable workflow role permission allowlist and authorization query. Added `hasCustomerAssetUploadPermission()`, which resolves active roles for the exact tenant/application/actor and checks the explicit permission. It does not trust browser/OIDC role labels; invalid application scope denies before store access, and authorization-store errors propagate (fail closed).
- Added unit regressions for allowed role, no active role, missing permission, invalid scope and authorization-store outage. CI explicitly runs these tests.
- **Verified exact-SHA evidence:** [EPER CI run 42328038566](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42328038566) completed successfully on `6257d74b6685c358d39210a92ce9e8c700a470ea`. Typecheck, build, upload authorization/recovery/provider-binding tests, PostgreSQL 16 migration replay/RLS, live PostgreSQL upload recovery including durable denial audit, workflow/assignment/tariff integrations, capability conformance and UAT preflight all passed.
- Issue #421 remains open. The helper is not yet wired to a mounted customer upload route. Browser CSRF validation, PostgreSQL asset repository startup wiring, trusted provider configuration, upload grant endpoint and end-to-end browser transfer/recovery tests remain outstanding. Do not claim customer-facing upload is complete.
- Business UAT remains NOT AUTHORIZED. No cloud database or chargeable AWS resources were provisioned.

## Browser upload authorization composition — 2026-11-07

- Added `authorizeCustomerAssetUploadBrowserRequest()` to compose the security boundary in the required order: validate the session-bound double-submit CSRF token and exact Origin first; resolve the live PostgreSQL browser session and tenant/application plus actor/application membership second; then resolve active durable role assignments and require explicit `customer.asset.upload` permission.
- The helper never consumes a browser/OIDC role label. Identity and role stores are re-read for each request; store failures propagate and cannot be interpreted as permission grants.
- Added regressions for origin mismatch, missing/duplicate CSRF cookies, successful durable role authorization, missing actor/application assignment, missing upload permission and authorization database outage. CI now includes this new test file.
- Commits: `e564c016382da4894ab0ca061a97dd1bd847d4b0` (guard), `1f9bf316ac9c238bdccec84735b22763c19cffeb` (tests), `f5d5b7b42536e28f959675fa059994dd1e00fa96` (CI invocation).
- **Verified exact-SHA evidence:** EPER CI [run 42328489630](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42328489630) completed successfully on `5f4ad534f3740481fca4c2eb14f98e9fda226be4`. Typecheck, build, the focused upload recovery/provider-binding and newly added browser authorization tests, PostgreSQL 16 migration replay/RLS, live upload recovery with durable denial audit, workflow/assignment/tariff integrations, capability conformance and UAT preflight passed.
- **Not yet mounted:** this is a reusable authorization boundary, not a live upload endpoint. Main API routing, provider grant construction, durable asset repository injection, upload audit and browser transfer/recovery remain outstanding. Issue #421 remains open; Business UAT remains unauthorized.

## Customer asset upload API startup dependency wiring — 2026-11-07

- Added opt-in `EPER_CUSTOMER_ASSET_UPLOAD_API_ENABLED`. When enabled, main process includes PostgreSQL in the database startup path, requires durable browser identity/session, tenant+actor application assignments, OIDC/CSRF configuration and PostgreSQL audit, enables the durable workflow role/permission stores, constructs `PostgresCustomerAssetRepository`, and runs its schema/recovery readiness checks before serving.
- The API factory independently rejects startup if the upload feature is enabled without the required durable asset, identity, assignment, role and audit dependencies. No legacy bearer-map or browser role-label fallback is accepted by this feature's startup contract.
- Added `customer-asset-upload-readiness.test.mjs` and included it in focused CI.
- **Verified exact-SHA evidence:** [EPER CI run 42328799134](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42328799134) completed successfully on `efe2d41349d96a2b2519a79695ab9b3ca11eb999`. Typecheck, build, upload authorization/recovery/provider/readiness regressions, PostgreSQL 16 migration replay/RLS, live upload recovery with durable denial audit, workflow/assignment/tariff integrations, capability conformance and UAT preflight passed.
- This is dependency construction and startup hardening, not a mounted upload-grant endpoint. No storage provider is configured or called; no signed capability is issued. Grant route, provider registry binding, browser transfer and recovery acceptance tests remain open under Issue #421. Business UAT remains unauthorized.

## Customer asset upload-grant API endpoint — 2026-11-07

- Mounted `POST /customer/applications/{applicationId}/assets/{assetId}/upload-grant` behind `EPER_CUSTOMER_ASSET_UPLOAD_API_ENABLED=true`.
- Authorization sequence: session-bound CSRF and exact trusted origin first; then durable browser session, tenant/application assignment, actor/application assignment, and explicit application-scoped `customer.asset.upload` role permission. Authorization-store failures return 503; no browser/OIDC role label is trusted.
- Request requires a positive safe-integer `expectedSizeBytes`, bounded file metadata and a validated `Idempotency-Key`. PostgreSQL upload reservation is completed before any provider call. The provider-neutral adapter enforces HTTPS, exact allowlisted hostname, no embedded URL credentials, bounded 15-minute TTL, safe header names/values, and stable provider object reference on recovery.
- Response includes only upload session ID and short-lived upload capability. Provider object reference and internal persistence identifiers are not returned. Provider adapter absence or missing host allowlist returns 503 and does not create a reservation.
- Added API regressions for CSRF/origin rejection before database access and successful authorization followed by fail-closed provider-unavailable behavior.
- **Verified exact-SHA CI:** [EPER CI run 42329222347](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42329222347) passed on `5f797bd60701d8d3f00b8383c0fe5c2fc2751400`: typecheck, build, focused asset tests, PostgreSQL 16 migration replay/RLS, live upload recovery, workflow/assignment/tariff integration, capability conformance and UAT preflight.
- Same-SHA controlled technical simulation, RE-EXEC-001 QA, G9 reconciliation, six-family HTTP smoke, container runtime smoke and 228-requirement pilot matrix also passed. Integrated validation and customer OIDC browser E2E were still running at time of this status update.
- **Not complete:** production `main.ts` has no trusted storage provider adapter injected, so this endpoint intentionally returns 503 until a reviewed provider integration and exact host allowlist are configured. Browser-to-provider binary transfer and provider completion/scan lifecycle tests remain outstanding. Business UAT remains unauthorized.
