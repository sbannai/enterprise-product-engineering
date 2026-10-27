# Per-application AI integration controls

## Purpose
Tenant administrators can independently enable or disable AI integrations for each EPER application. An application with no saved entry is OFF by default. A disabled application must not reach an AI agent route when enforcement is enabled.

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

Supported provider identifiers are `none`, `openai`, `azure-openai`, `google`, `anthropic`, and `provider-neutral`. Enabling requires a non-`none` provider. Provider credentials remain server-side and are never stored in this configuration.

## Enforcing OFF/ON at the agent boundary
Set `EPER_AI_INTEGRATION_ENFORCEMENT=true` only after durable admin configuration and migration are ready. Each `/v1/agents/*` request must include the application scope as `?applicationId=<application-id>`. The request is authenticated first; then the tenant-scoped setting is checked. Missing/disabled settings return 403; missing application scope returns 400; missing durable policy storage returns 503. With enforcement enabled, a provider outage or unavailable policy store must not silently bypass the OFF setting.

## Persistence and audit
Run the existing audit migration runner after deploying the change; it discovers migrations in `eper/packages/audit/migrations`, including `003_ai_integration_admin_config.sql`. Configuration writes use the existing optimistic version check and durable hash-chained audit event transaction.

## Safety boundaries
- No AI provider is invoked by the toggle itself.
- This flag governs EPER agent API routes; every future AI integration entry point must use the same policy guard before calling a provider.
- External actions and CRM writes still require their separate human-approval and authorization checks.
