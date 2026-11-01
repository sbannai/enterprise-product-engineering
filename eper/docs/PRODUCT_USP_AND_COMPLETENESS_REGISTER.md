# EPER Product USP & Completeness Register

**Status:** Proposed product-control baseline  
**Date:** 2026-11-01  
**Repository baseline:** `main` at `880674ac86c1c33581280b94732a792b3fb9b90f`  
**Scope rule:** This register supplements the approved 228 requirements across Chapters 463–500. It does not replace, renumber, weaken, or silently reinterpret any approved requirement.

## 1. Product positioning

**Proposed positioning:** EPER is a configurable, AI-assisted enterprise application platform for building, operating, integrating, and governing industry-specific business applications through a shared multi-tenant foundation.

The initial industry accelerator remains Warehouse ERP / Supply Chain Management. The broader platform direction allows additional industry accelerators without turning every customer variation into bespoke code.

### Five product pillars

1. **Build** — configurable applications, forms, screens, workflows, and business rules.
2. **Automate** — reliable workflow execution, scheduling, approvals, escalations, and event-driven processing.
3. **Understand** — governed analytics, operational intelligence, and AI-assisted insight.
4. **Integrate** — secure APIs, webhooks, provider adapters, and reusable connectors.
5. **Govern** — tenant isolation, authorization, auditability, commercial entitlements, and operational controls.

## 2. Evidence and status vocabulary

Every capability must carry separate statuses. A design, UI preview, route, interface, or passing shared test is not proof of end-to-end completion.

| Status | Meaning |
|---|---|
| NOT_STARTED | No verified implementation evidence |
| DESIGNED | Approved scope, contracts, data model, and acceptance criteria exist |
| FOUNDATION | Reusable interfaces or infrastructure exist; user-facing behavior is incomplete |
| PARTIAL | Some real behavior works; one or more mandatory paths or controls are missing |
| IMPLEMENTED | Required behavior exists in source, including failure paths |
| TESTED | Requirement-specific tests pass against the exact recorded commit |
| BUSINESS_ACCEPTED | Authorized business owner accepts controlled evidence |
| BLOCKED | A named dependency, decision, defect, or missing evidence prevents progression |

Track UI, API, persistence, authorization, audit/events, automated tests, operational readiness, and business acceptance independently. Never infer one from another.

## 3. Product completeness register

The initial dispositions below are conservative repository-audit starting points, not release declarations. Revalidate them against current source, exact-head CI, durable persistence, and observable end-to-end behavior before changing status.

| ID | Capability | Initial disposition | Priority | Product outcome |
|---|---|---|---|---|
| USP-001 | Workflow execution engine | IMPLEMENTED / CI-VALIDATED; OPERATIONS PARTIAL | P0 | Execute configured workflows with durable state, transitions, approvals, retries, and audit |
| USP-002 | Low-code application and form builder | NOT_STARTED / DISCOVERY | P1 | Build reusable application screens, forms, and field rules through configuration |
| USP-003 | AI business intelligence | FOUNDATION / DISCOVERY | P1 | Ask governed natural-language questions and receive source-linked operational insights |
| USP-004 | Business rules and decision engine | PARTIAL / VERIFY | P1 | Versioned, testable rules shared across applications and workflows |
| USP-005 | Integration marketplace and connector framework | FOUNDATION / VERIFY | P1 | Tenant-scoped reusable integrations with health, retries, and credential isolation |
| USP-006 | SLA, escalation, and notification orchestration | PARTIAL / VERIFY | P1 | Reliable timers, escalation policies, delivery tracking, and deduplication |
| USP-007 | Document management and collaboration | DISCOVERY | P1 | Versioned documents, access controls, retention, and application-scoped sharing |
| USP-008 | Enterprise search | DISCOVERY | P1 | Permission-aware search across authorized application records and documents |
| USP-009 | Mobile and offline operations | DISCOVERY | P2 | Mobile task execution, capture, queued sync, and conflict handling |
| USP-010 | Commercial intelligence and usage metering | PARTIAL / VERIFY | P1 | Subscription, entitlements, quotas, usage measurement, renewal, and revenue visibility |
| USP-011 | Governance and compliance cockpit | PARTIAL / VERIFY | P1 | Cross-application audit, risk, SLA, control, and evidence visibility |
| USP-012 | Data import, export, and migration tooling | DISCOVERY | P1 | Controlled onboarding, validation, reconciliation, and portable exports |
| USP-013 | Backup, restore, and disaster recovery | BLOCKED / VERIFY | P0 | Tested recovery objectives, backups, restore drills, and operational ownership |

### P0 — foundational closure

**USP-001 Workflow execution engine**

