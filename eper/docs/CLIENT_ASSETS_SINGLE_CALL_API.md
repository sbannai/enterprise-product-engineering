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
- Returns no-store JSON. The default page contains up to 100 assets; pass the opaque numeric `cursor` offset to continue when `nextCursor` is non-null.

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
      "tags": ["brief"],
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
Storage references are kept server-side and are not returned by the manifest. Actual file access must use a separate provider-specific endpoint that rechecks tenant, application, asset, and user permissions before issuing a short-lived signed URL or streaming content.

## UI behavior
The Client Assets view calls `GET /customer/assets` once when opened and renders all returned metadata. It is tenant-module gated and stays separate from admin configuration. Pagination is only needed when the returned `nextCursor` is non-null. Mobile layout and keyboard focus follow the shared customer workspace rules.

## Verification
The API regression test covers unauthenticated access, module-disabled access, tenant isolation, application assignment isolation, safe field allowlisting, cursor validation, and combined assets across assigned applications. The portal preview test asserts the Client Assets navigation and the single API route. These are source/API tests, not browser-based Business UAT evidence.
