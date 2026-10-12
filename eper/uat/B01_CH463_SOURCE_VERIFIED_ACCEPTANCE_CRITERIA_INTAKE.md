# B01 Chapter 463 Source-Verified Acceptance Criteria Intake

- Change control: `B01-CH463-CC-001`
- Source: `EM-BRD-001_Volume-XIII_Chapter-463_Enterprise-Procurement-and-Source-to-Pay-Strategic-Sourcing-RFQ-RFP-RFI-Supplier-Selection-Purchase-Requisitions-Purchase-Orders-Contracts-Catalogs-Approvals-and-Procurement-Compliance-Traceability-Matrix_v1.0.docx`
- Source status: **In Development** (not a formally approved final baseline)
- Status: **SOURCE-EXTRACTED; REQUIREMENT MAPPING AND EXECUTABLE ORACLES NOT APPROVED**
- Baseline guard: preserve `B01-BASELINE-APPROVAL-001`; preserve 228 requirements and 38 chapters.

## Source-stated Chapter 463 acceptance criteria (§463.46)

The source states that:
1. Sourcing events support controlled supplier participation and auditable evaluation.
2. Requisitions and purchase orders enforce approval, budget and procurement-policy controls.
3. Supplier selection and awards retain criteria, evidence and rationale.
4. Contracts and catalog purchasing are linked to approved commercial terms.
5. Procurement transactions flow reliably into receiving, Accounts Payable and financial reporting.
6. AI remains advisory and cannot independently award suppliers or commit enterprise funds.

These are source-level criteria, not yet approved row-level mappings to REQ-46301 through REQ-46306.

## Source-stated standard validation checklist (§463.47)

| # | Check | Evidence/test named in source | Owner named in source |
|---:|---|---|---|
| 1 | Category strategy | Category/policy/owner test | Procurement |
| 2 | Supplier | Evidence/expiry/qualification status test | Supplier Management |
| 3 | Sourcing event | RFI/RFQ/RFP lifecycle test | Sourcing |
| 4 | Bid security | Deadline/confidentiality/version test | Sourcing |
| 5 | Evaluation | Weighted criteria/conflict test | Sourcing |
| 6 | Award | Recommendation/approval/rationale test | Procurement |
| 7 | Contract | Terms/version/expiry test | Legal/Procurement |
| 8 | Requisition | Budget/category/approval test | Buyer |
| 9 | PO | Supplier/line/approval/change test | Buyer |
| 10 | Compliance | Threshold/exception/maverick test | Procurement |
| 11 | AP handoff | PO/receipt/invoice lineage test | AP |
| 12 | Security | Confidentiality/SoD/audit test | Security |
| 13 | AI boundary | Evidence/human-review test | AI Governance |
| 14 | Continuity | Recovery/no-duplicate-award/order test | BCM/IT |

## What this source does and does not establish

- It supplies six chapter-level acceptance criteria and fourteen named validation checks.
- It does **not**, by itself, establish which exact criterion or checklist item maps to each retained generic requirement/SRS/TRC row.
- It does not supply all executable oracle values: e.g. approval thresholds, role/SoD matrix, mandatory field set, budget tolerance, retention duration, KPI formulas, precise state-transition table, and API/event payload/version contracts.
- Therefore no candidate crosswalk or generic capability/component reference is promoted to an approved binding by this intake record.

## Next controlled action

For each of the six retained requirement rows, an authorized reviewer must record the exact source rule/check, confirm whether the existing requirement semantics remain valid for Procurement & Source-to-Pay, approve the mapping or raise a controlled requirement change, and supply measurable positive/negative/boundary outcomes and configuration values. Then validate exact HLD/LLD locators and DATA/API/EVENT contracts (or separately approved N/A).

## Guardrails

- Do not overwrite or reissue BRD/HLD source baselines in this step.
- Keep `EPER_UAT_API_ENABLED=false`.
- Do not provision chargeable AWS resources.
- CI success is not business acceptance; Business UAT remains HOLD until separately authorized.
