# EPER Customer Asset Repository Design v1.0 (DRAFT)

- **Status:** Foundation schema committed for review; runtime upload integration is not complete.
- **Date:** 2026-11-04
- **Scope:** Customer-wide asset repository and controlled application-level references.
- **Storage:** Provider-neutral adapter boundary; binary content remains outside PostgreSQL.
- **Governance:** Additive design; no change to the approved 228 requirements / 38-chapter baseline.

## 1. The three scopes

EPER distinguishes three related but non-interchangeable concepts:

1. **Customer repository asset** — metadata and opaque storage reference owned by one tenant. It can be shared with applications only through explicit links and authorization.
2. **Application-restricted asset** — asset metadata owned by one tenant and one application. It must not be discoverable through the customer-wide shared repository.
3. **Application asset reference** — explicit link from an application to a customer-shared asset. A link does not copy the binary object; it grants a governed reference to the same asset.

A shared asset is not automatically visible to every application in a tenant. Customer Admin or another explicitly authorized actor must create a link. Every application read/download rechecks tenant, application, actor and resource authorization.

## 2. Existing implementation discovered

The repository already contains:
- `GET /customer/assets` metadata manifest with pagination and tenant/application assignment filtering.
- Safe metadata projection that does not expose opaque storage references.
- An injected provider-neutral download adapter that requires HTTPS, exact host allowlisting and a short TTL.
- Download route tests for tenant/application checks and audit-before-response behavior.

Current limitation:
- The manifest source is `EPER_CUSTOMER_APPLICATION_ASSETS_JSON`, with related workspace-module and assignment configuration.
- This is configuration-backed fixture/runtime data, not a durable PostgreSQL asset repository.
- The current manifest is application-centric; customer-shared assets and explicit application links are not represented as a durable domain model.
- The current adapter supports downloads, not a complete upload lifecycle.

Do not report the existing endpoint as a complete upload repository.

## 3. Durable data model foundation

Migration `021_customer_asset_repository.sql` introduces:

### `eper_customer_assets`
- Composite tenant + asset identity.
- Scope: `customer_shared` or `application_restricted`.
- Owner application only for application-restricted assets.
- Display and original file names, category, MIME type, extension and size.
- SHA-256 checksum when computed.
- Provider adapter key and opaque storage object reference; never a public URL or provider credential.
- Upload state, scan state and lifecycle state kept separate.
- Version, actor and timestamps; soft deletion attribution.
- JSON metadata constrained to an object and reserved for non-sensitive descriptive metadata.

### `eper_customer_asset_application_links`
- Explicit tenant/application/asset relationship.
- Actor, reason and idempotency key.
- Composite foreign key to the tenant-owned asset.
- No cascading delete; referenced assets cannot disappear underneath application records.

### `eper_customer_asset_upload_sessions`
- Upload session identity and asset reservation.
- Expected and received byte counts with database bound.
- Opaque provider upload reference only.
- Expiry, state and idempotency key.
- No provider secrets or binary content in PostgreSQL.

All three tables force row-level security. Tenant context is mandatory; application links additionally require matching application context. Service-layer authorization remains mandatory even when RLS passes.

## 4. Upload lifecycle

1. **Authorize and reserve:** verify tenant, actor, role, customer asset entitlement, allowed scope, quota and application assignment (if application-restricted). Create asset metadata and idempotent upload session in PostgreSQL.
2. **Issue upload capability:** injected storage adapter returns a narrowly scoped, short-lived upload capability. The API must not expose provider credentials or permanent object URLs.
3. **Transfer:** use bounded/resumable upload where supported. Enforce configured maximum bytes and permitted extension/MIME combinations before and during transfer.
4. **Verify:** provider completion is not sufficient. Verify object existence, actual byte count, checksum and detected content type.
5. **Scan:** quarantine by default until malware/content scanning reports clean. Unknown, failed or unavailable scan results do not become downloadable.
6. **Publish:** transition asset to available only after verification and policy checks; write durable audit evidence.
7. **Reference:** authorized Customer Admin or application actor explicitly links a customer-shared asset to an application. Link creation is idempotent and audited.
8. **Download:** reauthorize every request, issue a short-lived HTTPS grant through the allowlisted provider adapter, and complete audit persistence before returning the grant.
9. **Delete / retention:** soft-delete or retention transition first. Physical purge is a separate, policy-driven, audited worker action and must respect legal holds and references.

## 5. Supported file categories

The customer requirement includes:
- Images.
- Videos.
- DOCX.
- PPTX.
- XLSX.

The runtime must use a configurable allowlist of exact MIME types and extensions. Extension alone is not trusted. The detected content type, filename, declared MIME, file size and scanning outcome must be reconciled. Archive/container formats require decompression-bomb limits and safe parser policies if preview/indexing is later added.

