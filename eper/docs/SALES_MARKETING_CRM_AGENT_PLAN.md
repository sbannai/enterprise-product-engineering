# EPER Sales, Marketing & CRM Agents — Build Plan

**Status:** Design baseline and implementation backlog; not a production-readiness or Business UAT claim.
**Scope:** EPER native CRM first, provider-neutral AI, tenant/application scope, asynchronous execution, and human approval for every external action and CRM mutation.
**Delivery:** Continue in the existing consolidated PR stream. Keep domain, API, persistence, UI and provider adapters modular. Do not provision chargeable cloud resources.

## 1. Product outcome

Build three separately permissioned agents on one policy-controlled execution foundation:

1. **CRM Agent:** summarize verified contact/account activity, propose lead qualification, detect missing fields and duplicate candidates, recommend next actions, and prepare CRM changes for review. EPER native CRM is the initial system of record.
2. **Sales Agent:** prepare follow-up drafts, discovery questions, opportunity plans and proposal outlines from authorized CRM context. It cannot send communications, change stages, set commercial commitments or write CRM records without explicit approval.
3. **Marketing Agent:** prepare campaign briefs, audience/segment proposals, email/social/website content and KPI summaries from approved sources. It cannot publish, schedule, send or spend budget automatically.

All three use the existing single execution routing layer. They must not bypass the six capability families XX01–XX06 or the 228-requirement registry.

## 2. Architecture boundaries

- **UI:** customer-facing Growth Hub / CRM workspace, mobile-first. Agent configuration belongs to customer/application settings, not the platform admin shell. Support/admin tooling remains separate.
- **API:** shared negotiated response envelopes, request IDs, tenant/application authorization and bounded input validation.
- **Orchestrator:** asynchronous job lifecycle: queued, running, awaiting approval, succeeded, failed, cancelled. Include cancellation, deadlines, bounded retries, idempotency keys and status polling.
- **Agent skills:** CRM, Sales and Marketing handlers are separate modules with typed inputs/outputs and no direct network side effects.
- **Tool registry:** each tool has a schema, tenant/application scope, permission, risk class, timeout, idempotency policy and audit requirement. Deny by default.
- **AI provider adapter:** provider-neutral interface; template/rule-only mode works without an LLM. Provider selection and credentials are server-side; secrets never appear in UI/config payloads/logs.
- **Policy and approval:** human approval for external communications, publication, CRM writes, audience exports, pricing/discount/contract commitments and spend. Maker-checker separation is mandatory.
- **Persistence:** durable PostgreSQL job, draft, approval, configuration-version and audit records. No process-memory map as source of truth. Use tenant-scoped transactions, RLS, immutable audit and transactional outbox where applicable.
- **Integrations:** native CRM first. Email, WordPress, WhatsApp, analytics and external CRM remain disabled until tenant-scoped adapters, consent/authorization checks, secret management, audit and explicit approval paths exist.

## 3. Existing repository starting point

The current agent workflow module, Agent Workspace UI and Agent Tools Configuration UI are a draft-only prototype. They include CRM intents (lead qualification, contact summary, next action), Sales intents (follow-up, opportunity plan, proposal outline), Marketing intents (campaign brief, email copy, social copy), maker-checker review and an opt-in API flag. Approval intentionally does not execute the proposed action.

**Gaps to close before feature-complete status:**
1. Drafts use a process-memory map; restart loses data and multiple instances disagree.
2. Tenant identity currently comes from one process-wide tenant setting; this is not sufficient for multi-tenant customer access.
3. Bearer tokens map to principals through environment configuration; trusted identity/session and server-side tenant/application/role assignments must be integrated before customer rollout.
4. Agent response helpers do not consistently use the shared negotiated API v1 envelope and request-ID contract.
5. There is no durable asynchronous job queue/lifecycle; generation currently runs inline.
6. Configuration UI is preview-only and does not persist or enforce settings.
7. Templates use supplied context only; verified CRM retrieval, source provenance, deduplication and evaluations remain.
8. No model provider, external send/publish adapter or CRM write adapter is claimed connected. Keep those actions disabled.
9. UI source assertions are not browser, responsive or accessibility verification.

## 4. Agent functional scope

