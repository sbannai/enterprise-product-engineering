# Customer Workspace API Contract

**Status:** implementation contract; not evidence of a deployed or production-ready customer login.

## Routes

- `GET /customer/session` — in PostgreSQL identity mode, resolves the opaque `__Host-eper_session` cookie to a durable session and returns tenant/actor identifiers plus the least-privilege `customer-user` role. In compatibility mode, resolves the server-side `EPER_CUSTOMER_ACCESS_IDENTITIES_JSON` bearer map. OIDC claims never grant application roles. Missing or invalid sessions return `401`.
- `GET /customer/workspace/modules` — requires the same trusted identity; in PostgreSQL identity mode this is the durable browser session. Reads enabled module keys from `EPER_CUSTOMER_WORKSPACE_MODULES_JSON`, keyed by tenant ID. Only the allowlisted customer modules are returned.
- `GET /customer/help-center/content` — requires the browser session in PostgreSQL identity mode (or compatibility bearer identity) and the tenant's `help-center` module entitlement. Reads items from `EPER_CUSTOMER_HELP_CONTENT_JSON`.
- `GET /customer/growth-hub/content` — requires the browser session in PostgreSQL identity mode (or compatibility bearer identity) and the tenant's `growth-hub` module entitlement. Reads items from `EPER_CUSTOMER_GROWTH_CONTENT_JSON`.
- `GET /customer/applications` — in PostgreSQL identity mode, resolves the durable browser session and intersects durable tenant ownership with durable actor-to-application membership. Environment-backed bearer assignments remain the compatibility mode.
- `GET /customer/settings?applicationId=<id>` — requires both tenant ownership and actor membership before returning safe settings. PostgreSQL identity mode uses the durable browser session; no bearer fallback is permitted.
- `GET /customer/applications/:applicationId/access/modules/:moduleKey` and `/addons/:addonKey` — entitlement diagnostics; require tenant ownership and actor membership before policy evaluation.

## JSON configuration shape

Use secret/configuration management at deployment time; never commit credentials or customer content into the repository. The identity map keys are bearer credentials and must be long, random, unique and rotated if exposed.

```json
{
  "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON": {
    "<long-random-bearer-credential>": {
      "tenantId": "tenant-a",
      "actorId": "actor-a",
      "roleKey": "customer",
      "applicationIds": ["app-a"]
    }
  },
  "EPER_CUSTOMER_WORKSPACE_MODULES_JSON": {
    "tenant-a": ["help-center", "growth-hub"]
  },
  "EPER_CUSTOMER_HELP_CONTENT_JSON": {
    "tenant-a": [
      { "title": "Getting started", "body": "Customer-facing guide text" }
    ]
  },
  "EPER_CUSTOMER_GROWTH_CONTENT_JSON": {
    "tenant-a": [
      { "title": "Campaign planning", "body": "Customer-facing playbook text" }
    ]
  }
}
```

The JSON above illustrates each environment variable's value separately; do not set all four variables to one combined object. In PostgreSQL identity mode, the customer workspace UI signs in through `/customer/auth/oidc/start` and uses the durable same-origin browser session; it does not ask the customer to paste a bearer credential.

Application-scoped customer routes require two independent boundaries: the application must be assigned to the trusted tenant, and the actor must be assigned to that application. In compatibility mode, tenant assignments come from `EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON` and actor assignments come from the trusted identity's validated `applicationIds`. With `EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE=postgres`, tenant ownership and actor membership are read from migrations `008_tenant_application_assignments.sql` and `007_actor_application_assignments.sql` respectively. The PostgreSQL mode requires the shared PostgreSQL pool and durable audit persistence; startup checks both assignment stores. Customer application listing intersects the two assignment sets. Direct settings, asset listing/download, ticket, campaign-scheduler and entitlement checks enforce both boundaries. Missing actor membership fails closed.

## Security and current limitations

- In PostgreSQL identity mode, customer workspace bootstrap, module discovery, help/growth content, asset manifest/download, application listing, settings and ticket routes resolve the durable browser session. Compatibility mode retains the server-mapped bearer identity for API clients. Module content also requires an explicit tenant-level entitlement.
- Missing/malformed module configuration fails closed. Content responses are bounded and include only title/body fields.
- These endpoints are read-only. They do not implement publishing, CRM writes, campaign execution, or external actions.
- `/customer-portal-preview` is an interactive customer workspace. It starts with a provider-neutral OIDC sign-in link, verifies the durable browser session, and calls customer APIs with same-origin cookies. Unsafe customer requests carry the CSRF token. In PostgreSQL identity mode the browser receives only the `customer-user` role; application access is the intersection of active tenant and actor assignments. The compatibility bearer map remains for legacy API clients, not for the workspace UI.
- The browser E2E covers OIDC sign-in, customer workspace bootstrap, ticket creation, ticket history, customer reply, protected settings, logout and revocation using a synthetic identity provider and in-memory test stores. This is integration evidence, not production-provider onboarding or production deployment proof.
- Support-admin authentication remains a separate boundary: the admin console still uses its configured bearer credential and must not inherit the customer-user role. A reviewed support-admin role/delegation mapping and admin browser E2E are still outstanding.
- Tenant-admin content management, persistent help/growth content storage, SLA targets/timers and escalation policy remain to be implemented or owner-defined before those capabilities can be claimed complete.
- Durable PostgreSQL assignment stores now exist for both actor-to-application and tenant-to-application membership (migrations `007` and `008`). They support versioned grant/revoke, tenant-scoped reads, and transactional audit events. The admin assignment APIs and the combined assignment-management UI are implemented behind explicit admin configuration and PostgreSQL feature flags. These changes have regression-test source coverage, but test execution and CI evidence are still pending; do not treat source presence as a passing test or production readiness.
- Never put long-lived bearer credentials in localStorage, URLs, client-side source, or browser logs. A production browser session should use a reviewed identity/session mechanism rather than embedding server API credentials.
- Business UAT remains blocked until the existing entry gates are satisfied.
