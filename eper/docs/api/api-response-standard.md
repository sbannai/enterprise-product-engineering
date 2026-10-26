# EPER API Response Standard

**Status:** proposed standard for incremental adoption. Existing endpoint payloads are not all migrated yet.

## 1. Principles

- Use HTTP status codes for transport/API outcome; do not return HTTP 200 for failed operations.
- Use stable machine-readable error codes in `error.code`; human-readable text belongs in `error.message`.
- Keep validation details structured and safe for clients; never expose stack traces, SQL, secrets, or internal exception messages.
- Return a request/correlation identifier where available. Clients should send `X-Correlation-ID`; validate length/characters and generate one when absent.
- Preserve existing successful payloads during incremental migration unless a versioned API change is approved.
- Keep tenant-scoped APIs fail-closed and return the same response shape for authorization errors across modules.

## 2. Standard success envelope

New endpoints should use:

```json
{
  "success": true,
  "data": {},
  "meta": { "requestId": "opaque-request-id" }
}
```

`data` is endpoint-specific. Prefer consistently including `meta.requestId`.

## 3. Standard error envelope

New endpoints should use:

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

## 5. Migration rules

1. Introduce shared response/error helpers and request-ID handling.
2. Adopt the standard for new endpoints first.
3. Add contract tests for status, content type, envelope and absence of sensitive fields.
4. Migrate existing endpoint families one at a time, updating clients and tests together.
5. Treat envelope changes as API-contract changes; don't silently break existing consumers.
6. Track migrated endpoints and legacy exceptions in an API conformance matrix.

## 6. Shared implementation and first adoption

`apps/api/api-response.ts` provides `sendApiSuccess()` and `sendApiError()` for the standard envelope, safe request IDs (`X-Correlation-ID` is accepted only when it matches the character/length policy; otherwise a UUID is generated), and an `X-Request-ID` response header. Contract tests cover envelope shape, status, headers, correlation behavior, and error details. The customer session, workspace-module discovery, and Help Center/Growth Hub content endpoints are the first adopters. Their success payloads are now under `data`; errors use `error.code` and `error.message`. Other route families retain legacy response bodies until their clients and tests can be migrated together.

## 7. Current implementation gap

EPER's current `sendJson()` helper standardizes selected headers, but success bodies and errors still vary by route. This document is a proposed target contract, not a claim that all existing routes conform. Extend or pair `sendJson()` with shared response builders in a focused follow-up rather than mass-rewriting all routes in one risky commit.
