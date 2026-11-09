# EPER Customer-Level Asset Repository — Requirements & Design v1.0 (DRAFT)

**Requirement:** EPER-CW-060  
**Disposition:** Owner-directed additive candidate, recorded 2026-11-04  
**Priority:** MUST / P1 (proposed)  
**Status:** Draft for Product Owner confirmation; not part of the approved 228-requirement baseline  
**Scope:** Customer-wide asset library with application-level access controls for images, videos, DOCX, PPTX and XLSX.

## 1. Product intent and ownership

EPER shall provide each customer with one tenant-owned asset repository. It is the common home for customer logos, images, videos, working documents, presentations and spreadsheets. Customer-wide assets are reusable across the customer's applications, while the Customer Admin controls which applications and roles may use each asset.

This is a customer capability, not a Product Admin content-management function:

- **Product Admin** governs platform limits, permitted file formats, retention bounds, security policy and the catalogue of approved storage/scanning adapters. Product Admin has no routine access to customer file contents.
- **Customer Admin** owns the customer's library, customer-wide defaults, application sharing restrictions, role permissions, retention choices within platform policy, and tenant-wide asset administration.
- **Application Admin** administers assets and permissions only in assigned applications, within customer policy.
- **Application users** receive only the actions granted to their role and active application assignment.

Support access to customer content, if ever required, is a separate time-bound, approved and audited break-glass path. It is not implied by Product Admin privileges.

## 2. Repository and sharing model

### 2.1 Asset scopes

Every asset has exactly one ownership scope:

1. **Customer shared asset** — owned by the tenant; application_id is null. It is available to active applications according to the customer's sharing default and per-application access rule.
2. **Application-only asset** — owned by one tenant/application pair. It is never visible to another application, even in the same tenant, unless the owner deliberately creates a separate customer-shared copy. An application override cannot widen this scope.

The tenant owns the binary and metadata. Applications receive governed access, not ownership of duplicate blobs.

### 2.2 Customer-wide defaults and application overrides

- The Customer Admin sets the default for customer-shared assets: **all active applications inherit access** or **no application receives access by default**.
- Each application may have an explicit asset access rule: **INHERIT**, **ALLOW**, or **DENY**. INHERIT resolves to the customer default. ALLOW grants access only to that application. DENY blocks access even when the customer default is shared.
- An asset-specific application restriction takes precedence over the broad customer default. A deny always wins over an allow at the same scope.
- An application-only asset is restricted to its owning application and cannot be shared by changing an application setting.
- New applications inherit the current customer default; existing application exceptions remain explicit and visible.
- The UI shows effective access as **Inherited**, **Allowed for this application**, or **Restricted**. Resetting an override returns the application to INHERIT.
- Effective access is resolved server-side on every list, view, download, upload destination, share and delete request. Hiding a button is not authorization.

The inheritance chain is: Platform policy → Customer repository policy → Asset scope/default → Application asset override → Actor role permission. A lower level may narrow access, never bypass a higher-level restriction.

## 3. Role-based action permissions

Authorization is the intersection of tenant identity, active customer entitlement, active application assignment, asset/application sharing policy and the actor's role permission. Define separate permissions; do not collapse them into a generic assets-access flag.

| Role template | Upload | View/list metadata | Download | Soft delete | Manage customer defaults / sharing / role grants |
|---|---:|---:|---:|---:|---:|
| Customer Admin | Yes | Yes | Yes | Yes | Yes |
| Application Admin | Yes, assigned app only | Yes, assigned app only | Yes, assigned app only | Only when explicitly granted; never customer-wide by default | No customer-wide control |
| Contributor | Yes, assigned app only | Yes, if shared to assigned app | Yes, if separately granted | No by default | No |
| Viewer | No | Yes, if shared to assigned app | Yes, if separately granted | No | No |
| Unassigned / suspended actor | No | No | No | No | No |
| Product Admin | No routine content access | No routine content access | No routine content access | No | Platform policy only |

This is a default role template, not a hard-coded assumption about every customer's job titles. Customer Admin may configure role-to-action grants within the platform's permission ceiling. A customer cannot grant access to an actor who lacks the relevant tenant/application assignment. Deleting is separate from uploading; view/list is separate from downloading; managing sharing is separate from both.

The authorization service must check the action again at execution time, including for asynchronous upload, scan, download-grant and purge workers. Revoking a role or application assignment must immediately prevent new access grants.

