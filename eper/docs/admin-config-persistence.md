# EPER durable admin configuration

This mode is opt-in and fails closed. It reuses the existing PostgreSQL pool and append-only audit chain; it does not create or migrate a hosted database automatically.

## Required runtime configuration

Set these variables on the API process:

- `EPER_ADMIN_CONFIG_API_ENABLED=true`
- `EPER_ADMIN_CONFIG_PERSISTENCE=postgres`
- `EPER_PAYMENT_PERSISTENCE=postgres` (currently provides the shared PostgreSQL pool)
- `EPER_AUDIT_PERSISTENCE=postgres`
- `EPER_ADMIN_CONFIG_IDENTITIES_JSON` — a JSON object whose keys are individual bearer credentials of at least 32 characters and whose values contain server-side `tenantId` and `actorId`, for example:

```json
{
  "replace-with-a-random-secret-of-at-least-32-characters": {
    "tenantId": "uat-tenant-1",
    "actorId": "named-admin-1"
  }
}
```

Use a different credential for each administrator/tenant mapping. Store credentials in the deployment's secret manager; never commit real credentials. The durable mode does not accept the legacy shared `EPER_ADMIN_CONFIG_API_TOKEN` as an identity and does not infer tenant or actor from request bodies or forwarded headers.

## Schema setup

Against the explicitly approved target database only, run:

```sh
npm run migrate:payments
npm run migrate:audit
```

The audit migration runner applies both the audit chain schema and `002_admin_configuration.sql`. Startup checks fail if the required audit schema or admin configuration table is absent. CI applies migrations only to its ephemeral PostgreSQL service. No hosted UAT migration is implied by this document or by the draft PR.

## Admin UI shell boundary

The admin workflow/pricing UI routes currently serve static HTML shells when the feature flag is enabled; serving the shell does not authenticate a user or return configuration data. In durable mode, every configuration API call requires a mapped bearer credential. If the deployment's security policy requires restricting even static shell access, enforce that at the ingress or add a session-authenticated UI gateway before enabling these routes publicly. Do not treat shell access as an authorization decision.

## Behavior and release boundary

- Configuration is partitioned by `tenant_id` and resource type.
- Writes require `expectedVersion`; stale versions return a conflict rather than silently overwriting.
- The configuration row and audit-chain event share one PostgreSQL transaction. Audit failure rolls back the configuration mutation.
- Payment vendor configuration remains sandbox-only; provider names other than `sandbox` are planning-only and cannot enable live charges.
- Process-memory mode remains the default unless PostgreSQL mode is explicitly selected. It is not durable and must not be treated as production-ready.
- Local tests use mocks and/or ephemeral PostgreSQL. Render/free-tier ephemeral storage is not an approved durable store. A multi-instance UAT deployment requires shared transactional PostgreSQL and approved migration/preflight evidence.
- Do not mark configuration closure or UAT release approval until the full CI and integrated checks pass and the protected UAT preflight succeeds.
