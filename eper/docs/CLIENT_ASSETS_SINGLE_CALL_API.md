# Client Assets API — single-call loading contract

## Purpose
The customer workspace loads the authorized asset manifest for all applications assigned to the signed-in tenant through one request. The browser must not fan out into separate document, video, image, and storage-provider listing calls.

## Endpoint
`GET /customer/assets`

- Enabled only when `EPER_CUSTOMER_ASSETS_API_ENABLED=true`.
- Requires a bearer credential mapped server-side through `EPER_CUSTOMER_ACCESS_IDENTITIES_JSON`.
- Requires the `client-assets` module in `EPER_CUSTOMER_WORKSPACE_MODULES_JSON` for the trusted tenant.
- Derives the tenant and allowed application IDs from server-side identity and `EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON`. Request headers and query parameters cannot override that scope.
- Reads metadata from `EPER_CUSTOMER_APPLICATION_ASSETS_JSON`, shaped as tenant ID → application ID → asset array.
- Returns metadata for the assigned applications only. Unknown or invalid asset entries are omitted; missing/malformed server configuration fails with a service error.
- Returns no-store JSON. The default page contains up to 100 assets; pass the opaque numeric `cursor` offset to continue when `nextCursor` is non-null. The customer workspace follows `nextCursor` automatically through the same endpoint until all pages have loaded.

## Response shape
```json
{
  "assets": [
    {
      "id": "asset-123",
      "applicationId": "application-456",
      "name": "Project brief.pdf",
      "type": "document",
      "mimeType": "application/pdf",
      "sizeBytes": 2048,
      "tags": ["brief"]
    }
  ],
  "total": 1,
  "applicationCount": 1,
  "nextCursor": null
}
```

Supported types: `document`, `video`, `image`, `audio`, `other`. Only explicit safe metadata fields are returned. Provider credentials, arbitrary configuration fields, storage references, and binary data must never be included in this response.

## Download boundary
Storage references are kept server-side and are not returned by the manifest. `GET /customer/applications/:applicationId/assets/:assetId/download` rechecks the trusted tenant identity, `client-assets` module entitlement, application assignment, and asset membership on every request. It delegates storage access to the injected `assetDownloadResolver` provider adapter; the adapter receives the server-side reference and must return an HTTPS URL expiring within 15 minutes. When `EPER_AUDIT_PERSISTENCE=postgres` and the shared capability pool are configured, the API uses the append-only PostgreSQL audit event store by default; deployments may inject an `assetAuditWriter` for an approved durable writer. The audit environment must be explicitly set to `sandbox`, `uat`, or `production`. No provider adapter or durable audit writer means the endpoint fails closed with a service error. The response contains only the short-lived URL, expiry, and file name. Successful, denied, and provider-failure outcomes are recorded; audit failure prevents a URL from being returned. This adapter boundary does not claim AWS, Azure, Google Drive, or Dropbox is configured until a real provider implementation is connected.

## Provider adapter contract

The reusable `createStorageDownloadAdapter` in `packages/assets/storage-download-adapter.ts` wraps the existing asynchronous `IntegrationPort` contract. The API can receive the concrete asynchronous port through `createAppServer({ assetStoragePort })`. Configure `EPER_ASSET_STORAGE_ALLOWED_HOSTS_JSON` as a JSON array of exact hostnames, for example `[\"assets.example.test\"]`; an absent, malformed, or empty allowlist leaves the adapter disabled. An explicitly injected `assetDownloadResolver` takes precedence for controlled integrations and tests. A deployment must inject a concrete provider port and an explicit exact-host allowlist; the adapter does not assume a cloud vendor or enable storage by itself. It forwards the server-resolved tenant/application/asset context and correlation ID, then fails closed unless the provider returns an allowlisted HTTPS URL with no embedded credentials and an expiry in the future within the configured maximum (never more than 15 minutes). Provider errors and invalid grants return no URL. The route remains responsible for tenant authorization and durable audit-before-response. Until a concrete provider is configured, downloads remain unavailable rather than falling back to public or unsigned links.

## UI behavior
The Client Assets view calls `GET /customer/assets` when opened and renders all returned metadata. It is tenant-module gated and stays separate from admin configuration. Pagination is only needed when the returned `nextCursor` is non-null; the browser follows cursors through the same endpoint. Each asset card exposes a Download action that calls `GET /customer/applications/:applicationId/assets/:assetId/download` with the in-memory bearer credential. The UI opens the provider URL only after the API grants it, never reads storage references from the manifest, and displays a status message for failures. The API independently rechecks tenant, module, application assignment, asset membership, allowed HTTPS URL and expiry, and durable audit logging. If pop-ups are blocked, the UI asks the user to allow them rather than requesting a download invisibly. Mobile layout and keyboard focus follow the shared customer workspace rules.

## Verification
The API regression test covers unauthenticated access, module-disabled access, tenant isolation, application assignment isolation, safe field allowlisting, cursor validation, combined assets across assigned applications, and the download route’s authorization/audit boundary. The portal preview test asserts the Client Assets navigation and the single API route. These are source/API tests, not browser-based Business UAT evidence.
