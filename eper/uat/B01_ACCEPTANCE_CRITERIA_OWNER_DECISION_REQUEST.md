# B01 Owner Decision Request — Requirement-Specific Acceptance Criteria

**Decision request:** B01-AC-DECISION-001  
**Scope:** Chapters 463–470; 48 requirements  
**Status:** Awaiting authorized business/requirements owner decisions  
**Current gate:** HOLD — do not execute business UAT until approval and entry evidence exist.

## Requested owner action

Please review [B01_48_ACCEPTANCE_CRITERIA_RESOLUTION_MATRIX.csv](./B01_48_ACCEPTANCE_CRITERIA_RESOLUTION_MATRIX.csv) and record a decision for every requirement. The matrix contains eight requirements for each of six capability patterns: authoritative records, authorization, business validation, audit evidence, exception handling, and governed reporting.

For each requirement, the owner must do one of the following:

1. **APPROVE SOURCE** — supply an approved controlled source and exact locator that defines the actors, preconditions, business rules, positive and negative behavior, measurable expected result, and evidence to capture; or
2. **RETURN FOR CLARIFICATION** — identify the accountable author, missing rule/decision, target date, and linked change/decision record.

A capability label or generic SRS acceptance paragraph is not sufficient evidence for approval.

## Minimum decision fields

For each of the 48 rows, complete:
- owner disposition and owner name/role;
- controlled source document ID, version, approval reference, and exact section/page/requirement locator;
- confirmed actor/role/tenant and preconditions/test data;
- positive and negative scenario rules;
- measurable expected result and state-integrity/no-side-effect conditions;
- evidence capture reference;
- decision date and change/approval reference.

Then update the corresponding case in `B01_48_CASE_APPROVAL_CHECKLIST.csv`. Case approval must remain separate from acceptance-criteria authoring; execution authorization must remain NO until D1–D4 and E1–E13 are satisfied.

## Decision summary to return

- Requirements approved against testable sources: ___ / 48
- Requirements returned for clarification: ___ / 48
- Approved source/version and approval reference: ___
- Clarification owners and target dates: ___
- Decision record / change references: ___
- Authorized business owner: ___
- Decision date/time/timezone: ___

## Control statement

This request is not itself approval. No acceptance criteria, reviewer decision, test outcome, UAT sign-off, release authorization, or production readiness may be inferred from completion of the matrix. B01 remains HOLD until the authorized decisions and required evidence are recorded.