## 4. In-scope formats and validation

### 4.1 Initial allowlist

| Category | Extensions | Expected detected MIME types |
|---|---|---|
| Images | .jpg, .jpeg, .png, .webp, .gif | image/jpeg, image/png, image/webp, image/gif |
| Videos | .mp4, .webm, .mov | video/mp4, video/webm, video/quicktime |
| Word documents | .docx | application/vnd.openxmlformats-officedocument.wordprocessingml.document |
| Presentations | .pptx | application/vnd.openxmlformats-officedocument.presentationml.presentation |
| Spreadsheets | .xlsx | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet |

The server detects the real media type from bytes and package structure. A browser-supplied MIME type or filename is never trusted. Extension, detected MIME and file structure must agree.

### 4.2 Reject or quarantine

- Reject executable files, scripts, HTML/SVG active content, archives not explicitly supported, legacy Office binary formats, macro-enabled Office formats (.docm, .pptm, .xlsm) and malformed or encrypted Office packages that cannot be inspected.
- Inspect OOXML ZIP structure and required package entries. Reject path traversal entries, duplicate/ambiguous package paths, macro/VBA projects, ActiveX or executable embedded objects, malformed XML, excessive entry counts, decompression bombs and configured compressed/uncompressed size or ratio violations.
- Normalize display names; strip path components and control characters. Generate opaque storage object keys server-side. Never use a user filename as a filesystem path or object key.
- Apply configurable per-format file-size limits, tenant quota, application quota, upload concurrency and request-rate limits. Product Admin defines platform ceilings; customers may choose lower limits, never higher. Exact initial numeric limits are a policy decision and must be set before upload is enabled.
- Compute SHA-256 while streaming. Do not deduplicate across tenants or expose whether another tenant has the same content.
- Serve untrusted files as attachments by default with safe content headers (Content-Disposition: attachment, X-Content-Type-Options: nosniff); do not render Office content in the application origin. Any future preview/conversion service must be isolated and separately threat-modelled.

### 4.3 Quarantine and malware scanning

The upload lifecycle is:

INITIATED → QUARANTINED → SCANNING → AVAILABLE

Terminal/exception states include REJECTED, SCAN_ERROR, DELETE_PENDING and DELETED.

- All bytes first land in a private quarantine area inaccessible to list, view, preview, download or workflow consumers.
- A required malware-scanner port scans the full file before promotion. OOXML package inspection is part of validation, not a replacement for malware scanning.
- Only a successful clean verdict from an explicitly configured scanner may promote a file to AVAILABLE.
- A scanner timeout, unavailable scanner, unsupported verdict or scanner error leaves the object quarantined and inaccessible. Never fail open.
- Persist scanner name/version, scan time, verdict and safe error code; do not persist scanner secrets or expose detailed malware signatures to ordinary users.
- Re-scan when the scanner/signature policy requires it. A newly rejected asset is immediately blocked from new access grants.
- The first local implementation must use a deterministic test scanner only in tests. A production scanner implementation must be separately selected and approved; no external scanning service is enabled by this requirement.

## 5. Upload, list, view and download behavior

### Upload

1. Authenticate the actor and resolve tenant, role and active application assignment from trusted server-side identity.
2. Verify the customer asset module entitlement, destination application, role's asset.upload permission, sharing policy and quota.
3. Stream to quarantine with bounded memory, byte-count enforcement and SHA-256 calculation.
4. Validate extension/MIME/signature/package structure; create metadata in a non-available state.
5. Scan; promote atomically only after a clean verdict.
6. Append audit evidence for initiation, completion, validation, scan verdict and promotion/failure.
7. Return asset metadata and scan state, never a raw storage key or provider credential.

### List and view

- The existing single-call customer manifest remains the customer workspace entry point; it must ultimately read durable PostgreSQL metadata rather than environment-embedded asset arrays.
- The manifest returns safe metadata only and applies tenant, application, asset-sharing and actor-role filters before pagination.
- A metadata view requires asset.view. Opening/downloadable content additionally requires asset.download.
- No storage reference, provider configuration, signed URL, secret, quarantine path or binary content appears in the manifest.

### Download

