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
- Integration settings for that application: payment provider, messaging/WhatsApp, AI provider, storage/document sharing, **video conferencing**, and **alerts/notifications**.
- Video conferencing and alert configuration must be reached from Customer login → My Applications → select application → Settings. These are not platform-admin global settings.
- Every integration setting, credential reference, connection test, notification rule, recipient group, template, and delivery history is isolated by `(tenant_id, application_id, integration_key, environment)` or the corresponding application-scoped key.
- Provider reuse is permitted only through an explicit, authorized connection reference; sharing a provider project never shares application policies, recipients, secrets, or delivery records.
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

## Module entitlements, permissions, and pricing

EPER is a modular platform: each module must be independently entitled, permissioned, and priced. The admin portal is the authority for the module catalogue, price book, customer subscriptions/entitlements, and the module-level permission policy. Customer users may manage their own application settings only within modules enabled for their tenant and their assigned role.

### Admin controls
- Maintain a versioned module catalogue with a stable module_key, display name, description, dependency metadata, and lifecycle status.
- Define one or more prices per module, including currency, amount, billing interval (monthly, annual, or one-time), effective dates, and whether the price is per customer, per application, or usage-based.
- Assign modules to each customer, with entitlement status, start/end dates, agreed price snapshot, limits/quotas, and optional override/discount requiring an audited reason.
- Grant module-specific permissions to customer roles, independently of module entitlement. A role cannot use a module unless the tenant is entitled to it and the role has the required permission.
- Preview the customer's recurring/one-time charges before saving a change; record the accepted price version and effective date to prevent later catalogue price changes from silently rewriting existing agreements.

### Customer controls
- Show only entitled modules in customer navigation; optionally show unavailable modules as locked only when the product policy allows discovery.
- For each enabled module, show its permission level and application-specific settings.
- Do not let customer users self-enable paid modules, change contracted prices, grant themselves permissions, or bypass entitlement checks by calling an API directly.
- Customer-wide settings remain separate from per-application settings. Module entitlements apply at tenant scope unless the product explicitly models an application-level add-on.

### Authorization and billing invariants
- Enforce authorization on the server for every route and background job, not only in the UI.
- Effective access = active customer entitlement + active module + role permission + application assignment (where the operation is application-scoped).
- Pricing is not an authorization decision by itself. Payment/subscription status and any approved grace period must be evaluated by the entitlement service.
- Use a versioned price snapshot on each entitlement; store money as decimal/numeric with an explicit ISO currency code, never as floating-point values.
- Currency display preferences must not change the actual contracted amount or currency charged. Any currency conversion or repricing must be explicit and auditable.
- Record module enable/disable, role permission, price-book, subscription/entitlement, discount, and billing-relevant changes in the durable audit trail. Never include secrets or payment credentials in audit payloads.

### Additional acceptance tests
11. A customer with no entitlement cannot access a module by typing its URL or calling its API.
12. Enabling one module does not implicitly enable unrelated modules.
13. Customer roles can have different permissions within the same entitled module.
14. A module price change affects new entitlements by default; existing entitlements retain their accepted price snapshot unless an explicitly approved change is recorded.
15. The computed invoice uses the contracted currency and amount, independent of the user's display-currency preference.
16. Module enable/disable and price/permission changes have correlated audit events and cannot be made by unauthorized customer roles.

## Optional application add-ons: Marketing, Sales, and AI

Marketing, Sales, and AI are optional, separately priced add-ons selected by the customer for each application. They are part of that application's customer-specific settings and must not be automatically bundled with the core application or enabled by enabling another module.

### Customer experience
- In each application dashboard, show a dedicated Add-ons section for Marketing, Sales, and AI.
- For each add-on show its description, available capabilities, current status, price/billing model/currency, usage limits where applicable, and any prerequisites.
- Let an authorized customer admin request or select an add-on and confirm the displayed price and terms before activation. If the platform's commercial policy requires approval or payment first, keep the add-on pending until that condition is satisfied.
- Allow customers to configure credentials and provider settings only after the add-on is entitled and activated. Store secrets only through the approved secret-store adapter.
- Let customers view usage, limits, renewal/effective dates, and cancellation or disablement options without exposing secrets.

### Admin controls
- Maintain separate catalogue entries and versioned prices for Marketing, Sales, and AI, with explicit currency, billing interval, pricing model, effective dates, and optional per-application or usage-based pricing.
- Configure availability, prerequisites, quotas, and whether an add-on requires manual approval or a confirmed subscription/payment.
- Assign or approve entitlements at the tenant + application + add-on scope, preserving the agreed price snapshot and effective date.
- Admins may configure customer-specific commercial terms; every override, approval, activation, suspension, and cancellation must be audited.

