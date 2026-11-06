# EPER Cross-Cutting Audit Trail and Activity Evidence

## Requirement

Every meaningful user, service, integration, configuration, workflow, and administrative action must produce attributable, tenant-scoped audit evidence. Auditability is a cross-cutting platform control; it is not limited to the agent console or payment module. This document proposes a control requirement and does not declare the control implemented or any existing requirement closed.

## Activity coverage

Record successful actions and security-relevant failures for:

- Authentication and authorization: login/token acceptance or rejection, principal resolution, permission denials, role and membership changes, session changes, and privileged access.
- Data access: sensitive record reads/exports, searches that expose protected data, downloads, and bulk operations, using resource identifiers and counts rather than copying record contents.
- Data mutations: create/update/delete, imports, merges, archival, restore, and failed mutation attempts across school, college, corporate, CRM, sales, marketing, documents, fees, receipts, and reports.
- Workflow state: admissions, approvals/rejections, TC issuance, fee assessment/waivers/concessions, payment initiation/callback/reconciliation/refund, receipt generation/reissue, timetable changes, and other state transitions.
- Agent and AI activity: draft creation, source/context references, model/provider and version when applicable, tool invocation, policy/guardrail outcome, human review, approval/rejection, execution authorization, and external execution result. Do not store hidden reasoning or raw prompts containing sensitive data.
- Configuration and security: tenant/application/environment configuration changes, feature flags, access policies, secrets rotation events (never secret values), retention settings, integration endpoints, and audit configuration changes.
- Integration and automation: webhook verification/result, idempotency decisions, retries, scheduled jobs, external API outcomes, notifications, data sync, and delivery callbacks.
- Platform operations: deploy/release, migration, backup/restore, export, break-glass access, and audit search/export.

Read-only low-risk telemetry can be sampled where explicitly approved, but security, financial, approval, permission, configuration, and data-mutation events must never be sampled away.

## Canonical event envelope

Each event must include:
- `eventId`: globally unique immutable identifier.
- `occurredAt`: UTC timestamp assigned by the trusted server.
- `tenantId`, `applicationId`, and `environment`.
- `actorType` (human/service/system), authenticated `actorId`, and effective role/authorization context.
- `action`, `outcome` (success/denied/failure), and stable `reasonCode` when applicable.
- `resourceType`, opaque `resourceId`, and operation/correlation/request/trace IDs.
- `source` (API/UI/job/integration), route or operation name, and service/build version.
- `beforeHash` and `afterHash` where meaningful and safe; do not put whole sensitive records into the event.
- `approvalId`, `parentEventId`, and idempotency key where applicable.
- Schema version and integrity metadata.

Never log passwords, bearer/API tokens, secret values, payment card data, full bank credentials, raw authentication headers, or unnecessary personal data. Redact or tokenize sensitive fields before event creation. For payments, record authoritative transaction/reference IDs, amounts/currency only when needed, status transitions, and provider result codes—never payment secrets.

## Integrity, durability, and access

- Persist events to durable storage before acknowledging a protected mutation as successful; if audit persistence fails, fail closed for high-risk mutations. Any explicitly approved degraded mode must be narrowly scoped, alerting, and documented.
- Use an append-only interface and a database role that can insert/read but cannot update/delete existing evidence. Corrections are new linked events, never edits to history.
- Protect evidence against tampering using a hash chain or signed batches, restricted retention administration, independent backups, and periodic integrity verification.
- Enforce tenant and role filters server-side for search and export. Audit-log access and exports must themselves create audit events.
- Use a transactional outbox or equivalent to avoid a business mutation succeeding while its audit record is silently lost. For database-backed operations, commit business state and audit/outbox record atomically.
- Add explicit retention schedules per data class and jurisdiction, legal hold, controlled expiry, and verified purge evidence. Do not assume a retention duration without policy approval.
- Provide searchable filters by tenant, time, actor, action, resource, outcome, correlation ID, and requirement/control mapping. Export must be permissioned and logged.
- Monitor audit pipeline health, persistence lag, integrity failures, and rejected writes. Alert on missing events for critical operations and privileged audit configuration changes.

## Acceptance criteria

1. Every listed critical action emits one attributable event on both success and security-relevant failure paths.
2. Actor identity is derived from authenticated server-side credentials; caller-supplied identity headers are never trusted.
3. Tenant identity is derived from trusted server-side authorization context, not accepted from untrusted request bodies alone.
4. High-risk mutations cannot return success if durable audit evidence cannot be committed.
5. Events are append-only for application roles; correction and retention actions are separately evidenced.
6. Automated tests prove tenant isolation, actor attribution, redaction, denied-operation logging, failure handling, event integrity, and atomicity/outbox recovery.
7. Audit search/export and configuration changes are also audited.
8. CI includes audit contract, mutation coverage, migration, retention, and tamper-resistance tests.
9. A traceability matrix maps each route/job/state transition to its event type and test.
10. No requirement is marked closed merely because this specification exists; closure requires implementation, evidence, and review.

## Current status and implementation sequence

**Status: partial implementation in PR #206; not yet release-ready.** A PostgreSQL append writer, migration, payload-key redaction, hash-chain head, and agent-route audit-writer seam are present. API startup can connect the writer to the payment PostgreSQL pool only when `EPER_AUDIT_PERSISTENCE=postgres`; this also requires `EPER_PAYMENT_PERSISTENCE=postgres` and a successfully applied audit migration. The default is `disabled`, so audit capture is not automatic unless explicitly configured. Agent draft state remains process-memory only; the audit record does not make the draft itself durable. Runtime-wide audit coverage, production database role grants, verified migration execution, audit search/export, retention, and integrity verification remain open. Do not describe the system as fully audited until these controls are implemented and tested.

Implement in one consolidated change on the existing feature PR:
1. Establish the canonical event schema, append-only repository interface, and migrations for durable audit/outbox storage. The initial event migration must be applied and verified before enabling the writer.
2. Enable the configured PostgreSQL writer in the protected environment; wire trusted request identity/correlation and instrument agent draft/list/review, payment state transitions, capability execution, configuration, authentication/authorization, and administrative actions. The current change instruments the agent route seam only; other routes are still open.
3. Add actor/tenant authorization and sensitive-field redaction tests; prove audit-failure behavior and transactional/outbox recovery.
4. Add permissioned audit search/export and retention/integrity operations, with those operations audited too.
5. Generate a route/job-to-event traceability matrix and evidence report from automated tests.
6. Keep external messaging and other side effects disabled until their consent, approval, idempotency, and audit requirements pass verification.

The 228 approved requirement IDs, 38 chapters, and six capability families remain unchanged. This cross-cutting audit control supplements traceability; it does not renumber or silently replace the approved baseline.