No fixed maximum upload size is approved by this design. Customer-level quotas, per-file size limits, video duration limits and allowed MIME mappings remain explicit configuration decisions; missing policy means reject or leave upload unavailable, not silently permit unbounded uploads.

## 6. Security and tenant isolation

- Tenant identity is derived from authenticated server-side identity.
- Never accept tenant ID as an authority claim from request JSON.
- Every operation checks tenant + actor + role + resource scope.
- Application references require an explicit link and current application authorization.
- Random asset IDs are identifiers, not bearer permissions.
- RLS is defense in depth; it does not replace application authorization.
- Provider object references remain server-side.
- Upload/download capabilities are short-lived, scoped and never logged.
- No binary body, provider token, signed URL or secret is placed in audit payloads.
- Audit events include actor, tenant, asset, action, outcome, reason, request/correlation and policy decision metadata.
- A failed audit write fails the corresponding security-sensitive action closed.
- Quarantined, rejected, expired, deleted or not-yet-scanned assets cannot be downloaded.

## 7. API contract to implement

| Operation | Purpose | Required controls |
|---|---|---|
| `POST /customer/assets` | Create pending customer-shared or application-restricted asset metadata | Customer Admin/asset-manager role, tenant/application assignment, MIME allowlist, size cap, durable audit |
| `POST /customer/applications/{appId}/assets/{assetId}/uploads` | Issue a short-lived upload grant and reserve the upload session | Customer Admin/asset-manager role, pending asset metadata match, tenant/application assignment, idempotency, provider allowlist, durable audit |
| `POST /customer/assets/uploads/{id}/complete` | Verify transfer and queue scanning | Tenant/session match, checksum and size verification |
| `GET /customer/assets` | List customer-shared repository | Tenant-scoped pagination and actor authorization |
| `GET /customer/assets/{id}` | Read safe metadata | Tenant + asset scope |
| `POST /customer/applications/{appId}/assets/{assetId}/link` | Link shared asset to application | Customer Admin/authorized role, application assignment, idempotency |
| `DELETE /customer/applications/{appId}/assets/{assetId}/link` | Revoke application reference | Authorization, audit, preserve underlying asset |
| `GET /customer/applications/{appId}/assets` | List linked and application-restricted assets | Tenant + application + actor authorization |
| `POST /customer/applications/{appId}/assets/{assetId}/download` | Obtain short-lived download grant | Reauthorize, clean scan state, allowlisted HTTPS, audit-before-response |

The existing `GET /customer/assets` manifest remains compatible while a durable repository-backed path is introduced behind an explicit feature/persistence mode. No silent fallback from PostgreSQL to environment JSON is allowed in durable mode.

## 8. Storage abstraction

The storage port must support provider-neutral operations:
- Initiate bounded upload / multipart upload.
- Complete or abort upload.
- Inspect object metadata and checksum.
- Create short-lived scoped upload/download grants.
- Delete an object under an audited purge decision.

Provider configuration belongs to the customer's configured integration settings, but secrets remain in the approved secret-management boundary. Storage provider selection must not leak into domain identifiers or client contracts.

## 9. Functional and security acceptance

1. Customer A cannot list, read, link, download or delete Customer B assets.
2. Customer-shared asset is not visible inside an application until an explicit link exists.
3. Application-restricted asset cannot be linked into another application.
4. Actor with application access cannot automatically enumerate all customer repository assets.
5. Revoking a link removes application access without deleting the shared asset.
6. Removing an application assignment immediately blocks its actor's access.
7. Duplicate upload reservation with same idempotency key returns the same logical session or a conflict if payload differs.
8. Upload cannot exceed reserved size, tenant quota or configured file policy.
9. Mismatched MIME, extension, checksum or object size prevents publication.
10. Pending, quarantined, infected, failed or expired uploads cannot be downloaded.
11. Provider upload/download grants must be HTTPS, allowlisted and short-lived.
12. Audit failure prevents upload completion, link mutation and download grant disclosure.
13. A tenant/application RLS context mismatch returns no rows and cannot mutate records.
14. Concurrent link/unlink or delete operations do not create dangling references.
15. Retention/purge respects legal hold and emits durable actor/policy evidence.
16. No provider secret, signed URL, binary content or raw object reference appears in logs or audit payloads.

## 10. Delivery status and boundaries

| Slice | Status |
|---|---|
| Existing application asset manifest and download adapter | Present; configuration-backed manifest |
| Durable metadata, explicit links and upload-session schema | Migration added in this PR; requires PostgreSQL execution/integration validation |
| PostgreSQL repository/store implementation | Not implemented |
| Provider-neutral upload capability adapter and audited reservation API | Implemented behind injected provider port; live provider wiring pending |
| Provider-side object verification and upload completion API | Not implemented |
| Malware scanning and quarantine worker | Not implemented |
| Customer repository and application UI | Not implemented |
| Durable audit wiring for all repository operations | Not implemented |
| Production readiness / Business UAT | Not authorized |

