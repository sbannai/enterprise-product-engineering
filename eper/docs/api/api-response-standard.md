# EPER API Response Standard

**Status:** normative target contract for JSON APIs. Legacy compatibility is preserved by default; clients opt into the versioned contract with `Accept: application/vnd.eper.v1+json` while route families complete their explicit migration and tests.

## 1. Principles

- Use HTTP status codes for transport/API outcome; do not return HTTP 200 for failed operations.
- Use stable machine-readable error codes in `error.code`; human-readable text belongs in `error.message`.
- Keep validation details structured and safe for clients; never expose stack traces, SQL, secrets, or internal exception messages.
- Return a request/correlation identifier where available. Clients should send `X-Correlation-ID`; validate length/characters and generate one when absent.
- Preserve existing successful payloads during incremental migration unless a versioned API change is approved.
- Keep tenant-scoped APIs fail-closed and return the same response shape for authorization errors across modules.

## 2. Standard success envelope

All new JSON endpoints MUST use:

```json
{
  "success": true,
  "data": {},
  "meta": { "requestId": "opaque-request-id" }
}
```

`data` is endpoint-specific. Prefer consistently including `meta.requestId`.

## 3. Standard error envelope

All new JSON endpoints MUST use:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is invalid.",
    "details": [{ "field": "title", "code": "REQUIRED" }]
  },
  "meta": { "requestId": "opaque-request-id" }
}
```

Omit `details` when not applicable. Never put sensitive values in messages or validation details.

## 4. HTTP status mapping

| HTTP | Meaning | Typical error code |
|---|---|---|
| 200 | Successful read/update | — |
| 201 | Resource created | — |
| 202 | Accepted for asynchronous processing | — |
| 204 | Success with no response body | — |
| 400 | Malformed request or invalid path/query/body | `BAD_REQUEST` / `VALIDATION_ERROR` |
| 401 | Missing/invalid authentication | `UNAUTHENTICATED` |
| 403 | Authenticated but not permitted/entitled | `FORBIDDEN` |
| 404 | Route or resource not found | `NOT_FOUND` |
| 405 | Method unsupported | `METHOD_NOT_ALLOWED` |
| 409 | State/version/idempotency conflict | `CONFLICT` |
| 413 | Request too large | `PAYLOAD_TOO_LARGE` |
| 415 | Unsupported media type | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | Well-formed request cannot be processed | `UNPROCESSABLE_REQUEST` |
| 429 | Rate limit exceeded | `RATE_LIMITED` |
| 500 | Unexpected internal failure | `INTERNAL_ERROR` |
| 503 | Required dependency/configuration unavailable | `SERVICE_UNAVAILABLE` |

Choose the most accurate status for each endpoint; don't relabel domain-specific conditions without checking clients and tests.

## 5. Content negotiation and compatibility

- The canonical media type is `application/vnd.eper.v1+json`; media-type matching is case-insensitive and ignores parameters and other comma-separated Accept values.
- On shared `sendJson()` routes, v1 negotiation wraps 2xx bodies as `{ success: true, data, meta: { requestId } }` and maps 4xx/5xx responses to the standard error envelope.
- Without v1 negotiation, the existing legacy success and error body shapes remain unchanged. This is deliberate compatibility behavior, not standard conformance for legacy clients.
- Endpoints that write non-JSON responses or bypass `sendJson()` (including HTML pages, specialized health/build probes, and non-JSON PDF receipt downloads) require their own documented contract and route-specific regression tests; do not assume the shared bridge covers them.
- A `204` or `205` response MUST be bodyless. Do not use a success envelope for either status.

## 6. Migration rules

1. Introduce shared response/error helpers and request-ID handling.
2. Adopt the standard for new endpoints first.
3. Add contract tests for status, content type, envelope and absence of sensitive fields.
4. Migrate existing endpoint families one at a time, updating clients and tests together.
5. Treat envelope changes as API-contract changes; don't silently break existing consumers.
6. Track migrated endpoints and legacy exceptions in an API conformance matrix.

## 7. Shared implementation and first adoption

`apps/api/api-response.ts` provides `sendApiSuccess()` and `sendApiError()` for the standard envelope, safe request IDs (`X-Correlation-ID` is accepted only when it matches the character/length policy; otherwise a UUID is generated), and an `X-Request-ID` response header. The standard helpers validate HTTP status ranges and machine-readable error codes, sanitize field-level error details, and emit no body for HTTP 204. The customer session, workspace-module discovery, and Help Center/Growth Hub content endpoints are the first adopters. The shared legacy `sendJson()` path now propagates a validated/generated `X-Request-ID` on JSON responses. For clients that send `Accept: application/vnd.eper.v1+json`, shared `sendJson()` routes negotiate both standardized success and error envelopes while preserving legacy success/error bodies for clients that omit the media type. Contract tests cover both success and error negotiation, request IDs, response headers, and legacy compatibility. This shared bridge does not automatically cover handlers that bypass `sendJson()`.

## 8. Current implementation gap

EPER's shared `sendJson()` helper standardizes response headers and request correlation and supports opt-in v1 success/error envelopes across routes that use it. Default legacy bodies remain route-specific. Dedicated payment JSON responses now use the same negotiated v1 envelope helper and have a tenant-denial regression test. PDF receipt downloads, health/build probes, HTML responses, and other direct response writers remain separate conformance items until verified by their own tests. The conformance matrix is the evidence register; do not claim universal endpoint conformance from the shared bridge alone. Migrate each route family with its clients and regression tests; do not mass-rewrite successful payloads in a breaking commit.
