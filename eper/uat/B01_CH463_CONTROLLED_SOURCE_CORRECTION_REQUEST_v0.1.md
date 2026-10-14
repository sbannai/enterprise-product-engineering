# B01 Chapter 463 Controlled Source-Document Correction Request v0.1

- Date: 2026-10-14
- Change control: `B01-CH463-CC-001`
- Related source-precedence decision: `B01-CH463-SOURCE-CORRECTION-DECISION-001` (Option A, approved 2026-10-12)
- Status: **CORRECTION REQUEST — NOT APPROVED; SOURCE NOT REISSUED**
- Baseline guard: preserve `B01-BASELINE-APPROVAL-001`, all 228 requirements, all 38 chapters, and the six existing Chapter 463 requirement IDs.

## Purpose

Resolve the known conflicting Chapter 463 heading in the controlled source set without reopening the already-approved Option A domain selection and without silently changing requirement semantics.

## Controlled discrepancy

- Canonical domain selected by the recorded Option A decision: **Enterprise Procurement & Source-to-Pay**.
- Conflicting legacy heading in the master BRD source: **Enterprise Event & Message Management**.
- Dedicated Chapter 463 procurement BRD file is identified in the source intake as **In Development**, not a formally approved final baseline.
- The correction decision does not itself prove that the master BRD or dedicated Chapter 463 BRD has been reissued, approved, or formally baselined.

## Requested correction

1. The baseline custodian locates the authoritative master BRD and the dedicated Chapter 463 source document currently in controlled circulation.
2. Correct the Chapter 463 title/domain label to **Enterprise Procurement & Source-to-Pay**, consistent with the recorded Option A decision.
3. Review surrounding Chapter 463 content for accidental Event & Message Management domain language. Do not replace it with invented procurement rules or silently rewrite requirement semantics.
4. Preserve REQ-46301–REQ-46306, SRS-FR-2323–SRS-FR-2328, TRC-46301–TRC-46306, and the 228-requirement/38-chapter baseline. If substantive requirement changes are necessary, raise a separately reviewed change request and record before/after wording.
5. Publish a controlled revision with version, effective date, approver, approval reference, change summary, source location and provenance/checksum.
6. Update the source register and traceability package to point to the actual reissued artifact. Do not treat this request itself as the corrected source.

## Required evidence to close this correction

| Evidence | Required value |
|---|---|
| Authoritative source filename and repository/library location | Pending baseline custodian |
| Existing source version and status | Pending verified source record |
| Corrected version and effective date | Pending controlled reissue |
| Approver / approval authority | Pending authorized decision |
| Approval/change reference | Pending |
| Change summary and impact assessment | Pending source review |
| Baseline integrity check (228 requirements / 38 chapters unchanged) | Pending post-reissue comparison |
| Archive location and provenance/checksum | Pending |

## Approval boundary

This request does not approve the dedicated BRD, the six criterion-to-requirement mappings, measurable acceptance oracles, HLD/LLD bindings, DATA/API/EVENT contracts, Business UAT, G9 freeze, or release. Those remain separate gates. Until the corrected source is formally issued and approved, record **SOURCE CORRECTION PENDING / HOLD**.

## Safe next action

The baseline custodian/design authority should attach or identify the exact source artifact and approve the correction/reissue. No additional owner decision is requested to reselect the domain; Option A already establishes it.