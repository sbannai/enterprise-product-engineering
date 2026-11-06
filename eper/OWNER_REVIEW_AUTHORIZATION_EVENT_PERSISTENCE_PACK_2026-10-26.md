# Owner Review Pack: Authorization Matrix, Event Catalogue, and Durable Persistence

**Date:** 2026-10-26  
**Status:** DRAFT FOR OWNER / DESIGN-AUTHORITY REVIEW — NOT APPROVED  
**Scope:** Six shared capability families, existing 228 requirements / 38 chapters, and cross-cutting EPER application/admin workflows.  
**Decision guardrails:** Do not infer business rules. Do not provision chargeable infrastructure. Business UAT remains unauthorized until entry gates are evidenced.

## 1. Decisions already supplied by the owner

- Use existing approved acceptance criteria where available; escalate missing or ambiguous criteria.
- Durable database-backed design is required before production readiness.
- Prepare the full role/delegation/threshold/separation-of-duties matrix for review.
- Prepare one consolidated event catalogue for review.
- Keep Business UAT unauthorized until all entry gates are evidenced.

This pack converts those decisions into an engineering plan and explicit review items. It does not record any new approval.

## 2. Authorization matrix — review draft

### 2.1 Authorization invariants already supported by source

The implementation must preserve these baseline controls:

- Authentication is checked before authorization (`eper/packages/authorization/index.ts`).
- Tenant and application assignment are server-derived; a caller-provided tenant claim must not override trusted execution context.
- Module access fails closed if application assignment, active module/entitlement, time window, or role permission is not satisfied (`eper/packages/workflows/module-entitlement-policy.ts`).
- Capability authorization currently models tenant-scoped policies, optional principal matching, action/resource matches, explicit DENY precedence, and default DENY (`eper/packages/capabilities/authorization.ts`).
- Durable configuration mutations use expected versions and write audit evidence transactionally in PostgreSQL (`eper/packages/workflows/postgres-admin-configuration-store.ts`).
- Audit records carry actor type, actor ID, effective roles, outcome, reason code, resource, correlation/request IDs, and approval linkage where applicable (`eper/packages/audit/audit-event-store.ts`).

These are code-level observations, not proof that the complete business authorization matrix is approved or enforced end-to-end.

### 2.2 Candidate role groups (labels require owner confirmation)

| Candidate role group | Intended scope to validate | Default stance | Must not infer |
|---|---|---|---|
| Platform operator | Platform-wide availability and controlled support operations | Deny business-data access unless separately authorized | Tenant impersonation, payment approval, or unrestricted data export |
| Tenant administrator | Tenant-owned configuration, membership, application assignments | Own tenant only; tenant boundary always enforced | Cross-tenant access or self-approval of privileged changes |
| Application administrator | Configuration for assigned applications within one tenant | Assigned application and tenant only | Rights to change platform-wide controls or other applications |
| Business operator | Execute permitted business operations and view authorized records | Explicit operation/resource grant required | Policy administration, audit deletion, or approval of own restricted actions |
| Approver / delegated approver | Approve only eligible actions within a formally approved authority limit | Deny when limit, scope, delegation, or validity is missing | Self-approval or exceeding delegated authority |
| Auditor / compliance reviewer | Read approved audit and evidence views for authorized scope | Read-only; tenant/application scope enforced | Mutating operational state or changing/deleting audit history |
| Support engineer | Troubleshoot through explicitly scoped, time-limited support access | No standing unrestricted business-data access | Silent impersonation or bypass of tenant checks |
| Service identity | Execute only named machine-to-machine operations | Narrow action/resource/tenant scope | Human role inheritance or wildcard permissions by default |

The groups above are a review vocabulary, not an asserted final EPER role list. Map to the approved product roles after checking the authoritative identity/role baseline.

### 2.3 Action/resource decision matrix (proposed minimum)

Legend: **A** = allow only when explicitly scoped and assigned; **D** = deny by default; **C** = conditional on approved delegation and policy; **R** = read-only.