The merged implementation on `main` now includes application-scoped immutable workflow publication with version/digest pinning and a publication lifecycle ledger; PostgreSQL-backed workflow instances and append-only transitions; application-scoped role definitions and actor-role assignments; authorization re-checks, expected-version concurrency control, idempotent start/transition replay, same-transaction audit, and a transactional outbox. Opt-in admin/customer APIs expose publication, role administration, instance start and transitions; the workflow API remains disabled by default. The reusable `WorkflowOutboxProcess` continuously drains authorised scopes with bounded batches, retry/dead-letter handling and graceful cancellation. Exact-main technical CI/integration validation is recorded in the workflow design. This supports IMPLEMENTED / CI-VALIDATED for the execution slice—not production readiness: the PostgreSQL scope-discovery adapter (`PostgresWorkflowOutboxContextSource`) and SIGINT/SIGTERM shutdown adapter (`runWorkflowOutboxWorkerHost`) exist, but the production host must wire a restricted platform-worker pool and approved dispatcher, independently supervise/restart the worker, and provide delivery dashboards/alerts, load/recovery evidence and deployment configuration.

Acceptance criteria:
- Persist workflow definitions and version history durably in PostgreSQL.
- Persist each workflow instance, current state, transition history, actor, and correlation ID.
- Execute only active, validated workflow versions; existing instances retain their pinned version unless an approved migration occurs.
- Enforce tenant, application, principal, role, permission, and entitlement checks server-side on every transition.
- Support task assignment, form submission, approvals, rejection, delegation policy, and separation-of-duties controls.
- Support conditional transitions with deterministic, versioned rule evaluation.
- Make transition processing transactional and idempotent; duplicate requests must not duplicate business effects.
- Provide bounded retry, timeout, cancellation, dead-letter/error disposition, and operator recovery.
- Emit versioned domain events through a transactional outbox; consumers must be idempotent.
- Record durable, correlated audit evidence for successful and denied actions.
- Provide operational visibility into queued, active, awaiting-approval, completed, failed, and cancelled instances.
- Test restart recovery, concurrent transitions, stale versions, tenant isolation, authorization denial, retry, and event redelivery.

**USP-013 Backup, restore, and disaster recovery**

Acceptance criteria:
- Define owner-approved RPO/RTO per environment and data class.
- Document encrypted backup schedule, retention, key ownership, and access controls.
- Demonstrate restore into an isolated local/test environment without chargeable cloud provisioning.
- Verify restored record counts, referential integrity, tenant isolation, audit continuity, and application startup.
- Record restore duration, exceptions, tested commit/schema version, and sign-off.
- Do not claim disaster recovery from backup configuration alone; a successful restore drill is required.

### P1 — differentiating product capabilities

**USP-002 Low-code application and form builder**

Acceptance criteria:
- Provide versioned application definitions, page/screen layouts, reusable components, and form schemas.
- Support typed fields, validation, conditional visibility, calculated/read-only fields, and repeatable sections.
- Bind forms to approved API/data contracts; the browser must not become an authorization boundary.
- Support draft, preview, validation, publish, rollback, and version comparison.
- Reuse platform identity, tenant/application boundaries, workflow, audit, and localization services.
- Enforce role/permission rules for view, create, update, submit, and approve actions.
- Prevent unsafe executable script injection; use a constrained component and expression model.
- Include accessibility, responsive layout, keyboard navigation, and automated schema/component tests.
- Demonstrate one complete application journey from configured form through persisted record and workflow execution.

**USP-003 AI business intelligence**

Acceptance criteria:
- Start with read-only analytics over an approved semantic/reporting layer; no arbitrary SQL execution from model output.
- Apply tenant, application, row-level, and field-level authorization before data retrieval.
- Show source records/metrics, query scope, calculation definitions, freshness, and time window for every answer.
- Distinguish measured facts, computed results, estimates, and model-generated explanations.
- Provide deterministic KPI definitions and reconciliation against governed reports.
- Support natural-language questions, summaries, trend explanations, anomaly candidates, and forecasts with confidence/limitations.
- Prevent cross-tenant retrieval, prompt injection through source data, secret disclosure, and unauthorized exports.
- Log model/provider, prompt-template version, tool calls, data scope, approvals, and output references without leaking sensitive payloads.
- Require human approval for external actions, CRM writes, publication, spend, or commercial commitments.
- Provide a rules-only/fallback mode and evaluation tests for correctness, authorization, grounding, and refusal behavior.

**USP-004 Business rules and decision engine**
- Version rules, validate schemas, provide test fixtures and explainable decision traces.
- Define deterministic precedence, conflict handling, effective dates, and rollback.
- Ensure rules execute server-side and are consistently applied across UI, APIs, workflows, and jobs.

**USP-005 Integration marketplace**
- Define connector manifest, scopes, permissions, secret references, health checks, versioning, and compatibility.
- Provide signed webhook validation, idempotent delivery, bounded retries, replay controls, and dead-letter visibility.
- Keep provider credentials server-side and tenant/application scoped.
- Publish a connector only after security, failure-mode, and contract tests pass.

**USP-006 SLA and notification orchestration**
- Use durable schedules and event-driven deadlines rather than browser timers.
- Support business calendars, time zones, pause/resume policy, escalation chains, delivery receipts, deduplication, and retry.
- Keep notification preferences, consent, and channel authorization tenant-scoped.

**USP-007 Document management**
- Include metadata, version history, checksum, access policy, retention, legal hold where applicable, and malware scanning integration points.
- Support storage-provider abstraction without exposing provider credentials or cross-tenant object access.

