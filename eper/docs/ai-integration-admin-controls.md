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
Each `/v1/agents/*` request must include the application scope as `?applicationId=<application-id>`. The request is authenticated first; then the tenant-scoped setting is checked. Missing/disabled settings or a missing provider return 403; missing application scope returns 400; missing durable policy storage returns 503. An unavailable policy store fails closed; it never silently bypasses the OFF setting. Deploy the durable admin configuration migration and PostgreSQL store before enabling agent endpoints.

## Persistence and audit
Run the existing audit migration runner after deploying the change; it discovers migrations in `eper/packages/audit/migrations`, including `003_ai_integration_admin_config.sql`. Configuration writes use the existing optimistic version check and durable hash-chained audit event transaction.

## Safety boundaries
- No AI provider is invoked by the toggle itself. Selecting a provider is configuration, not proof that provider credentials are connected or valid.
- This flag governs EPER agent API routes; every future AI integration entry point must use the same policy guard before calling a provider.
- External actions and CRM writes still require their separate human-approval and authorization checks.