### Authorization and billing rules
- Model add-ons as independently entitled capabilities attached to an application; do not use UI visibility as authorization.
- Effective add-on access requires an active customer entitlement, an active add-on catalogue entry, the required customer-role permission, and a valid application assignment. Enforce this on every relevant API and background job.
- Marketing, Sales, and AI may have separate prices and usage meters. Do not assume that selecting one grants access to the others.
- AI usage charges, if applicable, must be metered and reconciled according to the accepted pricing terms. Marketing and Sales integration usage must follow their own configured limits and pricing rules.
- A catalogue price change must not silently alter an existing accepted price snapshot. Currency display settings must never silently alter the amount or currency actually contracted or charged.
- Add-on selection, price confirmation, payment/subscription state changes, usage, configuration updates, credential rotation, and cancellation must produce correlated audit events without logging secrets.

### Add-on acceptance tests
17. A customer can independently select Marketing, Sales, AI, any combination, or none for each application.
18. An add-on remains inaccessible until its entitlement and any required approval/payment conditions are satisfied.
19. Enabling an add-on for Application A does not enable it for Application B or another tenant.
20. Each add-on uses its own accepted price snapshot, billing terms, permissions, and usage limits.
21. Customer users cannot change prices or grant add-on entitlements to themselves through API calls.
22. Disabling/cancelling one add-on does not disable unrelated add-ons or the core application.

## Current implementation boundary

The repository already has a tenant-scoped PostgreSQL admin configuration store with version checks and transactional audit logging. That store currently defines the resource types `workflows`, `roles-access`, `price-book`, and `payment-vendor`. The customer/application scope and explicit customer authorization described here must be implemented before treating the feature as complete.


## Entitlement enforcement implementation status (2026-10-26)

The repository now contains a policy evaluator, a PostgreSQL-backed entitlement lookup service, and an opt-in customer access-check endpoint.

- `GET /customer/applications/:applicationId/access/modules/:moduleKey`
- `GET /customer/applications/:applicationId/access/addons/:addonKey`

These routes require `EPER_CUSTOMER_ACCESS_API_ENABLED=true`, a configured `EPER_MODULE_ENTITLEMENT_PERSISTENCE=postgres` service, and a bearer credential mapped by `EPER_CUSTOMER_ACCESS_IDENTITIES_JSON` to trusted `tenantId`, `actorId`, and `roleKey`. Permission can be supplied as a validated `permission` query parameter; the default is `module.use`. Application assignments are currently resolved from the server-side `EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON` map. Missing or invalid assignment data fails closed. Replace this environment-backed assignment map with the canonical durable application/tenant membership service before production rollout.

The UAT capability route can additionally enforce module entitlements when `EPER_CAPABILITY_ENTITLEMENTS_REQUIRED=true`. This requires the entitlement service, `EPER_UAT_APPLICATION_ID`, `EPER_UAT_ROLE_KEY`, and `EPER_REQUIREMENT_MODULE_MAP_JSON` mapping each enabled requirement ID to its module catalogue key. The customer tenant and principal continue to come from the existing trusted UAT server configuration, never the request body. A missing mapping or unavailable policy service blocks execution rather than bypassing authorization.

**Not yet complete:** customer/admin UI integration, a canonical database-backed application assignment source, enforcement on every capability and background-job entry point, add-on activation workflow (approval/payment), billing reconciliation, migrations against a real database, and build/test/CI verification. Do not authorize Business UAT based on the policy/service commits alone.

The same global entitlement-enforcement switch also protects the local capability execution route `POST /internal/requirements/:id/execute`. When `EPER_CAPABILITY_ENTITLEMENTS_REQUIRED=true`, that route requires `EPER_LOCAL_APPLICATION_ID`, `EPER_LOCAL_ROLE_KEY`, the entitlement service, and the same `EPER_REQUIREMENT_MODULE_MAP_JSON` mapping. Missing policy configuration returns a service-unavailable response; a denied policy returns forbidden. This closes the local-route bypass, but does not replace the outstanding review of all other capability entry points and background jobs.

### Route-level entitlement regression coverage (2026-10-26)

Added `eper/tests/capability-entitlement-route.test.mjs` and `eper/tests/uat-capability-entitlement-route.test.mjs` to exercise the local and UAT HTTP execution paths for missing policy configuration, denied access, and allowed policy decisions. These are committed tests, not evidence of a passing run. Execute `npm test` from `eper/` in CI or a repository environment and resolve any failures before treating the gate as verified.
