# Customer Workspace API Contract

**Status:** implementation contract; not evidence of a deployed or production-ready customer login.

## Routes

- `GET /customer/session` — resolves the bearer credential against the server-side `EPER_CUSTOMER_ACCESS_IDENTITIES_JSON` map. Returns tenant, actor and role identifiers, never the credential. Missing or unknown credentials return `401`.
- `GET /customer/workspace/modules` — requires the same trusted identity. Reads enabled module keys from `EPER_CUSTOMER_WORKSPACE_MODULES_JSON`, keyed by tenant ID. Only the allowlisted customer modules are returned.
- `GET /customer/help-center/content` — requires identity and the tenant's `help-center` module entitlement. Reads items from `EPER_CUSTOMER_HELP_CONTENT_JSON`.
- `GET /customer/growth-hub/content` — requires identity and the tenant's `growth-hub` module entitlement. Reads items from `EPER_CUSTOMER_GROWTH_CONTENT_JSON`.
- `GET /customer/applications` — intersects durable tenant ownership with durable actor-to-application membership when `EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE=postgres`; environment-backed assignments remain the compatibility mode.
- `GET /customer/settings?applicationId=<id>` — requires both tenant ownership and actor membership before returning safe settings.
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

The JSON above illustrates each environment variable's value separately; do not set all four variables to one combined object.

Application-scoped customer routes require two independent boundaries: the application must be assigned to the trusted tenant, and the actor must be assigned to that application. In compatibility mode, tenant assignments come from `EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON` and actor assignments come from the trusted identity's validated `applicationIds`. With `EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE=postgres`, tenant ownership and actor membership are read from migrations `008_tenant_application_assignments.sql` and `007_actor_application_assignments.sql` respectively. The PostgreSQL mode requires the shared PostgreSQL pool and durable audit persistence; startup checks both assignment stores. Customer application listing intersects the two assignment sets. Direct settings, asset listing/download, ticket, campaign-scheduler and entitlement checks enforce both boundaries. Missing actor membership fails closed.

## Security and current limitations

- All routes require a server-mapped bearer identity. Module content also requires an explicit tenant-level entitlement.
- Missing/malformed module configuration fails closed. Content responses are bounded and include only title/body fields.
- These endpoints are read-only. They do not implement publishing, CRM writes, campaign execution, or external actions.
- `/customer-portal-preview` is an interactive customer-workspace preview: it accepts a pasted bearer credential and calls the customer APIs for session context, modules, applications, settings, assets, and ticket operations. It is not a static mock, but the pasted-token flow is preview-only and is not a reviewed production browser authentication/session design.
- Browser sign-in, secure cookie/session lifecycle, CSRF strategy, token issuance/revocation, tenant-admin content management, persistent content storage, and end-to-end browser tests remain to be implemented before production use.
- Durable PostgreSQL assignment stores now exist for both actor-to-application and tenant-to-application membership (migrations `007` and `008`). They support versioned grant/revoke, tenant-scoped reads, and transactional audit events. The admin assignment APIs and the combined assignment-management UI are implemented behind explicit admin configuration and PostgreSQL feature flags. These changes have regression-test source coverage, but test execution and CI evidence are still pending; do not treat source presence as a passing test or production readiness.
- Never put long-lived bearer credentials in localStorage, URLs, client-side source, or browser logs. A production browser session should use a reviewed identity/session mechanism rather than embedding server API credentials.
- Business UAT remains blocked until the existing entry gates are satisfied.
