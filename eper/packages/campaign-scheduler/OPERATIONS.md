# Campaign scheduler operations

## Safety defaults

- Keep `EPER_CAMPAIGN_SCHEDULER_API_ENABLED` unset or set to anything other than `true` until the readiness checks and controlled tests are complete.
- Do not enable outbound provider dispatch for customer campaigns until an operator has approved provider configuration, tenant/application scope, consent and quiet-hours policy, and the downstream idempotency contract.
- Business UAT is a separate acceptance gate. A deploy, successful health check, or passing automated test does not constitute Business UAT acceptance.
- Do not provision chargeable cloud resources as part of scheduler validation without explicit approval.

## Preflight

1. Confirm the intended environment and the database identity. The migration runner selects the first non-empty variable in this order:
   `EPER_CAMPAIGN_SCHEDULER_DATABASE_URL`, `EPER_AUDIT_DATABASE_URL`, `EPER_PAYMENT_DATABASE_URL`, `DATABASE_URL`.
2. Verify the selected database is the intended environment before running any migration.
3. From the `eper` directory, install locked dependencies, run the focused URL-selection tests, then run the complete build-and-test command:
   `npm ci`
   `npm run test:campaign-scheduler-url`
   `npm test`
4. Apply scheduler migrations only after review:
   `npm run migrate:campaign-scheduler`
5. Confirm the API uses the existing PostgreSQL pool and `EPER_AUDIT_PERSISTENCE=postgres`. Startup readiness must verify both scheduler tables and the `dispatch_started_at` column.
6. Confirm CI results and inspect any failures before enabling the API flag.

## Dispatch and cancellation semantics

- A schedule must be approved and scheduled, and the worker must pass its current policy authorization, before the atomic dispatch-start fence is acquired.
- The fence is single-use. Cancellation is rejected with `CAMPAIGN_DISPATCH_ALREADY_STARTED` when a running execution has crossed it.
- Once the fence is crossed, a provider timeout or lost worker lease is an ambiguous outcome. The execution is dead-lettered instead of automatically replayed; an operator must reconcile provider state before any manual requeue.
- Provider integrations must pass the execution idempotency key downstream. A database transaction cannot guarantee exactly-once delivery to an external provider.
- A pause prevents future eligible work; it cannot recall a provider call that has already crossed the dispatch fence.

## Rollback / incident handling

- If readiness fails, keep the scheduler API disabled and correct the database/migration configuration; do not bypass readiness.
- If an execution reaches `dead_letter` with `DISPATCH_OUTCOME_UNKNOWN`, inspect durable execution and provider records before taking action. Do not automatically reset the fence or requeue the execution.
- Preserve audit records and the execution idempotency key during incident review.
- Record environment, build SHA, migration state, test evidence, and operator approval in the release/UAT evidence before requesting acceptance.