| Action class | Platform operator | Tenant admin | App admin | Business operator | Approver | Auditor | Support | Service identity |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| View tenant/application data | D/A* | A | A | A | A | R | D/A* | A |
| Change tenant/application configuration | D/A* | A | A | D | D | D | D | A* |
| Manage roles and assignments | D/A* | A* | A* | D | D | R | D | A* |
| Execute business transaction | D | A* | A* | A | D | D | D | A* |
| Approve a transaction/configuration change | D | C | C | D | C | D | D | D by default |
| Change pricing/payment-vendor configuration | D/A* | A* | A* | D | C | R | D | A* |
| View audit evidence | A* | R/A | R/A | D/A | R/A | R | D/A* | A* |
| Modify/delete historical audit evidence | D | D | D | D | D | D | D | D |
| Export bulk data | D/A* | C | C | D/C | D | C | D | D/C |
| Emergency support / break-glass | C | C | C | D | D | R | C | D |

`*` Requires explicit policy scope and logging; it is not a blanket grant. All rows remain proposals until owner/design authority confirms role names, action semantics, resource scope, and exceptions.

### 2.4 Delegation, thresholds, and separation-of-duties controls

| Control | Proposed enforcement rule | Required owner input / evidence |
|---|---|---|
| Delegation lifecycle | Delegation has delegator, delegate, scope, action set, valid-from/to, reason, approval reference, and revocation state | Approved delegation policy and permitted delegator roles |
| Amount/value thresholds | Enforce per transaction and aggregate period limits using authoritative currency/amount values; reject missing or stale threshold policy | Approved thresholds by transaction type, currency, tenant/application, and role |
| Maker-checker | A principal who creates/changes a restricted transaction cannot approve the same transaction | Explicit list of restricted actions and any approved exceptions |
| Two-person control | Require two distinct authorized principals for configured high-risk actions | Actions requiring dual approval and whether roles must differ |
| Role assignment | Privileged grants require authorized grantor, scoped target, reason, and audit event | Approved grantor/delegator matrix |
| Time-bound access | Temporary elevated access expires automatically and is reviewed; emergency access has a ticket/incident reference | Maximum duration, approver, review SLA, emergency criteria |
| Tenant/application boundary | Effective tenant and application are derived from trusted server-side identity and assignment records; every read/write is scoped | Approved identity source and assignment lifecycle |
| Policy changes | Versioned policy, expected-version update, validation, approval where required, durable audit, and rollback/recovery | Who can propose, approve, publish, and roll back policies |
| Denied attempts | Stable reason code, request/correlation ID, tenant/application context, and safe response; do not leak resource existence across tenants | Retention, alert thresholds, and sensitive-field redaction |
| Break-glass | Explicit short-lived exception, least privilege, immutable audit, post-event review; no silent bypass | Eligible roles, activation approvals, notification, review SLA |

**Implementation rule:** do not hard-code numeric thresholds, role aliases, or exceptions until the authoritative source is located and approved. Missing policy must fail closed and be recorded as a blocker, not filled with a guess.

## 3. Consolidated event catalogue — proposed contract inventory

### 3.1 Envelope and delivery requirements

The current event envelope interface in `eper/packages/events/index.ts` contains `eventId`, `eventType`, `eventVersion`, `occurredAt`, `producer`, optional `tenantId`/ `aggregateId`, `correlationId`, optional `causationId`, and `payload`. This interface alone does not implement durable delivery.

Proposed production contract requirements, subject to the approved EM-EVT-001 baseline:

- Versioned schema for every event type; stable name and owner.
- Tenant/application context where the event is tenant-owned; never trust payload tenant IDs over server context.
- Stable event ID and aggregate identity; correlation and causation identifiers.
- Transactional outbox for business state + event intent committed atomically.
- At-least-once delivery with idempotent consumers, retry/backoff, dead-letter handling, replay controls, ordering rules, and observable delivery state.
- PII/secrets redaction, retention, access policy, schema compatibility rules, and audit of replay/re-drive operations.
- A declared disposition for every current EVENT contract ID: implement an approved event, or owner-approved N/A with rationale. An identifier in the contract registry is not proof of an event publisher.

### 3.2 Event inventory for owner/design-authority review

All rows below are **candidate events**, not approved event bindings. The capability names are taken from the current registry; event names and triggers are proposals to validate against approved domain requirements.