This migration is a foundation, not a complete feature. No upload provider is selected, no external dispatch is enabled, and no cloud infrastructure is provisioned.


## 10. PostgreSQL runtime integration and upload lifecycle

The implementation branch now includes a PostgreSQL metadata repository and an explicit API selection boundary.

- `EPER_CUSTOMER_ASSET_PERSISTENCE=legacy` retains the existing configuration-backed manifest for compatibility.
- `EPER_CUSTOMER_ASSET_PERSISTENCE=postgres` selects `PostgresCustomerAssetRepository`; API startup requires the repository schema and PostgreSQL durable audit mode. It must never fall back to the legacy JSON manifest.
- The `GET /customer/assets` manifest intersects active tenant application assignments with active actor application assignments, then reads each permitted application through the repository. Only safe metadata is returned.
- Migration 021 now defines the non-login `eper_customer_asset_access` least-privilege role. Asset SELECT/UPDATE RLS is application-scoped: restricted assets require matching owner application; shared assets require an explicit application link. Upload-session rows carry their application ID and are isolated by both tenant and application context. Shared-only link scope is enforced by a composite foreign key plus CHECK constraint, not an RLS-bypassing trigger.
- Creating a shared asset automatically links it to the creating application in the same transaction; sharing it with another application remains an explicit link operation.
- The repository is wired into the API runtime. The migration is delivered through the existing audit migration runner; deployments must apply and verify migration 021 before enabling PostgreSQL asset mode.
- Upload completion checks the reserved actor, expiry, expected byte count and declared MIME type. It records the supplied SHA-256 and moves the asset to `scanning` when scan status is pending.
- A separate trusted scanner result operation records clean, infected, error or not-required outcomes. Only clean or explicitly not-required results make an asset available. Infected and scan-error results are quarantined. Duplicate identical scanner callbacks are idempotent; conflicting outcomes fail closed.
- Scanner identity is represented as a service actor in the audit trail. The scanner operation must be callable only from an authenticated provider callback or trusted worker boundary; this repository method is not itself an authentication mechanism.

### Runtime and evidence boundaries

This repository does not yet transfer binary bytes, calculate the checksum from the received stream, inspect file signatures/content, issue upload grants, run an antivirus engine, or implement an actual cloud storage adapter. The current completion method validates metadata supplied by its trusted caller. Those provider and streaming controls remain required before production readiness.

The PostgreSQL integration test is opt-in when `EPER_PAYMENT_DATABASE_URL` or `DATABASE_URL` is configured. A skipped integration test is not evidence of database behavior. Static migration checks and API tests using an injected repository are separate evidence classes from a live PostgreSQL integration run.

### Upload reservation API implementation update (2026-11-04)

- Added `POST /customer/assets` for pending metadata creation and `POST /customer/applications/{appId}/assets/{assetId}/uploads` for upload reservation. Both resolve the authenticated identity, require the `customer-admin` or `customer-asset-manager` role, verify the `client-assets` module and tenant/application plus actor/application assignment, and require PostgreSQL asset persistence with durable audit. Metadata creation requires explicit configured MIME allowlist, per-file byte cap and storage adapter key; tenant ID is always derived from identity.
- Added a provider-neutral upload adapter over `IntegrationPort`. It requires an opaque provider-side upload reference, HTTPS URL, exact configured host allowlist, PUT/POST method, safe headers and a capability lifetime no longer than 15 minutes.
- Added upload orchestration that first checks the pending asset’s persisted filename, MIME type and size, issues the provider capability, persists the opaque provider reference and idempotent upload reservation with transactional audit, and only then returns the signed capability to the caller. The provider reference is never returned to the browser. If an idempotency replay resolves to a different persisted session ID, the API returns a conflict rather than returning a fresh grant bound to the wrong session; safe session-resume/reissue behavior remains to be implemented.
- The API is deliberately fail-closed when no upload provider port is injected. The current application bootstrap does not select or configure a real storage vendor, and no external provider or cloud resource has been provisioned. API tests inject a fake provider and repository; they are contract tests, not live provider or PostgreSQL evidence.
- Added `POST /customer/applications/{appId}/assets/{assetId}/uploads/{sessionId}/complete`. It resolves the session and opaque provider reference from PostgreSQL under tenant/application RLS, checks the initiating actor, then invokes a provider-neutral server-to-server verification port. Only provider-observed object existence, byte count, detected MIME type and SHA-256 checksum are passed to the transactional repository completion method. The client cannot supply or override these values.
- Successful verification moves the asset only to `scanning` with scan status `pending`; it does not make the asset downloadable. A trusted scanner must separately record a clean result before availability. The verification adapter and API tests use fake provider/repository implementations; no real storage vendor or cloud resource is configured.
