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

## Durable actor-to-application assignments

The actor membership administration API is separately gated and uses the same mapped administrator identities:

- `EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE=postgres` — enables PostgreSQL-backed actor/application membership. It requires the shared PostgreSQL pool and durable audit mode; API startup checks that migration `007_actor_application_assignments.sql` has been applied.
- `EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON` — tenant-to-application allowlist. An administrator may grant actor membership only for an application already assigned to that administrator's tenant. This remains the tenant-level boundary; actor membership is the additional per-actor boundary.
- `EPER_ADMIN_CONFIG_IDENTITIES_JSON` — maps each administrator bearer credential to its trusted tenant and actor identity. The mapped actor is recorded as the grant/revoke initiator.

| Method | Route | Purpose |
|---|---|---|
| GET | `/admin/actor-application-assignments?actorId=<actor>` | List assignment history, including revoked records and current versions, for an actor in the authenticated administrator's tenant |
| POST | `/admin/actor-application-assignments` | Grant or re-grant membership; body requires `actorId`, `applicationId` and `expectedVersion` |
| DELETE | `/admin/actor-application-assignments` | Revoke membership using the same version-checked body |

The same-origin admin console is `/admin/actor-application-assignments/ui`. The Pricing & Payments console links to it from Client & Application Access. Credentials remain in page memory and are not persisted in browser storage. Assignment mutations use optimistic version checks and write their audit event in the same database transaction; stale versions return `409`, applications outside the tenant allowlist return `403`, and a revocation without an existing assignment returns `404`.

The customer application list, settings and ticket APIs use the active actor/application membership when PostgreSQL assignment mode is enabled. Environment-based actor application IDs remain a compatibility path only when PostgreSQL assignment mode is not enabled.

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
