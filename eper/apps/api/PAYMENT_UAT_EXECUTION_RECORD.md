# Payment business UAT execution record

**Purpose:** Record evidence for the 12 business UAT cases before payment UAT closure.

**Current status:** NOT EXECUTED. This template is not evidence of a test run or business approval.

## Entry criteria

- [ ] Independent security review is approved and recorded.
- [ ] Approved transaction authority and invoice/fee authority endpoints are configured through the authorized secret mechanism.
- [ ] Approved Razorpay test-mode credentials are configured; any exposed test secret has been rotated.
- [ ] Authorized isolated non-production HTTPS endpoint and build ID are recorded.
- [ ] Receipt-numbering policy is approved and `EPER_PAYMENT_RECEIPT_NUMBER_PREFIX` is configured.
- [ ] Required migrations are applied to the authorized non-production database by the documented runner.
- [ ] Read-only migration-007 legacy-order query returns zero unresolved payable rows, or each row is reconciled through an approved process.
- [ ] Tester has a sanitized evidence location and defect-tracking route.

## Test execution matrix

For every case, record the actual run timestamp, tester, build ID, evidence link or artifact ID, observed result, and linked defect. Do not mark PASS without evidence. Use only test-mode transactions and synthetic or approved test data.

| Case | Scenario | Expected result | Status | Evidence / defect |
|---|---|---|---|---|
| PAY-UAT-01 | Standard invoice/fee payment | Amount and payable source reconcile with trusted authority; payment is persisted once; receipt follows approved numbering policy | NOT RUN | |
| PAY-UAT-02 | E-commerce checkout with multiple items | Receipt itemization and total match the trusted checkout/payment amount in INR minor units | NOT RUN | |
| PAY-UAT-03 | Concession or receipt adjustment | Approved adjustment is explicit and auditable; no silent amount mutation | NOT RUN | |
| PAY-UAT-04 | Gateway amount mismatch | Payment completion and receipt issuance fail closed; discrepancy is auditable | NOT RUN | |
| PAY-UAT-05 | Cross-tenant access attempt | Request is rejected; no cross-tenant payment or receipt data is disclosed | NOT RUN | |
| PAY-UAT-06 | Non-payable invoice/source | Order is not created for an ineligible or non-payable source | NOT RUN | |
| PAY-UAT-07 | Transaction authority unavailable | Order/payment flow fails closed; no untrusted transaction snapshot is fabricated | NOT RUN | |
| PAY-UAT-08 | Invoice/fee authority unavailable | Order/payment flow fails closed; no client-supplied amount is accepted as authority | NOT RUN | |
| PAY-UAT-09 | Invalid webhook signature | Webhook is rejected; financial state and receipt issuance remain unchanged | NOT RUN | |
| PAY-UAT-10 | Duplicate webhook / idempotent retry | Repeated delivery creates no duplicate financial effect or receipt | NOT RUN | |
| PAY-UAT-11 | Conflicting webhook event | Conflict is rejected or safely quarantined with an auditable outcome; no unsafe state regression | NOT RUN | |
| PAY-UAT-12 | Receipt immutability and legacy missing snapshot/PDF | Receipt ID and PDF digest remain stable; missing or invalid trusted snapshot/PDF fails closed | NOT RUN | |

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

- [ ] All 12 cases have evidence-backed results.
- [ ] All failures and blockers are resolved or explicitly accepted by the authorized business owner.
- [ ] Sanitized logs and receipt artifacts are attached.
- [ ] Business owner has recorded explicit UAT acceptance.
- [ ] Release authorization is separately recorded; UAT acceptance alone does not authorize production deployment.

**Rule:** Automated CI and the 228-requirement pilot are technical evidence only. They do not substitute for business UAT or formal sign-off. Do not use live payment credentials, deploy, run migrations, or provision chargeable infrastructure without the required authorization.
