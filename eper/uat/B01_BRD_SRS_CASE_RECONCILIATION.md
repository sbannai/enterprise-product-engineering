# B01 BRD/SRS-to-UAT Case Reconciliation

**Scope:** Chapters 463–470; 48 requirements  
**Status:** Source reconciliation finding — BLOCKED pending requirement-specific approved detail  
**Inputs:** `EM-BRD-001_Detailed_Chapters-461-470_v1.0.docx`; `EM-SRS-001_FINAL_Consolidated_Software_Requirements_Baseline_v1.0.docx`; draft cases in `eper/uat/B01_DRAFT_REQUIREMENT_LEVEL_TEST_CASES.csv`.

## Finding
The detailed BRD has the right chapter headings and a 20-section structure, but the sections inspected for Chapters 463–470 use generic “define governed, measurable and auditable requirements” boilerplate. The consolidated SRS maps all 48 requirement IDs to six recurring capability summaries and generic acceptance bullets, while explicitly retaining the Batch 010 source status as requirements-baseline approval pending. The source set therefore establishes identity and capability family, but not sufficient approved business detail to sign off the candidate UAT steps as requirement-specific tests.

## Decision
All 48 cases are **BLOCKED_SOURCE_DETAIL** for approval. This is not a test failure and does not mean the product failed. It means the acceptance basis is not sufficiently specific/approved to run an objective business acceptance test without inventing expected behavior.

## Required remediation per requirement
The authorized business/requirements owner must approve:
1. Actor and role, including tenant/security scope where applicable.
2. Preconditions and valid/invalid test data.
3. Exact business rule, workflow/state transition, validation and exception behavior.
4. Measurable expected result and permitted error/rejection behavior.
5. Audit/report evidence fields, retention/access and reconciliation criteria as applicable.
6. Source baseline version and exact BRD/SRS locator, reviewer and approval date.

The CSV maps each requirement to its SRS and BRD parent ID, records the source locator and content limitation, and specifies the gap and required decision. Keep the authoritative execution capture register at `NOT_RUN`; do not promote these drafts to approved cases until the baseline and case reviews are approved.