### CRM Agent
- Read authorized native CRM records only after tenant, application, role and record-level checks.
- Produce source-linked summaries; distinguish observed facts from inferred suggestions.
- Qualification dimensions include fit, need/intent, timing, authority and budget only where lawfully collected. Unknown values remain unknown.
- Suggest duplicates and missing fields; never auto-merge or enrich records.
- Propose CRM changes as a diff with source, reason, confidence, field validation and before/after values.
- Require human approval and optimistic concurrency checks before any write.

### Sales Agent
- Draft follow-ups, call preparation, discovery questions, opportunity plans and proposal outlines from authorized CRM facts.
- Prices, discounts, delivery dates, warranties and contract terms must be source-backed and owner-approved.
- Next-step proposals require owner and due-date confirmation.
- No send, CRM write, stage transition or commitment until scoped approval and an authorized execution adapter exist.

### Marketing Agent
- Draft campaign briefs, content variants and channel-specific copy.
- Audience selection requires approved criteria, consent/lawful-basis checks, suppression lists and minimum necessary data.
- Require claim substantiation, brand/legal review where applicable, unsubscribe/privacy checks and approved budget.
- No send, schedule, publish, audience export or spend in the initial release.

## 5. Shared data contracts

- **AgentDefinition:** agent ID, version, supported intents, input/output schema versions and risk class.
- **AgentJob:** job ID, tenant/application, requester, agent, intent, status, idempotency key, timestamps, deadline, safe failure code and result reference.
- **AgentDraft:** draft ID, tenant/application, job reference, typed payload, source references, validation findings, approval state, content hash and version.
- **ApprovalDecision:** approver and role, decision, note, timestamp, draft hash/version. Maker-checker is required.
- **AgentToolDefinition:** tool name/version, input schema, permission, risk class, timeout, idempotency behavior and side-effect classification.
- **AgentConfiguration:** tenant/application/environment, schema version, enabled agents/intents, provider mode, retention, permitted tools/roles and approval policy. Store secret references only.
- **AgentAuditEvent:** actor, tenant/application, request/job/draft/tool IDs, action, outcome, timestamp, safe metadata and correlation ID.

Tenant/application scope must be derived from trusted server identity. Caller-supplied IDs are selectors only and must be independently authorized. Every mutation and approval is durably audited.

## 6. Asynchronous execution contract

1. POST a validated job and return HTTP 202 with a job ID quickly.
2. A worker claims the job with a lease and bounded concurrency; status becomes running.
3. Tools are authorized at execution time, scoped, timed out and audited. Unregistered tool calls are denied.
4. Validate output schema and attach source/provenance before persisting the draft.
5. Side-effect proposals enter awaiting approval and are not executed.
6. The client polls a tenant-scoped job status endpoint; model work must not hold an HTTP request open.
7. Retry transient failures only, with bounded exponential backoff and jitter. Idempotency prevents duplicate jobs/effects.
8. Cancellation is allowed before irreversible execution. Any approved external action needs a separate execution job and fresh policy/authorization check.

## 7. Proposed API surface

- POST /v1/agent-jobs — enqueue an intent; return 202.
- GET /v1/agent-jobs/:jobId — scoped status/result.
- POST /v1/agent-jobs/:jobId/cancel — request cancellation.
- GET /v1/agent-drafts and GET /v1/agent-drafts/:draftId — scoped, paginated drafts/details.
- POST /v1/agent-drafts/:draftId/approve and /reject — maker-checker review, optimistic version/hash check.
- GET/PUT /v1/customer/applications/:applicationId/agent-configuration — scoped configuration with version/ETag concurrency.
- GET /v1/agent-tools — list permitted tool capabilities, never secrets.
- External-action endpoints remain out of scope until a named adapter and execution approval contract are reviewed.

Every endpoint must use the shared response contract, safe errors, request IDs, pagination limits, authorization tests and audit evidence.

## 8. Dependency-driven delivery sequence