- Re-authorize tenant, active application, asset scope, sharing rule, role permission and AVAILABLE scan state for every request.
- Require a durable audit event before issuing a download grant. If audit persistence fails, do not return a URL.
- Provider grants must be HTTPS, exact-host allowlisted, credential-free and short-lived (maximum 15 minutes, consistent with the current download adapter contract).
- Revoke future access immediately on role/assignment revocation or asset deletion. A previously issued URL is bounded by its short expiry; providers that support revocation should be called through the adapter.

### Delete

- Delete is a soft-delete request first. It immediately removes the asset from manifests and denies new download grants.
- Physical deletion is asynchronous and idempotent. Retry failures with bounded backoff and surface a durable operational exception; do not silently mark an object deleted when storage confirms otherwise.
- Restore is allowed only during the configured grace period, if the object still exists, no legal hold or policy restriction blocks restoration, and the actor has explicit restore permission.
- Customer-wide deletion removes all application access; it does not create separate per-application copies.

## 6. Audit and evidence

Use the existing append-only PostgreSQL audit event boundary. Record at minimum:

- upload initiated, bytes accepted, validation passed/failed, scan started/completed/rejected/error, promotion completed/failed;
- list/view/download granted or denied, download provider failure, and expired/invalid grant;
- customer default changed, application override added/changed/reset, role permission changed, quota/retention policy changed;
- delete requested, access revoked, restore requested/completed, purge attempted/completed/failed, legal hold applied/released;
- provider configuration/health changes and administrative break-glass access.

Every event carries tenant, application when applicable, actor, role, asset ID, action, outcome, reason/error code, timestamp and correlation/request ID. Store safe before/after policy values and file metadata such as size, detected MIME and digest where appropriate. Never put file bytes, document contents, credentials, raw object keys, signed URLs or secrets in audit payloads. Denied actions are auditable. Audit failure blocks the protected operation or grant.

## 7. Storage abstraction and future providers

The PostgreSQL database stores metadata, policy, state, checksums, opaque object references and audit linkage. It does not store file bytes.

Define a vendor-neutral AssetStoragePort with operations equivalent to:

- create/write a private quarantine object (streaming, bounded);
- promote a clean object from quarantine;
- open a read stream or create a validated short-lived download grant;
- delete an object and report an idempotent result;
- inspect object existence/size/checksum for reconciliation.

Define a separate AssetMalwareScannerPort so storage and scanning providers can be changed independently. Provider-specific fields must not leak into domain models or APIs.

- Local filesystem storage is allowed only for local development and tests, with a configured root, path traversal protection, private permissions and atomic promotion.
- Future adapters may target AWS S3, Azure Blob Storage, Google Cloud Storage or an approved Dropbox integration. They remain disabled until separately approved and configured.
- Provider credentials are secret-store references, never raw values in PostgreSQL settings, asset metadata, logs or UI.
- Product Admin controls which provider adapters are permitted. Customer Admin may choose only from enabled providers if that product option is later approved.
- No provider is selected by default, no bucket/container/account is created, no cloud resource is provisioned, no real credential is requested, and no external integration is activated by this specification.
- Keep the existing IntegrationPort boundary provider-neutral. The current createStorageDownloadAdapter is download-only; it is not proof that upload, delete or a concrete cloud provider exists.

## 8. Retention, legal hold and deletion

- Product Admin defines platform minimum/maximum retention bounds, supported grace periods and tenant storage ceilings.
- Customer Admin sets a customer-wide retention policy within those bounds. An application may choose a shorter retention period; it may not extend retention beyond the customer/platform maximum.
- Each asset receives an effective retention date/policy snapshot at creation. Policy changes are versioned and audited; do not silently rewrite historical retention evidence.
- Expiry triggers access revocation and the same soft-delete/purge lifecycle as a user deletion.
- A legal hold blocks physical purge and restoration/deletion transitions that would defeat the hold. Applying/releasing a hold requires explicit permission and audit evidence.
- After the configured soft-delete grace period and legal-hold check, purge the object and non-required metadata. Retain only the minimum tombstone and audit evidence required by policy.
- Tenant offboarding revokes access immediately and starts governed deletion; legal holds and statutory retention take precedence.
- Backup copies follow the platform backup retention schedule and must expire through that schedule; UI deletion must not falsely claim that every backup copy was synchronously erased.
- Retention values and grace periods are configurable policy, not hard-coded assumptions. Upload must remain disabled if required policy is absent or invalid.

