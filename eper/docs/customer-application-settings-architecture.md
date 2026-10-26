# Customer and Application Settings Architecture

Status: implementation requirement baseline
Scope: EPER customer configuration, application-specific settings, credentials, and auditability.
Non-goal: this document does not claim implementation, deployment, or UAT completion.

## Decision

EPER must distinguish two configuration scopes:

1. **Customer settings** are managed by authorized platform administrators and apply to a customer/tenant across its EPER environment.
2. **Application settings** are managed by authorized users belonging to that customer and apply only to one application assigned to that customer.

Application-specific values must never be stored in a global singleton or shared across tenants.

## Navigation and ownership

### Admin portal
- Customer directory and customer profile.
- Customer-wide locale, currency, regional defaults, status, entitlements, and policy settings.
- Customer users, roles, and application assignments.
- Customer configuration history and audit events.
- Admin-only controls for tenant provisioning and access policy.

### Customer portal
- List of applications assigned to the authenticated customer.
- An application dashboard with a dedicated **Settings** area.
- Integration settings for that application: payment provider, messaging/WhatsApp, AI provider, storage/document sharing, video conferencing, and application-specific workflow/notification preferences where enabled.
- Credential setup/rotation, Test Connection, last test result, and connection health.
- Customer-facing Help Center and Growth Hub remain in customer login, not admin login.

## Domain model

- `Customer` / `Tenant`: canonical tenant identity.
- `Application`: an application registered for or assigned to a customer.
- `CustomerSetting`: tenant-scoped non-secret configuration with schema and version.
- `ApplicationSetting`: application-scoped non-secret configuration with schema and version.
- `IntegrationCredentialReference`: application-scoped reference to a secret in a managed secret store; never the secret value itself.
- `ConfigurationAuditEvent`: actor, tenant, application (when applicable), action, outcome, correlation ID, timestamp, and before/after digests.

Recommended uniqueness constraints:
- Customer settings: unique `(tenant_id, setting_key)`.
- Application settings: unique `(tenant_id, application_id, setting_key)`.
- Credential reference: unique `(tenant_id, application_id, integration_key, environment)`.

Every application must belong to the same tenant in the authenticated request context. The server must verify the tenant/application relationship on every read, write, and connection test.

## API contract (proposed)

- `GET /customer/settings` — read permitted customer-wide settings.
- `PUT /customer/settings` — update permitted customer-wide settings with an expected version.
- `GET /customer/applications` — list applications assigned to the authenticated customer.
- `GET /customer/applications/:applicationId/settings` — read that application's settings.
- `PUT /customer/applications/:applicationId/settings` — update settings with an expected version.
- `PUT /customer/applications/:applicationId/integrations/:integrationKey/credentials` — store/rotate a credential reference; secret material is accepted only over TLS and immediately handed to the secret store.
- `POST /customer/applications/:applicationId/integrations/:integrationKey/test` — test the configured integration without returning secrets.

These are target contracts, not a statement that routes currently exist.

## Authorization rules

- Resolve tenant and actor from trusted server-side authentication; never trust tenant IDs or actor IDs supplied in request JSON.
- Enforce role/permission checks server-side, not only by hiding UI controls.
- Admin permissions and customer permissions must be distinct. Customer users must not gain platform-admin access by using a customer settings endpoint.
- Reject cross-tenant application IDs with a non-disclosing authorization response.
- Use deny-by-default permissions and least privilege for integration tests and secret rotation.
- Keep existing Admin Configuration API access controls; do not reuse admin-only routes as customer routes without adding explicit customer authorization.

## Secret handling

- Store secrets in a managed secret store or a dedicated encrypted credential vault; database rows should store references and non-secret metadata only.
- Encrypt in transit and at rest; never log secret values, authorization headers, or full credential request bodies.
- After save, return only masked metadata such as `configured`, `lastRotatedAt`, and a non-sensitive credential reference.
- Support rotation and revocation. Do not silently fall back to another tenant's credential.
- Test-connection responses must sanitize provider errors and must not echo credentials.

## Persistence and audit

- Use durable persistence in UAT/production; in-memory configuration is not acceptable for customer-managed settings.
- Use optimistic concurrency/version checks to prevent overwriting another administrator's updates.
- Record configuration mutations and credential lifecycle events in the existing durable audit trail. Store before/after digests, not secrets.
- For each write, configuration persistence and its audit event should commit atomically where the current storage architecture supports it.
- Include tenant ID, application ID (when applicable), actor ID, environment, request/correlation ID, action, outcome, and service version in audit records.

## Acceptance tests

1. Admin can read/update customer-wide settings only for customers permitted by the admin role.
2. A customer can list only its assigned applications.
3. Customer A cannot read, mutate, test, or infer the configuration of Customer B.
4. Application A's configuration change does not modify Application B's settings.
5. Missing/invalid role or tenant context is denied by the API, even if a UI route is reachable.
6. Credential values are absent from API responses, application logs, audit payloads, and error messages.
7. Credentials are isolated by tenant, application, integration, and environment.
8. Stale expected versions return a conflict and preserve the latest stored configuration.
9. Each successful mutation produces a correlated audit event; failed authorization attempts are auditable where policy permits.
10. Existing payment, receipt-idempotency, workflow, pricing, and requirement-registry regression suites continue to pass.

## Delivery sequence

1. Confirm canonical customer/application identity and role model.
2. Add schema/migration and persistence interfaces for customer and application scopes.
3. Implement server-side authorization and versioned APIs.
4. Integrate a secret-store adapter and credential lifecycle endpoints.
5. Add customer and admin dashboard navigation/screens.
6. Add integration tests and run the complete existing regression suite.
7. Deploy to controlled UAT and collect evidence. Business UAT remains blocked until all entry gates pass.

## Current implementation boundary

The repository already has a tenant-scoped PostgreSQL admin configuration store with version checks and transactional audit logging. That store currently defines the resource types `workflows`, `roles-access`, `price-book`, and `payment-vendor`. The customer/application scope and explicit customer authorization described here must be implemented before treating the feature as complete.
