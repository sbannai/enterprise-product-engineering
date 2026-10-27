# Per-application AI integration controls

## Purpose
Tenant administrators can independently enable or disable the **AI Integration package** for each EPER application. CRM, Sales, and Marketing AI capabilities are included together in this package; they are not separate AI enablement switches. An application with no saved entry is OFF by default. Enforcement is unconditional for agent endpoints; the customer OFF switch cannot be bypassed by omitting an environment flag.

## Admin UI and API
- UI: `GET /admin/ai-integrations`
- Read configuration: `GET /admin/config/ai-integrations`
- Replace configuration: `PUT /admin/config/ai-integrations`

The API requires `EPER_ADMIN_CONFIG_API_ENABLED=true`, `EPER_ADMIN_CONFIG_PERSISTENCE=postgres`, a configured `PostgresAdminConfigurationStore`, and a bearer credential mapped through `EPER_ADMIN_CONFIG_IDENTITIES_JSON`. The mapping resolves tenant and actor server-side; clients cannot supply either identity.

PUT body:
```json
{
  "expectedVersion": 1,
  "config": {
    "applications": {
      "sales-crm": { "enabled": true, "provider": "openai" },
      "school-erp": { "enabled": false, "provider": "none" }
    }
  }
}
```

Supported provider identifiers are `none`, `openai`, `azure-openai`, `google`, `anthropic`, and `provider-neutral`. Enabling requires a non-`none` provider. The package switch governs CRM, Sales, and Marketing together for that application. Provider credentials remain server-side and are never stored in this configuration.

## Enforcing OFF/ON at the agent boundary
Each `/v1/agents/*` request must include the application scope as `?applicationId=<application-id>`. The request is authenticated first; then the tenant-scoped setting is checked using the tenant mapped to the authenticated principal. Draft creation, listing, and approval/rejection are also scoped to both tenant and application; a reviewer cannot list or review a draft from a different application. Configure `EPER_AGENTS_PRINCIPAL_TENANTS_JSON` as a server-side JSON object mapping every configured principal ID to its tenant ID, for example `{"maker-a":"tenant-a","reviewer-b":"tenant-a","maker-c":"tenant-b"}`. Every principal token in `EPER_AGENTS_PRINCIPAL_TOKENS` must have a matching tenant-map entry. Do not infer the authenticated tenant from a deployment-wide default or from request input. A missing or malformed mapping fails closed with `agents_principal_tenant_mapping_unconfigured`. Missing/disabled settings or a missing provider return 403; missing application scope returns 400; missing durable policy storage returns 503. An unavailable policy store fails closed; it never silently bypasses the OFF setting. Deploy the durable admin configuration migration and PostgreSQL store before enabling agent endpoints.

## Persistence and audit
Run the existing audit migration runner after deploying the change; it discovers migrations in `eper/packages/audit/migrations`, including `003_ai_integration_admin_config.sql`. Configuration writes use the existing optimistic version check and durable hash-chained audit event transaction.

## Safety boundaries
- No AI provider is invoked by the toggle itself. Selecting a provider is configuration, not proof that provider credentials are connected or valid.
- This flag governs EPER agent API routes; every future AI integration entry point must use the same policy guard before calling a provider.
- External actions and CRM writes still require their separate human-approval and authorization checks.


## Durable agent drafts (migration 006)
When `EPER_AGENTS_API_ENABLED=true`, the API process now requires PostgreSQL-backed admin configuration and durable audit, and verifies that the `eper_agent_drafts` schema exists at startup. Apply the audit migration runner before enabling this API; it discovers `006_agent_drafts.sql` alongside the existing audit migrations. Draft create/list/review operations use PostgreSQL in the API process, and reads and reviews are scoped by both authenticated tenant and application. Reviews lock the row and only transition `PENDING_APPROVAL` drafts; maker-checker separation is enforced in the store. A restart no longer loses drafts.

The API deliberately retains an in-memory draft path for direct non-production test harnesses that call `createAppServer` without a store. This is not the production startup path. Audit events are currently written by the existing audit writer after the draft-store operation; draft mutation and audit append are not yet a single PostgreSQL transaction, so audit/store atomicity remains a closure item before treating this workflow as fully audit-atomic. Approval changes state only; it does not execute external actions or CRM writes.
