# Chapter 463 contract specification skeleton — DRAFT / NOT APPROVED

**Scope:** REQ-46301–REQ-46306; SRS-FR-2323–SRS-FR-2328  
**Status:** Engineering draft only. This file does not approve procurement semantics, HLD/LLD bindings, business rules, or UAT.  
**Baseline guardrail:** Preserve the 228 requirements and 38 chapters unchanged. No AWS resources or deployment are part of this work.

## Contract status vocabulary

- `DRAFT_TECHNICAL`: engineering shape for review; not a source of business truth.
- `APPROVED`: permitted only when an authoritative source locator, version/hash, approval authority/reference, and effective date are recorded.
- `APPROVED_NA`: permitted only with a separate, explicit N/A decision, rationale, approver, and date.
- Missing evidence remains `OPEN`; absence is never interpreted as N/A.

## Requirement-to-contract registry

| Requirement | SRS | Capability | DATA ID | API ID | EVENT ID | Status |
|---|---|---|---|---|---|---|
| REQ-46301 | SRS-FR-2323 | authoritative-records | DATA:authoritative-domain | API:capability-resource | EVENT:material-lifecycle | DRAFT_TECHNICAL |
| REQ-46302 | SRS-FR-2324 | authorization | DATA:identity-policy | API:secured-capability | EVENT:authorization-audit | DRAFT_TECHNICAL |
| REQ-46303 | SRS-FR-2325 | business-validation | DATA:domain-rules | API:validated-command | EVENT:validation-outcome | DRAFT_TECHNICAL |
| REQ-46304 | SRS-FR-2326 | audit-evidence | DATA:audit-record | API:audit-retrieval | EVENT:audit-material-event | DRAFT_TECHNICAL |
| REQ-46305 | SRS-FR-2327 | exception-handling | DATA:workflow-exception | API:recovery-command | EVENT:exception-lifecycle | DRAFT_TECHNICAL |
| REQ-46306 | SRS-FR-2328 | governed-reporting | DATA:derived-reporting | API:report-query | EVENT:report-refresh | DRAFT_TECHNICAL |

These IDs match the current code registry. They are identifiers, not schemas or approved design locators.

## Minimum specification fields still required

Each DATA contract must define: schema ID/version; fields/types/requiredness; key and relationship rules; tenant scope; owner; persistence and migration; compatibility/deprecation policy.

Each API contract must define: operation ID/version; method/path; authentication/authorization policy; request/response schemas; success and error status semantics; idempotency; side effects; examples; compatibility policy.

Each EVENT contract must define: envelope and payload schema/version; producer and consumer; trigger; correlation/idempotency keys; delivery, ordering, retry and duplicate semantics; compatibility policy.

Every concrete field or behavior that is not supported by an authoritative source must remain explicitly marked `TBD_SOURCE_REQUIRED`; do not fill it with an assumed procurement rule.

## Row-specific source decisions

| Requirement | Required source-backed decision before approval |
|---|---|
| REQ-46301 | Identify the authoritative procurement aggregate(s) and lifecycle; do not assume generic records mean requisitions or purchase orders. |
| REQ-46302 | Approve role × action × resource × tenant policy and denied-side-effect behavior. |
| REQ-46303 | Approve validation rule catalogue, boundary values, and observable error outcomes. |
| REQ-46304 | Approve material-event coverage, mandatory evidence fields, integrity, access, retention, and retrieval behavior. |
| REQ-46305 | Approve exception classes, retry/backoff, idempotency, compensation, escalation, and terminal states. |
| REQ-46306 | Approve report catalogue, metric formulas, lineage, filters, access, freshness, and reconciliation expectations. |

## Approval record (intentionally empty)

For each contract, record: authoritative source artifact/version/hash and exact locator; requirement/SRS/TRC binding; exact approved HLD locator; exact approved LLD locator and HLD→LLD pairing; schema/API/event specification version; approver and authority; approval/change reference; effective date; validation/test evidence.

Until these fields are completed and reviewed, design/contract gates remain OPEN, SRC-003/G3 remains OPEN / NO-GO, and Business UAT remains NOT AUTHORIZED.
