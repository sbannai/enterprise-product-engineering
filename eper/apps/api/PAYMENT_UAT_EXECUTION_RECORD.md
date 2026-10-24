# Payment business UAT execution record

**Purpose:** Record evidence for the 12 business UAT cases before payment UAT closure.

**Canonical case IDs:** This execution record uses the same case IDs and scenario mapping as `eper/PAYMENT_UAT_EVIDENCE_MATRIX.md`. Update that canonical matrix and this record together if the approved scope changes; do not reuse an ID for a different scenario.

**Current status:** NOT EXECUTED. This template is not evidence of a test run or business approval.

## Entry criteria

- [ ] Independent security review is approved and recorded.
- [ ] Approved transaction authority and invoice/fee authority endpoints are configured through the authorized secret mechanism.
- [ ] The previously exposed Razorpay test secret has been rotated; only replacement test-mode credentials from the approved secret mechanism are configured.
- [ ] Authorized isolated non-production HTTPS endpoint and build ID are recorded.
- [ ] Receipt-numbering policy is approved and `EPER_PAYMENT_RECEIPT_NUMBER_PREFIX` is configured.
- [ ] Required migrations are applied to the authorized non-production database by the documented runner.
- [ ] Read-only migration-007 legacy-order query returns zero unresolved payable rows, or each row is reconciled through an approved process.
- [ ] Tester has a sanitized evidence location and defect-tracking route.

## Test execution matrix

For every case, record the actual run timestamp, tester, build ID, evidence link or artifact ID, observed result, and linked defect. Do not mark PASS without evidence. Use only test-mode transactions and synthetic or approved test data.

| Case | Scenario | Expected result | Status | Evidence / defect |
|---|---|---|---|---|
| PAY-UAT-01 | General invoice/fee payment | Gateway order uses the trusted payable amount and tenant; immutable transaction snapshot is persisted once; receipt follows approved numbering policy | NOT RUN | |
| PAY-UAT-02 | E-commerce checkout with multiple items, including any approved concession/adjustment in the test fixture | Receipt retains itemized lines and explicit approved adjustments; item totals and final total reconcile with trusted checkout/payment amount in INR minor units; no silent amount mutation | NOT RUN | |
| PAY-UAT-03 | Valid captured payment through signed webhook | Exactly one captured transaction and receipt; tenant scope and order snapshot are preserved | NOT RUN | |
| PAY-UAT-04 | Valid captured payment through `/verify` | Gateway payment reconciles to the persisted order and creates or reuses one receipt | NOT RUN | |
| PAY-UAT-05 | Gateway amount or currency mismatch | Payment completion and receipt issuance fail closed; discrepancy is auditable | NOT RUN | |
| PAY-UAT-06 | Wrong-tenant access attempt | Request is rejected; no cross-tenant payment or receipt data is disclosed | NOT RUN | |
| PAY-UAT-07 | Non-payable invoice/source or missing source | Order is not created for an ineligible or missing payable source | NOT RUN | |
| PAY-UAT-08 | Trusted invoice/transaction authority unavailable or malformed | Flow fails closed; no client-supplied amount or fabricated transaction snapshot is accepted as authority | NOT RUN | |
| PAY-UAT-09 | Invalid webhook signature | Webhook is rejected; financial state and receipt issuance remain unchanged | NOT RUN | |
| PAY-UAT-10 | Duplicate webhook or conflicting event replay | Duplicate delivery is idempotent; conflicting event is rejected or safely quarantined; no duplicate financial effect, receipt, or unsafe state regression | NOT RUN | |
| PAY-UAT-11 | Receipt immutability and download integrity | Public receipt ID remains distinct from transaction ID; repeated downloads retain the same bytes and SHA-256 digest | NOT RUN | |
| PAY-UAT-12 | Legacy pre-migration order with NULL transaction snapshot / migration-007 gate | Read-only eligible-row query returns zero rows before enabling the flow, or every row is safely reconciled; never synthesize a snapshot from mutable data or cancel a possibly charged order blindly | NOT RUN | |

## Per-run record

Copy this block for each executed case.

- Case ID:
- Tester:
- Execution timestamp (timezone included):
- Environment / HTTPS endpoint:
- Build ID / commit SHA:
- Sanitized test transaction reference (never include secrets or full payment credentials):
- Expected result:
- Actual result:
- Status: NOT RUN / PASS / FAIL / BLOCKED
- Evidence artifact or link:
- Defect / issue:
- Retest reference (if applicable):

## Closure decision

- [ ] All 12 canonical cases have evidence-backed results.
- [ ] All failures and blockers are resolved or explicitly accepted by the authorized business owner.
- [ ] Sanitized logs and receipt artifacts are attached.
- [ ] Independent security review is recorded.
- [ ] Business owner has recorded explicit UAT acceptance.
- [ ] Release authorization is separately recorded; UAT acceptance alone does not authorize production deployment.

**Rule:** Automated CI and the 228-requirement pilot are technical evidence only. They do not substitute for business UAT or formal sign-off. Do not use live payment credentials, deploy, run migrations, or provision chargeable infrastructure without the required authorization.