## 9. Data model and transaction boundaries

Minimum logical records:

- CustomerAssetPolicy: tenant_id, version, shared_asset_default, quota_bytes, allowed_formats, size_limits, retention_policy, updated_by, updated_at.
- ApplicationAssetPolicy: tenant_id, application_id, version, access_override, retention_override, updated_by, updated_at.
- CustomerAsset: tenant_id, asset_id, scope_type, application_id nullable, display_name, detected_mime, extension, size_bytes, sha256, storage_provider_key, opaque_object_reference, scan_state, safe scan metadata, uploaded_by, created_at, retention snapshot, deleted_at.
- CustomerAssetApplicationAccess: tenant_id, asset_id, application_id, access_mode, updated_by, updated_at.
- CustomerAssetRolePermission: tenant_id, role_key, permission_key, allowed, version, updated_by, updated_at.

The physical schema may normalize these records further, but must preserve their composite tenant/application scope and invariants.

- Enforce PostgreSQL RLS with tenant scope and application scope where applicable; FORCE RLS for runtime roles. No application may read another tenant's metadata or objects.
- Use composite foreign keys so an asset access rule cannot point across tenants or to an unassigned application.
- Use optimistic version checks for policy and role-permission changes.
- Keep metadata transitions, audit append and outbox/purge scheduling in one transaction where they share a database boundary. Blob promotion/deletion is reconciled through idempotent state transitions because object storage is not part of the PostgreSQL transaction.
- Background scanner and purge workers receive only tenant/application-scoped work context and re-authorize current policy before acting.

## 10. Suggested API and UI contract

The exact routes may align with existing API conventions, but the capability must provide equivalent operations:

| Operation | Suggested route | Required action |
|---|---|---|
| List customer/app assets | Existing GET /customer/assets | asset.view |
| Upload asset | POST /customer/assets (streaming or bounded upload session) | asset.upload |
| Update asset sharing | PATCH /customer/assets/:assetId/access | asset.manage-sharing |
| Download | Existing application-scoped download route | asset.download |
| Soft delete | DELETE /customer/assets/:assetId | asset.delete |
| Restore | POST /customer/assets/:assetId/restore | asset.restore |
| Configure customer defaults | Customer Admin settings route | asset.manage-policy |
| Configure app override | Application settings route | asset.manage-sharing |

Customer Admin UI: **Customer Workspace → Assets → Customer Library**. Show shared assets, app-only assets, effective application access, scan status, size/quota, retention date, uploader and audit history. Provide an application matrix to set INHERIT/ALLOW/DENY without copying blobs.

Application UI: **Application → Assets**. Show customer-shared assets inherited by that application plus app-only assets, with clear inherited/restricted indicators. Upload destination and available actions reflect the actor's role. Show progress, quarantine/scanning state, validation errors, empty/loading/offline states and accessible keyboard/mobile behavior.

Product Admin UI: **Platform Settings → Asset Policy** for file-format allowlist, size/quota ceilings, retention bounds and approved adapter catalogue. Do not expose customer file contents through this screen.

## 11. Acceptance criteria

1. A customer-shared asset is visible to all active customer applications when the customer default is ALL and the application rule is INHERIT.
2. A DENY override removes that shared asset from the selected application without affecting any other application.
3. With customer default NONE, only applications explicitly set to ALLOW receive a customer-shared asset.
4. An application-only asset is never visible or downloadable from another application in the same tenant.
5. A tenant cannot list, view, upload into, download, share, delete or infer the existence of another tenant's asset.
6. Each role action is independently enforced server-side; a viewer cannot upload/delete, and an upload grant does not imply delete or sharing permission.
7. Product Admin has no routine content access; break-glass access requires explicit approval and creates immutable audit evidence.
8. Only the allowlisted image/video/DOCX/PPTX/XLSX formats with matching detected MIME and valid structure are accepted.
9. MIME spoofing, renamed executables, macro-enabled Office files, malformed packages, ZIP bombs, oversized uploads and path traversal attempts are rejected.
10. No asset becomes AVAILABLE before a clean scan. Scanner timeout/unavailability/error leaves it quarantined and inaccessible.
11. The asset manifest contains safe metadata only; it never leaks object keys, credentials, binary content or signed URLs.
12. Download grants require current authorization, a clean asset, a durable audit event, an allowlisted HTTPS host and expiry no greater than 15 minutes.
13. Delete immediately revokes list/download access; purge is idempotent, retryable, auditable and blocked by legal hold.
14. Customer/application retention inheritance, expiry, soft-delete grace, legal hold and purge behavior are deterministic and auditable.
15. Storage can be replaced by another adapter without changing domain/API contracts; local filesystem is restricted to dev/test.
16. Missing storage, scanner, audit, authorization, retention or policy configuration fails closed.
17. Cross-tenant, cross-application, role, concurrency, scanner failure, storage failure, audit failure, retention and restart/recovery tests pass against real PostgreSQL where persistence is involved.
18. No AWS/Azure/GCP/Dropbox resources, credentials, external scanner, or provider integration are enabled by the implementation of this requirement without separate approval.

