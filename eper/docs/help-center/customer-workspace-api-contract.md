# Customer Workspace API Contract

**Status:** implementation contract; not evidence of a deployed or production-ready customer login.

## Routes

- `GET /customer/session` — resolves the bearer credential against the server-side `EPER_CUSTOMER_ACCESS_IDENTITIES_JSON` map. Returns tenant, actor and role identifiers, never the credential. Missing or unknown credentials return `401`.
- `GET /customer/workspace/modules` — requires the same trusted identity. Reads enabled module keys from `EPER_CUSTOMER_WORKSPACE_MODULES_JSON`, keyed by tenant ID. Only the allowlisted customer modules are returned.
- `GET /customer/help-center/content` — requires identity and the tenant's `help-center` module entitlement. Reads items from `EPER_CUSTOMER_HELP_CONTENT_JSON`.
- `GET /customer/growth-hub/content` — requires identity and the tenant's `growth-hub` module entitlement. Reads items from `EPER_CUSTOMER_GROWTH_CONTENT_JSON`.

## JSON configuration shape

Use secret/configuration management at deployment time; never commit credentials or customer content into the repository. The identity map keys are bearer credentials and must be long, random, unique and rotated if exposed.

```json
{
  "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON": {
    "<long-random-bearer-credential>": {
      "tenantId": "tenant-a",
      "actorId": "actor-a",
      "roleKey": "customer"
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

## Security and current limitations

- All routes require a server-mapped bearer identity. Module content also requires an explicit tenant-level entitlement.
- Missing/malformed module configuration fails closed. Content responses are bounded and include only title/body fields.
- These endpoints are read-only. They do not implement publishing, CRM writes, campaign execution, or external actions.
- Current `/customer-portal-preview` is a static prototype and does not call these APIs. Do not treat the preview as a login/session UI.
- Browser sign-in, secure cookie/session lifecycle, CSRF strategy, token issuance/revocation, tenant-admin content management, persistent content storage, and end-to-end browser tests remain to be implemented before production use.
- Never put long-lived bearer credentials in localStorage, URLs, client-side source, or browser logs. A production browser session should use a reviewed identity/session mechanism rather than embedding server API credentials.
- Business UAT remains blocked until the existing entry gates are satisfied.
