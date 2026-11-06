# B01 Draft Requirement-Level UAT Case Templates

**Scope:** Chapters 463–470; 48 requirements  
**Status:** DRAFT — NOT APPROVED FOR EXECUTION  
**Related gap register:** `eper/uat/B01_REQUIREMENT_CASE_GAP_REGISTER.csv`  
**Authoritative execution register:** `eper/uat/EPER_228_BUSINESS_UAT_EXECUTION_CAPTURE.csv`

## Purpose
This draft converts the six recurring requirement capability patterns into reviewable candidate test-case templates, with one row mapped to each B01 requirement. It is intended to reduce test-authoring effort, not to claim approved acceptance criteria or business acceptance.

## Source boundary
The consolidated SRS and related source recovery material identify the requirement IDs, parent BRD IDs, priorities, and recurring capability summaries. The SRS baseline is explicitly approval-pending and its generic system-requirement wording defers actors, conditions, business rules, constraints, and expected outcomes to the parent BRD. Therefore these templates cannot be treated as final, chapter-specific acceptance criteria.

## Mandatory review before execution
For each of the 48 rows, the requirements/business owner must:
1. Verify the detailed BRD source and approved baseline/version.
2. Confirm the actual actor, permissions, tenant scope, business rules, test data, and chapter-specific conditions.
3. Confirm or replace the draft steps and expected/negative-path outcomes.
4. Record approval reference, reviewer, and date in the controlled review process.
5. Only then mark the case approved for execution and complete the operational UAT entry gates.

## Status controls
- `case_status=DRAFT_TEMPLATE_NOT_APPROVED` means candidate wording only.
- `baseline_approval_status=REQUIREMENTS_BASELINE_APPROVAL_PENDING` preserves the source approval boundary.
- `business_review_status=REVIEW_REQUIRED` means no business approval is claimed.
- `execution_status=NOT_RUN` means no execution is claimed.
- Do not copy these draft outcomes into the authoritative execution capture register as results.
- Do not infer PASS, ACCEPTED, G9 freeze, release authorization, or G10 certification from this file.

## Pattern coverage
- XX01: authoritative records and lifecycle history.
- XX02: role-based authorization.
- XX03: mandatory business-condition validation.
- XX04: audit evidence for material events.
- XX05: controlled exception handling.
- XX06: governed reporting.

The templates include negative-path suggestions only where appropriate; perform them only when the approved criteria and authorized test environment permit them.