## 12. Current repository baseline and gap

Reviewed against main SHA 2c380d79c55c9183a42ed534ffd1a504f7d41316 on 2026-11-04:

- eper/docs/CLIENT_ASSETS_SINGLE_CALL_API.md defines a tenant/application-scoped GET /customer/assets manifest and a separately authorized download route.
- eper/apps/api/server.ts currently builds the manifest from EPER_CUSTOMER_APPLICATION_ASSETS_JSON; tenant identity, module entitlement and active tenant/actor application assignments are checked.
- eper/packages/assets/storage-download-adapter.ts provides a provider-neutral download-grant adapter with exact-host allowlisting and a maximum 15-minute TTL.
- eper/tests/customer-assets-api.test.mjs covers manifest isolation, pagination, safe metadata and the download authorization/audit boundary; eper/tests/storage-download-adapter.test.mjs covers unsafe provider grants.

Not yet evidenced in this baseline:

- durable PostgreSQL asset metadata/policy tables and RLS;
- customer-default/application-override inheritance for assets;
- role-specific upload/view/download/delete authorization;
- an upload endpoint and streaming/quarantine storage adapter;
- MIME/package validation and malware scanning;
- asset soft-delete, retention, legal hold and purge lifecycle;
- a concrete production storage or scanning provider.

Therefore the current asset manifest/download boundary is a foundation, not a completed customer asset repository. No implementation or production-readiness claim is made here.

## 13. Next implementation slice — Asset metadata and policy foundation

Implement this slice before enabling binary upload:

1. Add PostgreSQL migrations for tenant asset policy, application overrides, asset metadata, per-asset application access and role/action grants. Apply tenant/application RLS, FORCE RLS for runtime access, composite foreign keys, indexes and immutable identifiers.
2. Add a CustomerAssetPolicyResolver that resolves customer default → asset scope → application override → actor role, with DENY precedence and fail-closed behavior.
3. Add repository/service methods for metadata list, policy read/update and role-grant changes, using optimistic version checks and the existing append-only audit writer.
4. Replace the environment-JSON manifest source with the durable repository behind a feature flag, retaining the existing safe response shape and current tenant/application filters.
5. Add real-PostgreSQL tests for cross-tenant denial, shared-default inheritance, app ALLOW/DENY overrides, application-only isolation, role action separation, concurrency and audit failure.

**Slice exit gate:** all schema, RLS, policy-resolution, authorization and manifest tests pass on one exact commit; no binary upload route is enabled yet.

**Following slice (not part of this authorization):** local-development/test quarantine storage, streaming upload, validation and a required scanner port; only then add the upload API and UI. A production scanner/provider adapter, cloud resource or external integration requires separate approval.

## 14. Traceability and change control

This is additive candidate EPER-CW-060 in the cumulative EPER_PRODUCT_REQUIREMENTS_CHANGE_CONTROL_v1.7.0_DRAFT.md. It does not alter, renumber or replace the approved 228 requirements across Chapters 463–500. Map implementation across the six capability families without claiming a new exact chapter REQ-ID mapping where the source does not establish one:

- XX01 Authoritative Records — asset metadata and lifecycle.
- XX02 Authorization — tenant/application/role and sharing policy.
- XX03 Business Validation — format, quota, retention and scan gates.
- XX04 Audit Evidence — append-only asset and policy history.
- XX05 Exception Handling — quarantine, scan, storage and purge recovery.
- XX06 Governed Reporting — inventory, quota, retention and exception reporting.

Owner approval of the additive candidate and separate approval of any external provider/scanner activation remain required.