| Candidate ID | Candidate event | Producer / trigger | Required payload concepts (not final schema) | Consumer / use | Status |
|---|---|---|---|---|---|
| EVT-XX01-01 | AuthoritativeRecordCreated | XX01 record create commits | tenant, record ID, version, state, actor, correlation | downstream lifecycle consumers | Candidate |
| EVT-XX01-02 | AuthoritativeRecordUpdated | XX01 update commits with expected version | tenant, record ID, prior/new version, changed-field summary | projections / audit correlation | Candidate |
| EVT-XX01-03 | AuthoritativeRecordDeleted | XX01 delete commits | tenant, record ID, final version, actor, reason | downstream cleanup / evidence | Candidate; retention/tombstone policy required |
| EVT-XX02-01 | AuthorizationPolicyChanged | Approved policy create/update/revoke commits | tenant, policy ID/version, action, actor, approval | policy cache invalidation / audit | Candidate; policy administration path must be confirmed |
| EVT-XX02-02 | AuthorizationDecisionDenied | Protected operation is denied | tenant/application, principal, action, resource type, reason code, correlation | security monitoring | Candidate; avoid sensitive resource details |
| EVT-XX02-03 | DelegationLifecycleChanged | Delegation granted, changed, expired, or revoked | delegator, delegate, scope, validity, approval reference | access review / enforcement | Candidate; depends on approved delegation model |
| EVT-XX03-01 | BusinessValidationFailed | Approved business command fails validation | requirement/rule IDs and versions, safe issue codes, correlation | UI feedback / remediation | Candidate; must not include sensitive input values |
| EVT-XX03-02 | BusinessValidationPassed | Approved command passes required validation | requirement/rule IDs and versions, aggregate reference | command processing / evidence | Candidate |
| EVT-XX03-03 | BusinessRuleSetPublished | Approved rule-set version is activated | rule-set ID/version, approver, effective time | cache refresh / reproducibility | Candidate; only if governed rule catalogue is in scope |
| EVT-XX04-01 | AuditEvidenceAppended | Durable audit/evidence append commits | evidence ID, tenant, action, actor, correlation, integrity metadata | evidence retrieval / compliance | Candidate; distinguish audit storage from business event delivery |
| EVT-XX04-02 | AuditIntegrityVerificationFailed | Integrity verification fails | evidence reference, tenant, verification time, safe failure code | security alert / investigation | Candidate |
| EVT-XX04-03 | EvidenceRetentionActionCompleted | Approved retention action completes | policy version, scope, counts, approval/ticket reference | compliance reporting | Candidate; only under approved retention policy |
| EVT-XX05-01 | WorkflowExceptionCreated | Exception create commits | exception ID, tenant, requirement, code, idempotency key reference | triage / support | Candidate |
| EVT-XX05-02 | WorkflowExceptionTransitioned | Valid exception state transition commits | exception ID, prior/new state, retry count, owner, reason | workflow projections / audit | Candidate |
| EVT-XX05-03 | WorkflowExceptionEscalated | Approved escalation rule triggers | exception ID, severity, target queue/owner, due time | notification / escalation handler | Candidate; requires scheduler and delivery policy |
| EVT-XX06-01 | GovernedReportPublished | Approved report snapshot publishes | tenant, report ID/version, generated time, source references | reporting consumers | Candidate |
| EVT-XX06-02 | GovernedReportRefreshRequested | Approved refresh request accepted | tenant, report ID, request ID, priority, correlation | report worker | Candidate; only if async refresh is in scope |
| EVT-XX06-03 | GovernedReportRefreshFailed | Refresh fails after retry policy | tenant, report ID, safe failure code, attempt count | operations / support | Candidate; requires failure/retry model |

### 3.3 Cross-cutting operational events

These are candidates only where the authoritative platform event baseline requires them:

- `OutboxDeliveryAttempted`, `OutboxDeliveryFailed`, `OutboxMessageDeadLettered`, `OutboxMessageReplayed`
- `RoleAssignmentChanged`, `TenantApplicationAssignmentChanged`
- `PrivilegedActionApproved`, `PrivilegedActionRejected`
- `ConfigurationVersionPublished`, `ConfigurationVersionRolledBack`

Avoid duplicating events where the approved EM-EVT-001 catalogue already defines a canonical type. Reconcile names, payloads, and ownership before implementation.

### 3.4 Required columns for the authoritative event register

The controlled register should include: event ID; canonical event name; capability/domain; source requirement IDs; source baseline and exact locator; producer; trigger/transaction boundary; schema version and schema locator; tenant/application scope; aggregate key; payload classification/redaction; consumer; delivery guarantee; ordering key; idempotency strategy; retry/backoff; DLQ/replay controls; retention; monitoring/SLO; test locator and tested commit; owner; design-authority approval reference; status.

