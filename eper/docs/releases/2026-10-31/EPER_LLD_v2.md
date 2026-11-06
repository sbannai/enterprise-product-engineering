# EPER Low-Level Design — v2
**Baseline:** 2026-10-31 | **Status:** Engineering target; reconcile with migrations and route inventory before implementation.

## 1. Canonical logical entities
Customer(tenant_id,status); Application(application_id,tenant_id,status); TenantApplicationAssignment(tenant_id,application_id,status,version,reason,actor,timestamps); ActorApplicationAssignment(actor_id,tenant_id,application_id,status,version,revoked_at,reason,audit_ref); Product; MarketPrice(price_id,product_id,market_id,currency,amount_minor,price_book_id,version,status,effective_window,approval_ref); Plan/PlanVersion/PlanTariff; Entitlement(tenant_id,application_id,module_key,plan_version,status,limits,window); ApplicationSetting(tenant_id,application_id,integration_key,environment,schema_version,config,version); WorkflowDefinition/WorkflowStep/Actor/assignments; Job/Schedule/Execution/Attempt/DispatchFence; AgentDraft/Approval/ExecutionRequest; Ticket/Comment/Attachment; Asset/StorageReference; PaymentOrder/Payment/ProviderWebhook/Invoice/Receipt; AuditEvent/OutboxEvent; KPIObservation/IntegrationConfig.

These are logical names, not authorization to create duplicate tables. Reuse existing canonical entities and migrations.

## 2. Authorization predicate
Allow only if principal authenticated and active AND tenant membership active AND application belongs to tenant AND tenant assignment active AND actor-to-application assignment active (when actor-scoped) AND role permission granted AND module entitlement active AND customer/application access enabled AND resource-specific policy satisfied. Repeat at read/write/download and worker execution. Revoke/regrant increments version; stale assignment versions conflict. Fail closed if durable policy stores unavailable.

## 3. Pricing/payment invariants
Money uses integer minor units or exact NUMERIC. Currency is ISO code. Deterministic price resolution by product+market+effective instant+approved price-book; missing/ambiguous/expired price fails closed. Accepted quote snapshots immutable. Locale never performs FX. Payment, invoice and receipt must match quote amount/currency/version. Only independently verified captured status creates receipt. Unique provider event/idempotency constraints prevent duplicate effects. Unknown status enters reconciliation-required state.

## 4. API contracts
Use existing route inventory and canonical response envelope; do not create duplicate routes. All requests carry correlation/request ID and version/idempotency preconditions as appropriate. Stable error families: validation, unauthenticated, forbidden/non-disclosing not-found, conflict/stale-version, dependency-unavailable, rate-limited and internal. Long-running operations return job ID/status. Payment candidates: order creation, server verification, signed webhook, receipt PDF download. Scheduler candidates: schedule create/approve/pause/resume/cancel, execution list/detail and diagnostics. Customer settings/assets/tickets/agents enforce durable actor + tenant assignment. Admin assignment APIs expose current version/history and audited revoke/regrant.

## 5. Scheduler lifecycle
Schedule state transitions are explicit; due work is claimed by durable worker/lease mechanism, not dependent on browser polling or an in-memory timer. Dispatch fence prevents concurrent duplicate dispatch. Claim/lease, event identity and idempotency keys are bounded; long event identifiers use deterministic digest. Retry is bounded/backoff; stale lease recovery re-applies policy; permanent failure goes dead-letter with safe diagnostics. Pause/cancel/consent revocation fences pending dispatch. Re-check authorization immediately before external side effect.

## 6. Audit and secrets
Audit stores trusted UTC time, actor/effective roles, tenant/application/environment, action/outcome/reason, resource, correlation/request, source/build/schema and integrity predecessor/hash. No secrets or raw auth headers. High-risk mutation and audit commit atomically or through an approved transactional outbox; failure fails closed. Audit search/export is separately authorized and self-auditing.

## 7. Test obligations
Unit: policy matrix, assignment version/revoke/regrant, pricing windows, locale/currency, idempotency, state transitions, response schema. Integration: PostgreSQL migrations, restart persistence, concurrent claims, dispatch race, tenant/actor isolation, payment/webhook replay, receipt authorization, audit rollback. Resilience: outage fail-closed, worker restart/stale lease, dead-letter recovery, unknown payment reconciliation, backup/restore. UI: responsive/accessibility, loading/empty/error, no false live-state claims.
