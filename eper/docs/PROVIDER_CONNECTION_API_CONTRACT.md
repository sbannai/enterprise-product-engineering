# Provider Connection API Contract

**Status:** Implemented API slice; synthetic-only credential lifecycle. This document describes the current PR implementation, not a claim of production provider integration.

## Scope and trust boundary

All customer routes are application-scoped:

- `GET /customer/applications/{applicationId}/provider-connections`
- `POST /customer/applications/{applicationId}/provider-connections/{connectionId}/bind`
- `POST /customer/applications/{applicationId}/provider-connections/{connectionId}/validate`
- `POST /customer/applications/{applicationId}/provider-connections/{connectionId}/rotate`
- `POST /customer/applications/{applicationId}/provider-connections/{connectionId}/revoke`

The server derives tenant and actor identity from the durable OIDC browser session. It does not accept tenant, actor or role identity from request JSON. Each request rechecks active tenant-application assignment, actor-application assignment and the durable application role grant for the requested provider permission. Mutations require same-origin CSRF validation and receive a server-resolved correlation ID.

The connection read model contains safe metadata only. Secret references, credentials, access tokens and provider payloads are not returned.

## Operation behavior

| Operation | Required permission | Request body | Behavior |
|---|---|---|---|
| List | `provider.connection.read` | None | Lists only connections explicitly bound to the requested application |
| Bind | `provider.connection.bind` | `allowedCapabilities: string[]` | Creates or updates the application binding; an unvalidated connection remains `PENDING_VALIDATION` |
| Validate | `provider.connection.validate` | None | Validates server-side against the exact tenant/application/connection binding |
| Rotate | `provider.connection.rotate` | `expectedVersion: number`, `secretReference: synthetic://...` | Increments connection version, sets `PENDING_VALIDATION`, suspends binding; revalidation is required |
| Revoke | `provider.connection.revoke` | `expectedVersion: number` | Marks connection and its binding `REVOKED` |

## Concurrency and cross-application safeguards

Rotation and revocation change the connection resource, not just an individual application's local settings. The current application role model has no tenant-wide provider-administration grant. Therefore the repository accepts either operation only when the connection has exactly one application binding and that binding is the requesting application. If multiple application bindings exist, the operation fails with `PROVIDER_CONNECTION_SHARED_BINDING_ADMIN_REQUIRED`. This is deliberately fail-closed; it prevents one application's administrator from interrupting another application's integration.

Rotation and revocation use optimistic `expectedVersion` checks inside the same PostgreSQL transaction as the state update and audit event. A stale version returns a conflict and does not mutate the connection.

## Synthetic-only lifecycle boundary

The current runtime uses a synthetic secret resolver and a version-pinned synthetic validation adapter. Validation, rotation and revocation lifecycle endpoints are enabled only when `EPER_PROVIDER_VALIDATION_API_ENABLED=true` and `EPER_PROVIDER_VALIDATION_MODE=synthetic`; these endpoints are disabled in production. Rotation accepts only a `synthetic://` reference. No real provider network call, real credential ingestion, or production secret-manager write is implemented by this slice.

## Persistence and audit

PostgreSQL transaction context includes tenant and application identifiers. Validation snapshot reads require the exact active/pending application binding. Validation success activates that binding; failure suspends it. Rotation suspends the binding; revocation revokes it. State changes, validation history and audit events are committed atomically. Audit records use the actual customer application ID and never include secret material.

## Deliberately deferred

- Tenant-wide provider administration and safe lifecycle operations for connections shared across applications.
- Real secret-manager write/resolve/rotation implementation.
- Real provider adapters and live credential verification.
- Product Admin provider catalogue UI and Customer Admin connection management UI.
- Provider webhook signature verification, durable event processing and outbox dispatch.
