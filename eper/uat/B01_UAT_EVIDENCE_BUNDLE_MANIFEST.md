# B01 UAT Evidence Bundle Manifest and Session Record

**Status:** Prepared; not an execution record. Do not use this manifest to imply that UAT has run.
**Scope:** B01, Chapters 463–470, 48 requirements, six capability waves.
**Baseline:** Preserve all 228 requirements and 38 chapters.

## A. Session-level record (complete before execution)

| Field | Value to record | Validation |
|---|---|---|
| Session ID | TO RECORD | Unique controlled session identifier |
| Authorization record | TO RECORD | Approved business-owner sign-off covering scope, window and target |
| Target host | TO RECORD | Exact approved HTTPS host; no simulated/local endpoint |
| Build ID | TO RECORD | Must match the target preflight response |
| Deployed commit SHA | TO RECORD | Must reconcile to the approved build |
| Preflight evidence reference | TO RECORD | Allowlist, HTTPS health and build identity all pass |
| Synthetic dataset ID/version | TO RECORD | Approved, synthetic, reproducible; no production/customer data |
| Authentication/session reference | TO RECORD | Successful OAuth session; no token/secret values captured |
| Business tester and role | TO RECORD | Named tester with approved least-privilege role |
| Business owner/approver | TO RECORD | Authorized accountable owner |
| Tenant/scope | TO RECORD | Explicitly bounded test tenant and permissions |
| Audit/report access check | TO RECORD | Timestamped target-environment retrieval evidence |
| Storage/durability limitation | TO RECORD | Document target persistence, reset/replay and durability constraints |
| Session start/end UTC | TO RECORD | Timestamped execution window |
| Bundle index/checksum | TO RECORD | Stable bundle index with integrity information |
| Defect/retest register | TO RECORD | Reference or explicit none observed after execution |
| Session disposition | NOT EXECUTED | Change only after evidence review |

## B. Per-requirement execution record (48 rows)

Create one row for each requirement REQ-46301 through REQ-47006 using the existing B01 execution pack and W1–W6 capture forms. Do not prefill outcome, evidence, or acceptance from CI.

Required fields: requirement_id; SRS_id; UAT_case_id; wave_id; session_id; approved_build_id; deployed_commit_sha; environment_ref; tester_id; role; tenant_scope; synthetic_dataset_ref; execution_timestamp_utc; precondition_result; business_action; expected_outcome; observed_actual_outcome; result (PASS/FAIL/BLOCKED); evidence_ref; audit_ref; record/report_ref; defect_ref; retest_ref; reviewer; acceptance_decision; acceptance_timestamp; acceptance_evidence_ref.

## C. Bundle structure

Use a stable evidence bundle with these logical sections; do not include credentials or secrets.

1. 00-session/ — authorization, environment preflight, build/commit reconciliation, tester/role assignment.
2. 01-test-data/ — synthetic dataset approval, version, reset instructions and classification.
3. 02-wave-results/W1 through W6/ — executed case results, screenshots/exported records where appropriate, and case-to-requirement mapping.
4. 03-audit-report/ — target audit-event retrieval, report outputs and query/filter context.
5. 04-defects-retests/ — defect IDs, severity/disposition, retest runs and closure evidence.
6. 05-acceptance/ — reviewed requirement-level outcomes and authorized business-owner acceptance.
7. manifest.csv — artifact path/reference, requirement/case association, build ID, capture time UTC, owner, media/type, integrity hash and review status.

## D. Evidence quality gates

- Evidence originates from the authorized target environment and approved build.
- Every result maps to a requirement and UAT case; no orphan evidence.
- Actual observed outcomes are recorded faithfully and distinguish expected from actual.
- Screenshots/exports include sufficient context and timestamps; sensitive values are masked.
- Failed and blocked cases remain visible; no silent omission.
- Retests reference the original failure and new build/session.
- Business acceptance is separately approved and is not inferred from test PASS.
- Evidence bundle is immutable or versioned after review; integrity hashes are recorded.
- G9/G10 are updated only after applicable approvals and reconciliation.

## E. Current status

This manifest is an execution aid only. Existing Library templates say NOT EXECUTED / READY FOR BATCH EXECUTION; readiness controls remain open. No actual result, evidence reference, acceptance, G9 freeze or G10 certification is created by this document.
