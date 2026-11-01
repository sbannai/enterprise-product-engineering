# Workflow Outbox Administration

## Scope

The Delivery Operations surface provides tenant/application-scoped inspection of workflow outbox dead letters and an audited request to requeue an event. It does not call external providers. The continuously running outbox worker remains the only component that dispatches events.

## Enablement

The API and screen are opt-in. Set:

- `EPER_WORKFLOW_OUTBOX_ADMIN_API_ENABLED=true`
- `EPER_ADMIN_CONFIG_API_ENABLED=true`
- `EPER_ADMIN_CONFIG_PERSISTENCE=postgres`
- `EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE=postgres`
- `EPER_AUDIT_PERSISTENCE=postgres`

The host must also supply the PostgreSQL capability pool, active tenant/application and actor/application assignment stores, and the workflow actor-role assignment store. Do not enable the surface until the workflow outbox, role, assignment, and replay-audit migrations have been applied and their RLS policies verified.

The API uses the existing server-side `EPER_ADMIN_CONFIG_IDENTITIES_JSON` bearer-token mapping. Tenant and actor identity are never accepted from request bodies.

## Authorization

Every operation requires:

1. A valid server-mapped administrator bearer credential.
2. The application to be actively assigned to the resolved tenant.
3. The administrator to be actively assigned to that application.
4. An active workflow role assignment carrying `workflow:admin`.

The replay service repeats its actor, tenant/application, role, and permission checks inside its database transaction. PostgreSQL row-level security is applied using tenant and application context.

## Endpoints

### Inspect dead letters

`GET /admin/applications/{applicationId}/workflow-outbox/dead-letters?limit=50`

- Limit is an integer from 1 to 200.
- Returns event metadata, attempt count, last error, and update time.
- Read-only; does not change delivery state.

### Request an audited replay

`POST /admin/applications/{applicationId}/workflow-outbox/dead-letters/{eventId}/replay`

Request body:

```json
{
  "reason": "Provider credentials were rotated and verified.",
  "idempotencyKey": "operator-generated-unique-key"
}
```

- Reason is mandatory and limited to 2,000 characters.
- Idempotency key must be 16–128 characters.
- The server supplies the operator worker reference; clients cannot override actor, tenant, application, or worker identity.
- Replay only accepts an event currently in `dead_letter` state.
- The immutable original event ID and payload are retained; the attempt counter is not reset.
- A replay ledger entry and global audit-chain event are committed with the requeue in one transaction.
- Repeated requests with the same key and event return the prior replay result. Reusing a key for another event is a conflict.

## Operator console

Open `/admin/workflow-outbox-ui`. Enter the application ID and administrator bearer token. The screen calls the API above and requires the same server-side authorization. It displays dead-letter events and requires an operator reason before submitting a replay request.

## Operational cautions

- Requeueing is not proof of delivery. The worker will claim and dispatch the event later.
- Delivery is at-least-once. Provider-side idempotency is mandatory.
- Confirm provider configuration and the underlying failure cause before replay.
- Monitor claim, delivery, retry, dead-letter, lease-loss, and interruption metrics.
- The operator console does not replace process supervision, alerting, provider approval, or a production readiness review.