**USP-008 Enterprise search**
- Enforce the same authorization and tenant filters as the source system at query time.
- Support record-level deep links, freshness indicators, index deletion/update propagation, and audit of sensitive searches.

**USP-010 Commercial intelligence**
- Meter billable usage from authoritative server-side events.
- Version plan, tariff, quota, currency, tax policy, and effective date.
- Preserve accepted quote/contract/payment snapshots; no silent repricing.
- Reconcile usage, invoices, payments, credits, and entitlements.

**USP-011 Governance cockpit**
- Consolidate audit, access changes, workflow exceptions, integration failures, SLA breaches, and evidence status.
- Provide role-scoped views and auditable exports.
- Clearly distinguish alerts, confirmed incidents, and accepted compliance evidence.

**USP-012 Data onboarding and portability**
- Support schema mapping, dry run, validation, duplicate detection, import preview, controlled commit, rollback/reconciliation, and export.
- Record source, actor, tenant/application scope, batch ID, errors, and counts.

## 4. Architecture and traceability guardrails

- Preserve the 228 approved requirements and 38 chapters. Any additional product requirement receives a separate USP identifier and explicit traceability; it must not overwrite the baseline.
- Reuse the six capability families: authoritative records, authorization, business validation, audit evidence, exception handling, and governed reporting.
- Keep UI, API, persistence, authorization, audit/events, and tests at aligned maturity. A preview UI is not a completed capability.
- PostgreSQL is the approved target for local development and integration tests. No chargeable AWS resources are authorized by this register.
- Use tenant/application context from trusted server-side identity and assignments, never a process-wide tenant setting or client-supplied tenant as authority.
- Keep all external AI actions and CRM mutations behind explicit human approval and maker-checker policy.
- Keep payment provider selection distinct from a working live provider adapter. Sandbox evidence is not live-payment evidence.
- Avoid one-PR-per-small-change. Consolidate by coherent vertical slice and shared dependency; do not create orphan branches or duplicate implementations.
- No Business UAT authorization is implied. Existing entry gates and evidence rules remain controlling.

## 5. Delivery sequence and exit gates

| Sequence | Workstream | Exit condition |
|---|---|---|
| 0 | Reconcile active PRs, CI, persistence and API contracts | Exact-head checks, clean ownership, no duplicate/orphan work |
| 1 | Workflow runtime operationalization | Supply trusted production context and dispatcher, host/supervise the continuous worker, add delivery observability, and complete load/recovery evidence |
| 2 | Low-code form/application vertical slice | A configured form creates a durable record and launches the workflow with RBAC and audit |
| 3 | Governed AI BI vertical slice | A user asks a KPI question and receives a permission-checked, source-linked, reconciled answer |
| 4 | P1 enterprise capabilities | Connector, SLA, document, search, commercial and governance criteria pass in prioritized slices |
| 5 | Operational readiness | Backup/restore, observability, security, performance, and recovery evidence are accepted |

Each vertical slice must include API contract, UI behavior, durable persistence, authorization, audit/event behavior, automated tests, failure handling, and operational notes before being marked IMPLEMENTED.

## 6. Required reporting fields

For each USP ID, maintain:
- Product owner and engineering owner.
- Business outcome and user journey.
- Dependencies and impacted capability families.
- Design status and approved acceptance criteria.
- UI, API, persistence, authorization, audit/events, test, and operations status.
- Source paths and exact tested commit.
- CI run URL and test evidence.
- Known defects, risks, blockers, and decisions required.
- Business acceptance status and approver.
- Last verified timestamp.

## 7. Immediate next engineering actions

1. Operationalize the merged workflow runtime: trusted context provider, production dispatcher, worker host lifecycle/supervision, delivery dashboards/alerts, and deployment configuration.
2. Complete load, restart/recovery, dead-letter replay, and operational runbook evidence for the workflow runtime.
3. Harden delegation, thresholds, and separation-of-duties policy in the application-scoped authorization model.
4. Define the first low-code builder as schema-driven forms and page composition, not an unrestricted visual programming environment.
5. Define AI BI as a governed read-only semantic query experience before adding predictive or agentic actions.
6. Keep changes consolidated, tested, and traceable; merge only after required reviews and exact-head CI are green.

**Current disposition (main `880674a`):** product direction and completeness criteria are documented. USP-001 workflow execution is IMPLEMENTED / CI-VALIDATED at the technical-slice level; runtime operations remain PARTIAL. Other USP dispositions remain conservative pending capability-specific evidence. No Business Acceptance or Business UAT authorization is implied.


**Baseline refresh (2026-11-01):** The current `main` baseline is `880674ac86c1c33581280b94732a792b3fb9b90f`. Its 13 exact-commit check-runs completed successfully, including the integrated gate, PostgreSQL/payment/receipt contracts, six-capability HTTP exercise, container runtime smoke, and the 228-requirement / 38-chapter pilot matrix. This confirms the recorded technical CI baseline only; it does not upgrade any capability to production-operational or business-accepted status.
