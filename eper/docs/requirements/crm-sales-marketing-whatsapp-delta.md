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
| CRM-SM-DELTA-09 | Help and support | Explain setup, approval, WhatsApp and troubleshooting | Help Center distinguishes preview from live integration and states known limitations | Documentation addendum supplied; publish/review pending |

## Non-functional and safety constraints
- No external email, social post, WhatsApp message, CRM write, pipeline mutation, or transaction may occur from draft creation or approval alone.
- Keep external execution disabled until provider adapters, identity/authorization, tenant-scoped durable storage, consent/opt-out enforcement, immutable audit, idempotency, rate limiting and explicit execution authorization are implemented and tested.
- Store provider credentials in server-side managed secrets; never in browser HTML, preview JSON, logs or documentation examples.
- Treat current in-memory drafts as disposable prototype data, not an audit record.
- Do not alter the 228 approved requirement IDs or the 38-chapter baseline. Map these delta IDs to canonical requirement IDs only after the requirements owner confirms the crosswalk.
