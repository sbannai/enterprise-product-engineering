# EPER Read-only Requirement Registry API v1.0.0

## Scope
This first API increment serves the canonical requirement registry already present in the application. It exposes the existing 228 requirement bindings and their BRD/SRS/chapter/capability/service/DATA/API/EVENT identifiers.

It deliberately does **not** expose the separate 388-record closure snapshot, issue status, UAT decisions, payment transactions, tenant-specific records, or any write-back endpoint. Those require separate controlled source-of-truth integrations.

## Endpoints
- `GET /v1/requirements` — filter, search, and paginate the registry.
- `GET /v1/requirements/{requirementId}` — retrieve one exact requirement binding.

## Configuration
- `EPER_REQUIREMENTS_API_ENABLED=true` enables the routes.
- `EPER_REQUIREMENTS_API_TOKEN` must contain at least 32 characters.
- Requests require `Authorization: Bearer <token>`.
- The route returns 404 when disabled, 503 when enabled but not safely configured, and 401 for missing/invalid bearer credentials.
- This is an opt-in shared-token boundary, not a full identity provider or tenant-aware RBAC implementation. Do not treat it as production-grade authentication without an approved identity integration.

## Behavior and guardrails
- Source of truth is `requirementBindings`; the service does not synthesize missing fields.
- Results sort deterministically by chapter then sequence.
- Pagination defaults to limit=25/offset=0; limit must be 1–100 and offset nonnegative.
- Supported filters: chapter, capability, pattern, SRS, and case-insensitive substring `q` (maximum 200 characters).
- All routes are GET-only. POST/PUT/PATCH/DELETE are not implemented.
- This API does not change requirement identities, statuses, acceptance decisions, or gate status.
- It does not authorize Business UAT, production payments, deployment, or chargeable AWS resources.

## Verification
The companion tests validate the 228-row baseline, deterministic pagination, filtering, record detail, authentication behavior, invalid inputs, and read-only behavior. CI must pass on the exact PR head before the implementation is considered validated.
