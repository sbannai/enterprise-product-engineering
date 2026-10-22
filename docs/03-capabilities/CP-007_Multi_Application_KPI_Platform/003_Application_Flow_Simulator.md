# Application Flow Simulator — implementation note

## Scope

The first implementation provides a deterministic, offline simulator for flows between applications in one tenant. It is a local service seam, not a deployed UI or live integration.

## Included

- Flow model with ordered transform, validate, route, and audit steps.
- Tenant boundary checks for the flow and both application endpoints on every step.
- Application lifecycle check: archived applications cannot participate.
- Run trace with unique run, event, and correlation identifiers; timestamps; per-step status and details.
- Fault injection for validation failure, authorization denial, duplicate event ID, and simulated timeout.
- Tenant-scoped run lookup and history listing.
- Explicit SIMULATED evidence mode and NO_EXTERNAL_SIDE_EFFECTS marker.

## Guardrails

- No network calls, payment gateway calls, external connector execution, or application mutation.
- Duplicate event IDs are rejected within a tenant's in-process simulator instance; this is not a durable, distributed idempotency guarantee.
- Run history and the duplicate-event index are in memory and disappear when the process restarts.
- The simulator does not authenticate users. Callers must not expose it through a public route until identity, authorization, persistence, rate limits, and audit controls are implemented and tested.
- Simulated evidence is not production execution evidence and cannot constitute real-world UAT acceptance or sign-off.

## Example flow

```json
{
  "flowId": "order-to-inventory",
  "tenantId": "tenant-a",
  "name": "Order to inventory",
  "steps": [
    {
      "stepId": "s1",
      "name": "Transform event",
      "kind": "transform",
      "sourceApplicationId": "orders-app-id",
      "targetApplicationId": "inventory-app-id"
    },
    {
      "stepId": "s2",
      "name": "Validate event",
      "kind": "validate",
      "sourceApplicationId": "orders-app-id",
      "targetApplicationId": "inventory-app-id"
    },
    {
      "stepId": "s3",
      "name": "Route event",
      "kind": "route",
      "sourceApplicationId": "orders-app-id",
      "targetApplicationId": "inventory-app-id"
    },
    {
      "stepId": "s4",
      "name": "Write audit trace",
      "kind": "audit",
      "sourceApplicationId": "orders-app-id",
      "targetApplicationId": "inventory-app-id"
    }
  ]
}
```

## Next gates before live use

1. Approve the flow schema and persistence model.
2. Add durable tenant-scoped flow/run storage with concurrency-safe idempotency.
3. Integrate authenticated principals and application action grants.
4. Build a flow designer and trace viewer on top of the service.
5. Add connector adapters behind an explicit allowlist and sandbox mode; never reuse simulated execution as a live connector.
6. Complete security review and real-world UAT approval before enabling live execution.

## Verification

Tests cover successful simulation, tenant isolation, archived app rejection, validation failure, authorization denial, duplicate event ID, timeout injection, and run retrieval scoping. CI results must be checked against the resulting branch commit before treating this as verified.