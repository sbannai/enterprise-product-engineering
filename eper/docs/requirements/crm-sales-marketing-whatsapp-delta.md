# Requirements Addendum — CRM, Sales, Marketing and WhatsApp Tooling

**Status:** Proposed delta for PR #206; not an approved replacement for the baseline.
**Baseline control:** Preserve all 228 approved requirements, all 38 chapters, six capability families, and the existing execution router. This addendum introduces no renumbering and does not claim requirement closure.

## Requirement traceability delta

| Delta ID | Capability | Requirement | Acceptance criteria | Current implementation status |
|---|---|---|---|---|
| CRM-SM-DELTA-01 | CRM agent | Create lead-qualification, contact-summary and next-action drafts | API accepts supported intent and returns a draft scoped to the configured tenant | Prototype; deterministic templates and process-memory storage |
| CRM-SM-DELTA-02 | Sales agent | Draft follow-ups, opportunity plans and proposal outlines | Unsupported intents rejected; no external send or CRM mutation | Prototype; draft-only |
| CRM-SM-DELTA-03 | Marketing agent | Draft campaign briefs, email copy and social copy | Draft is reviewable before any publication | Prototype; draft-only |
| CRM-SM-DELTA-04 | Review governance | Require maker-checker approval | Draft creator cannot approve/reject own draft; approval only changes draft status | Implemented in prototype; test/CI verification pending for current head |
| CRM-SM-DELTA-05 | Tenant/application tools config | Scope settings by tenant, application and environment | Preview identifies tenant, application, environment and safe defaults | UI/type preview only; no durable persistence or runtime enforcement |
| CRM-SM-DELTA-06 | WhatsApp posts | Configure provider, account/phone identifiers, approved template and mode | Provider is Meta Cloud API, Twilio adapter or provider-neutral; opt-in, human approval and audit required; sending disabled by default | Configuration preview only; no provider adapter or send |
| CRM-SM-DELTA-07 | Data protection | Keep credentials server-side and protect recipient consent | No secrets in browser; enforce opt-in/opt-out, tenant isolation, audit and idempotency before live sends | Design requirement; enforcement outstanding |
| CRM-SM-DELTA-08 | Configuration governance | Persist versioned config and enforce role permissions | Tenant/application/environment config survives restart, is versioned, audited and checked by server for every action | Not implemented |
| CRM-SM-DELTA-09 | Help and support | Explain setup, approval, WhatsApp and troubleshooting | Help Center distinguishes preview from live integration and states known limitations | Documentation addendum supplied; publish/review pending |\n| AUDIT-DELTA-01 | Cross-cutting audit evidence | Record attributable events for user, service, integration, configuration, workflow, administrative and security actions across all capability families | Event records include trusted UTC time, tenant/application/environment, actor and effective roles, action/outcome/reason, resource, correlation/request IDs, source/build, schema version and integrity linkage; denied and failed actions are included | Schema and writer prototype exist; only agent draft route is instrumented; migration/runtime-wide coverage not verified |\n| AUDIT-DELTA-02 | Audit persistence and integrity | Persist events durably and detect modification, deletion, gaps or chain tampering | High-risk mutation is not acknowledged before audit persistence; writer failure rolls back/fails closed or uses an approved, evidenced degraded-mode policy; verifier replays canonical hashes and confirms predecessor links and chain head | Writer serializes append and calculates SHA-256 hashes; startup schema gate added; durable business-transaction/outbox coupling and chain verifier outstanding |\n| AUDIT-DELTA-03 | Audit access and export | Provide authorized, tenant-scoped search and export for compliance and incident investigation | Filter by time, actor, action, outcome, resource and correlation; enforce server-side role/tenant scope; audit searches and exports; redact sensitive fields; bound export size and require a reason | Wireframe preview added; live search/export and permission enforcement not implemented |\n| AUDIT-DELTA-04 | Audit operations and retention | Operate, monitor and retain audit evidence under approved policy | Monitor append failures, lag and integrity failures; verify backups/restores; define retention, legal hold and separately authorized purge workflow; application role cannot update/delete evidence | Append-only triggers and schema indices defined; least-privilege database grants, monitoring, retention/purge workflow and restore verification outstanding |\n| AUDIT-DELTA-05 | Audit UI transparency | Clearly distinguish a prototype audit screen from a live evidence console | UI labels preview-only until backed by authenticated server search; no browser-generated integrity claims; access to audit evidence is itself logged | Static wireframe preview only; no event query or export is executed |

## Non-functional and safety constraints
- No external email, social post, WhatsApp message, CRM write, pipeline mutation, or transaction may occur from draft creation or approval alone.
- Keep external execution disabled until provider adapters, identity/authorization, tenant-scoped durable storage, consent/opt-out enforcement, immutable audit, idempotency, rate limiting and explicit execution authorization are implemented and tested.
- Store provider credentials in server-side managed secrets; never in browser HTML, preview JSON, logs or documentation examples.
- Treat current in-memory drafts as disposable prototype data, not an audit record.
- Do not alter the 228 approved requirement IDs or the 38-chapter baseline. Map these delta IDs to canonical requirement IDs only after the requirements owner confirms the crosswalk.


## Mandatory audit cross-cutting release gate

The audit delta is additive and must not renumber, replace, or silently close any of the 228 approved requirements. The five AUDIT-DELTA entries are proposed additions pending requirements-owner approval and a canonical requirement crosswalk. Until approved, track them as supplemental control requirements.

### Required traceability evidence
- **Wireframe:** `eper/wireframes/agent-tools-whatsapp-wireframe.html` — Audit trail section with UTC time range, actor/action/outcome/resource/correlation filters, event-detail fields, and export preview. It explicitly states that no live query/export occurs.
- **Design:** `eper/docs/audit-trail-and-activity-evidence.md` — coverage, canonical event schema, redaction, tenant isolation, append-only controls and acceptance criteria.
- **Implementation evidence:** `eper/packages/audit/audit-event-store.ts`, `eper/packages/audit/migrations/001_audit_events.sql`, `eper/tests/audit-event-store.test.mjs`.
- **Outstanding release evidence:** migration applied and schema readiness verified in an authorized test database; chain replay/tamper tests; least-privilege DB grants; route/job/integration coverage matrix; search/export authorization and self-auditing; retention and restore verification; current-head CI and security review.

### Non-negotiable acceptance rules
1. No UI preview may be represented as persisted evidence or a live audit search.
2. No requirement is marked closed solely because a schema, wireframe, or design exists.
3. Tenant and actor identity must come from trusted server-side context, not caller-supplied display fields.
4. Audit storage failures for protected high-risk actions must not silently permit the action.
5. Any exception/degraded mode requires an approved policy, alerting, and recoverable evidence; it must not be an implicit fallback.
