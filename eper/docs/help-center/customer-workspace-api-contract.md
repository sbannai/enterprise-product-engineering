# Customer Workspace API Contract

**Status:** implementation contract; not evidence of a deployed or production-ready customer login.

## Routes

- `GET /customer/session` — resolves the bearer credential against the server-side `EPER_CUSTOMER_ACCESS_IDENTITIES_JSON` map. Returns tenant, actor and role identifiers, never the credential. Missing or unknown credentials return `401`.
- `GET /customer/workspace/modules` — requires the same trusted identity. Reads enabled module keys from `EPER_CUSTOMER_WORKSPACE_MODULES_JSON`, keyed by tenant ID. Only the allowlisted customer modules are returned.
- `GET /customer/help-center/content` — requires identity and the tenant's `help-center` module entitlement. Reads items from `EPER_CUSTOMER_HELP_CONTENT_JSON`.
- `GET /customer/growth-hub/content` — requires identity and the tenant's `growth-hub` module entitlement. Reads items from `EPER_CUSTOMER_GROWTH_CONTENT_JSON`.
- `GET /customer/applications` — intersects tenant-level `EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON` with the trusted actor's `applicationIds` allowlist.
- `GET /customer/settings?applicationId=<id>` — requires both tenant assignment and actor-level application assignment before returning safe settings.

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

For application-scoped customer routes (including `GET /customer/applications`, application settings, and ticket operations), `applicationIds` is the actor-level allowlist in the trusted identity record. The server intersects it with the tenant's `EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON` assignments; tenant membership alone does not grant an actor access to every tenant application. If `applicationIds` is absent, empty, or invalid, application-scoped access fails closed (the application list is empty and direct application access is denied). Keep this mapping server-side and update it through the approved identity provisioning process.

## Security and current limitations

- All routes require a server-mapped bearer identity. Module content also requires an explicit tenant-level entitlement.
- Missing/malformed module configuration fails closed. Content responses are bounded and include only title/body fields.
- These endpoints are read-only. They do not implement publishing, CRM writes, campaign execution, or external actions.
- `/customer-portal-preview` is an interactive customer-workspace preview: it accepts a pasted bearer credential and calls the customer APIs for session context, modules, applications, settings, assets, and ticket operations. It is not a static mock, but the pasted-token flow is preview-only and is not a reviewed production browser authentication/session design.
- Browser sign-in, secure cookie/session lifecycle, CSRF strategy, token issuance/revocation, tenant-admin content management, persistent content storage, and end-to-end browser tests remain to be implemented before production use.
- A durable PostgreSQL membership foundation now exists in migration `007_actor_application_assignments.sql` and `PostgresActorApplicationAssignmentStore`. It supports versioned grant/revoke, tenant+actor-scoped reads, and same-transaction audit events. It is not yet wired into the customer identity resolver or admin/customer APIs; current customer authorization still reads the server-side `applicationIds` and tenant assignment environment maps. Database-backed resolver integration, tenant-assignment validation, administrator authorization/UI, customer UI administration, and cross-layer regression execution remain open. Do not mark this capability complete until those paths are connected and tested.
- Never put long-lived bearer credentials in localStorage, URLs, client-side source, or browser logs. A production browser session should use a reviewed identity/session mechanism rather than embedding server API credentials.
- Business UAT remains blocked until the existing entry gates are satisfied.