| Step | Work | Exit criteria |
|---|---|---|
| A0 | Inventory current agent API/UI/tests and map requirements | Prototype and gaps documented; no production claims |
| A1 | Typed contracts, response envelope and authorization policy | Contract tests for success/error, identity, tenant/application scope, invalid input and request IDs |
| A2 | PostgreSQL stores and migrations for configuration, jobs, drafts, approvals and audit/outbox | RLS/cross-tenant, rollback/failure, migration-repeatability, concurrency and idempotency tests |
| A3 | Async job service and worker abstraction | Prompt 202 response; timeout/retry/cancel/lease tests; no unbounded in-memory queue |
| A4 | Native CRM read adapter and source provenance | Scoped reads, no write path, data-minimization and stale/missing-record tests |
| A5 | CRM Agent MVP | Qualification/summary/next-action drafts with evidence references and no writes |
| A6 | Sales Agent MVP | Follow-up/opportunity/proposal drafts; unsupported commercial facts remain unknown |
| A7 | Marketing Agent MVP | Campaign/email/social drafts with consent/claim/brand checks; no publishing/sending |
| A8 | Customer configuration persistence | Tenant/application/environment versioning, RBAC, audit and responsive/browser evidence |
| A9 | Review queue and maker-checker | Different reviewer required; stale draft hash/version rejected; approval alone never executes |
| A10 | Provider-neutral model adapter and evaluations | Template fallback, timeout/cost/usage telemetry, prompt-injection tests, schema validation and quality baselines |
| A11 | Optional integration adapters | Per-tenant setup, secret management, allowlists, consent, approval, idempotency, audit and sandbox tests |
| A12 | Integrated regression and release review | Current-SHA CI, traceability, mobile/browser/accessibility checks and runbook; Business UAT only after separate gate authorization |

## 9. Acceptance and safety requirements

- No cross-tenant or cross-application exposure through list, search, status, job result or draft routes.
- Derive tenant, actor, role and application assignment from trusted server identity, never request body/headers as proof of authorization.
- Generation or approval alone never mutates CRM or sends external communications.
- No provider credentials, unnecessary PII or untrusted raw prompt content in logs/audit.
- Treat CRM notes, documents, webpages and uploaded assets as untrusted data, not instructions; test prompt injection.
- Bind approvals to exact draft hash/version, action, recipient/audience, tenant/application and expiry; changed content invalidates approval.
- Async calls need deadlines, bounded concurrency, cancellation and idempotency.
- Audit failure blocks the state change. Keep durable audit for jobs, drafts, configuration and approval decisions.
- Responsive/accessibility tests at 320, 375, 390, 768, 1024 and 1440 px.
- Keep agent modules isolated from payments, pricing, workflows and customer support; reuse shared identity, persistence, response, audit and execution routing.
- Preserve the 228 requirements and 38 chapters; map each accepted feature to existing requirement IDs before closure claims.
- Do not provision chargeable resources or authorize Business UAT from this plan.

## 10. Immediate implementation slice and progress

- **A1 partial:** typed contracts for jobs, drafts, approvals, tool risk, transport validation and maker-checker version/hash checks have been added in `packages/agents/agent-contracts.ts`, with tests in `tests/agent-contracts.test.mjs`. Agent route envelope alignment and full tenant/application authorization coverage remain open.
- **A2 schema foundation added:** migration `packages/capabilities/migrations/003_agent_workflows.sql` defines tenant/application-scoped job, draft, approval and configuration tables, idempotency constraints, worker-claim index, composite foreign keys and forced RLS.
- **A2 repository slice added, runtime integration not yet proven:** `packages/agents/postgres-agent-store.ts` implements tenant/application transaction context, idempotent enqueue, leased worker claim, draft persistence, maker-checker review, bounded exponential retry, cancellation, and atomic audit writes for these operations. It is a persistence primitive, not yet connected to the live agent routes or a running worker.
- **Lifecycle contract tests added:** `tests/agent-store-lifecycle-contract.test.mjs` covers RLS context, skip-locked claims, lease ownership, bounded retry, cancellation and audit call paths. These are source-contract checks, not a substitute for live PostgreSQL concurrency/RLS tests.
- **Latest recorded CI before this lifecycle slice:** commit `d4c3b2c6f910fcf7a57594415f39e846bfb2d4a4` completed 11 reported workflows successfully. Newer commits for retries/cancellation and lifecycle tests still require current-head CI confirmation.
- **Still open:** live PostgreSQL integration and failure-injection tests; retry jitter and worker heartbeat/lease renewal; durable outbox handling; trusted customer identity/application assignment integration; shared API v1 envelope alignment; wiring the store into the live routes; worker service and job-status polling API.

Next actions:
1. Validate the new store and lifecycle tests on the current commit.
2. Add live database/failure-injection tests and configuration read/write persistence.
3. Wire the store behind the opt-in agent API and introduce a bounded async worker.
4. Integrate trusted tenant/application authorization before customer rollout.
5. Keep real model providers, CRM writes and external tools disabled until persistence, identity, approval and audit gates pass.