## 4. Durable database-backed persistence — implementation plan

### Existing baseline

- `eper/docs/ADR-001-transactional-persistence.md` proposes PostgreSQL behind existing capability store contracts and explicitly prohibits cloud provisioning in the ADR work.
- `eper/docs/PERSISTENCE_ADAPTER_CONFORMANCE_MATRIX.md` currently marks the production transactional adapter as **Not implemented** for XX01, XX02, XX04, XX05, and XX06; XX03 is stateless.
- Local JSON adapters are documented for development/UAT only and are not safe for concurrent multi-process writers.
- PostgreSQL-backed stores already exist for selected product areas such as payments, admin configuration, customer application settings, module entitlements, and ticketing. This is not evidence that the six capability stores are PostgreSQL-backed.

### Required engineering work

1. Implement PostgreSQL adapters behind the existing capability store interfaces; keep in-memory adapters for unit tests and JSON adapters for local-only use.
2. Use tenant-scoped keys and predicates on every read/update/delete; reject tenant mismatch between trusted context and request payload.
3. Use optimistic concurrency and stable conflict codes; enforce idempotency with tenant-scoped unique keys where operations are retryable.
4. Commit domain mutation, required audit evidence, and outbox event intent in one database transaction.
5. Use append-only audit permissions/triggers and document key management, retention, backup, restore, and integrity verification. A hash chain alone is not proof against privileged database tampering.
6. Add versioned migrations, migration checks, rollback/forward-recovery strategy, and schema compatibility checks.
7. Run a shared adapter-conformance suite against in-memory, JSON, and PostgreSQL implementations, including tenant isolation, restart durability, concurrency races, idempotency, audit/outbox atomicity, and failure injection.
8. Test against an ephemeral/local PostgreSQL service in CI if repository workflow policy permits. Do not provision or connect to chargeable AWS resources as part of this work.
9. Do not switch production runtime to the new adapters until schema, secret management, backups, monitoring, and deployment approvals are evidenced.

### Acceptance gates for this workstream

- [ ] ADR-001 approved or returned with explicit changes.
- [ ] PostgreSQL schema/migrations reviewed and tested.
- [ ] All applicable capability adapters implemented.
- [ ] Shared adapter-conformance suite passes against PostgreSQL.
- [ ] Tenant isolation and concurrent update/idempotency tests pass.
- [ ] Audit/outbox transaction atomicity and recovery tests pass.
- [ ] Runtime configuration fails closed if production mode lacks the database adapter.
- [ ] Backup/restore and operational ownership are documented.
- [ ] Production deployment design approved; no chargeable resource created without separate explicit authorization.

## 5. Existing acceptance criteria and escalation workflow

For each of the 228 requirements:

1. Locate the authoritative approved BRD/SRS and exact criterion locator.
2. If a criterion is approved and measurable, map it to behavior, tests, and evidence.
3. If the source is draft, missing, contradictory, or non-measurable, set the requirement to `BLOCKED — OWNER DECISION REQUIRED`; include source name/version, ambiguity, and a concrete question.
4. Do not silently turn a generic SRS statement or a pilot test into an approved acceptance oracle.
5. Record the current implementation commit, test commit, execution result, defect/retest evidence, and any approved UAT decision separately.

## 6. Owner decisions still required

| Decision | Current state | Requested action |
|---|---|---|
| Acceptance criteria | Existing approved criteria may be used; gaps must be escalated | Review only the consolidated list of missing/ambiguous criteria, not 228 repeated prompts |
| Role catalogue and role names | Candidate role groups above are unapproved | Confirm authoritative role source and decide unresolved role/permission rows |
| Delegation and SoD | Rules and numeric thresholds not fully evidenced in this pack | Approve restricted actions, maker-checker scope, threshold values, and exceptions |
| Event catalogue | Candidate names/triggers are proposals | Approve canonical names/schema or direct reconciliation to EM-EVT-001; approve N/A where appropriate |
| Production database architecture | PostgreSQL ADR is proposed, not approved | Approve ADR-001 and deployment/security/operations design before production readiness |
| Business UAT | Explicitly unauthorized | No action to authorize UAT until all entry gates have evidence |

## 7. Status rule

**Current disposition: DRAFT / PARTIAL / NOT APPROVED.** This pack is an engineering review artifact. It is not an approved security policy, DATA/API/EVENT specification, production design, UAT entry approval, or Business UAT acceptance.
