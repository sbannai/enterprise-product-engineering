# Product Admin Provider Catalogue — API and Governance Contract

**Status:** Engineering contract for the next implementation slice. This document is not evidence that catalogue administration endpoints or screens are implemented.

## 1. Ownership and boundary

- Product Admin owns the platform-wide provider catalogue: provider identity, display metadata, adapter eligibility, supported authentication modes, capability definitions, configuration schema, lifecycle status and platform restrictions.
- Customer Admin owns customer connection setup and application bindings, but may select only providers and capabilities currently permitted by Product Admin.
- Application roles authorize operations on an application's existing provider binding. They do not grant platform-wide catalogue authority or tenant-wide provider administration.
- Provider catalogue authority must be resolved from a server-validated Product Admin session and a durable platform-admin permission store. Do not infer it from a customer role, an OIDC token role claim, request JSON, UI visibility or a customer/application assignment.

## 2. Catalogue resource

Canonical resource: `ProviderDefinition`.

| Field | Rule |
|---|---|
| providerKey | Stable, unique key; immutable after creation |
| displayName | Product Admin editable, bounded non-empty text |
| adapterKey / adapterVersion | Allowlisted implementation identity; changing either is a controlled compatibility change |
| capabilities | Set of registered capability IDs; reject unknown or duplicate IDs |
| authModes | Set of supported authentication modes; reject unknown or duplicate IDs |
| configurationSchema | JSON Schema-like object validated against the platform's supported schema subset |
| providerStatus | ACTIVE, SUSPENDED or DEPRECATED |
| version | Monotonic optimistic-concurrency version |
| updatedBy / updatedAt | Server-derived actor and timestamp |

Never store provider credentials, access tokens, secret values or tenant-specific connection data in this catalogue.

## 3. Proposed Product Admin API

All routes are platform-admin-only and require the versioned API media type, authenticated Product Admin session, CSRF protection for mutations, server-generated correlation ID and durable audit.

- `GET /platform/admin/provider-definitions` — list with status/search filters and bounded pagination.
- `POST /platform/admin/provider-definitions` — create a definition; server validates adapter, capabilities, auth modes and schema against registries.
- `GET /platform/admin/provider-definitions/{providerKey}` — read one definition.
- `PATCH /platform/admin/provider-definitions/{providerKey}` — update mutable metadata/policy using `expectedVersion`.
- `POST /platform/admin/provider-definitions/{providerKey}/suspend` — immediately prevent new bindings and new connection creation.
- `POST /platform/admin/provider-definitions/{providerKey}/activate` — reactivate only after adapter/capability compatibility checks.
- `POST /platform/admin/provider-definitions/{providerKey}/deprecate` — prevent new bindings while preserving existing connection history and explicit migration path.

No hard delete. Provider keys and adapter identities remain referentially stable for audit, historical operations and existing connections.

## 4. Lifecycle and enforcement

1. New connections and new application bindings require an ACTIVE provider definition.
2. SUSPENDED blocks new connection creation, new bindings, and dispatch of new provider operations. Existing bindings become unavailable to workflows until policy explicitly allows safe recovery.
3. DEPRECATED blocks new connections and bindings. Existing connections remain visible and auditable; any migration or retirement must be explicit and customer-visible.
4. Capability removal is a breaking policy change: reject it while active application bindings or non-terminal operations depend on it, unless a separately audited migration plan is supplied.
5. Adapter key/version changes require a registered adapter and compatibility validation. Never silently reinterpret existing connection configuration.
6. Product Admin restrictions are rechecked server-side at connection creation, bind, workflow publication and operation dispatch. A stale UI catalogue is not authority.
7. Every write uses expectedVersion and commits the definition change plus append-only audit event in one transaction. Stale writes return conflict without mutation.

## 5. Persistence and security

The existing `eper_provider_definitions` table is the catalogue persistence base. It is platform-global, unlike tenant-scoped connections. Do not attach tenant RLS to it. Instead:
- restrict catalogue reads/writes to the Product Admin API/service boundary;
- require durable platform-admin authorization on every request;
- run writes under a dedicated least-privilege database role/service path;
- keep application/tenant connection operations unable to mutate catalogue rows;
- audit create/update/activate/suspend/deprecate with actor, before/after version, changed field names, correlation ID and outcome; never include secrets;
- use a single transaction for optimistic update and audit append;
- keep catalogue schema validation deterministic and bounded (size, depth, allowed keywords, no remote schema references).

The catalogue table currently has a global provider-definition row and the provider connection repository checks that its status is ACTIVE during connection creation. The Product Admin API must preserve that enforcement and add equivalent checks to binding and operation dispatch.

## 6. Required tests

- Customer Admin and application roles cannot list or mutate the platform catalogue.
- Unauthenticated and non-Product-Admin requests fail closed.
- Product Admin cannot write an unregistered adapter, capability or auth mode.
- Duplicate provider keys and immutable-key changes are rejected.
- Invalid/oversized/deep schemas and remote schema references are rejected.
- Stale expectedVersion updates do not change the row or append a success audit.
- SUSPENDED/DEPRECATED definitions cannot be used for new connection creation or new application bindings.
- Removing a capability in use is rejected without a migration plan.
- Tenant A cannot read or mutate tenant B connections through catalogue APIs; catalogue metadata contains no tenant secrets.
- Catalogue mutations and audit records are atomic.
- Existing connection history remains readable after provider deprecation.

## 7. Implementation sequence

1. Confirm and reuse the repository's durable platform-admin session/authorization boundary; do not invent a second identity source.
2. Add a typed catalogue repository with transaction-scoped optimistic concurrency and audit.
3. Add Product Admin routes with explicit feature flag and startup readiness checks.
4. Add migration only if the existing table needs additional constraints/indexes; avoid duplicate catalogue tables.
5. Add API, PostgreSQL, authorization and migration tests.
6. Add Product Admin UI only after the API contract and server enforcement are tested.
7. Wire Customer Admin connection creation to the existing tenant connection repository, separately from application-scoped bind permissions.

## 8. Explicitly out of scope for this slice

Real provider network adapters, secret-manager writes/resolution, webhook signature verification, outbox dispatch, SMS/email/WhatsApp delivery, video meeting creation, and Customer Admin frontend wiring. Those remain separate tested vertical slices. No cloud resources are required for local PostgreSQL development.


## Platform credential permission

The trusted platform credential resolver allowlists the independent `provider_catalogue:manage` permission. This permission is not implied by customer-admin provisioning/recovery or application-remediation permissions. Credentials remain server-mapped; callers cannot supply platform identity or permissions in request data. The catalogue API must still enforce this permission on every request.
