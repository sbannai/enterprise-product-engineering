# E13 Case-by-Case Remediation Summary

**Date:** 2026-10-04  
**Scope:** B01, Chapters 463–470; 48 requirements and 48 draft cases  
**Disposition:** OPEN / BLOCKED — no case approvals or UAT execution are inferred.

## Draft-case audit

The current `B01_DRAFT_REQUIREMENT_LEVEL_TEST_CASES.csv` has 48 data rows. The cases are draft templates, the baseline approval is pending, business review is required, and execution is marked NOT_RUN. The checklist's acceptance-source, reviewer, decision-date, approval-reference, and execution-authorization fields remain unapproved.

## What each capability needs before case approval

| Capability | Owner must define or approve |
|---|---|
| Authoritative records | Record types and required fields; lifecycle states and permitted transitions; history/audit fields and retention; exact before/after outcomes |
| Authorization | Approved role/resource/tenant permissions; authorized and unauthorized test identities; expected allow/deny response; proof of no side effects on denial |
| Business validation | Mandatory fields and rule identifiers; valid/invalid boundary fixtures; exact validation response; state-integrity and atomicity expectations |
| Audit evidence | Material event list and required fields; actor, target, timestamp, outcome and correlation format; retention/access rules; expected audit records |
| Exception handling | Exception classes and trigger conditions; retry/backoff/escalation rules; idempotency and duplicate prevention; terminal state and recovery outcome |
| Governed reporting | Report version, metrics and filters; approved source fixture; expected rows/counts/totals; freshness/cut-off; access boundaries |

These are clarification prompts, not invented requirements. Do not infer permissions, thresholds, retry counts, report totals, or acceptance decisions.

## Required close-out sequence

1. Requirements/business owner supplies an approved acceptance source and exact locator for each requirement.
2. Complete the requirement-specific acceptance criteria and test data for all 48 rows.
3. Reviewer approves, returns, or rejects each draft case and records identity, date, and reference.
4. Verify all 48 cases meet E13 before considering execution authorization.
5. Keep case execution at NOT_RUN and authorization at NO until D1–D4 and applicable E1–E13 evidence are complete.

**E13 remains BLOCKED.** Drafted cases are not approved cases, and automated pilot passes are not business UAT.
