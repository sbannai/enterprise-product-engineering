# EPER Payment UAT Evidence Matrix

**Status:** Prepared for controlled non-production execution; all live cases are **NOT RUN** until an authorized HTTPS endpoint, approved test credentials, trusted authority configuration, receipt policy, and database are available.

**Candidate baseline:** record the exact deployed commit SHA at execution time. Do not treat CI simulations as live UAT or business acceptance. Never record credentials, signatures, tokens, customer PII, or full payment payloads in this file or issue comments.

## Execution record

- Environment / HTTPS hostname: NOT APPROVED
- Database migration version: NOT RUN
- Build SHA: NOT DEPLOYED
- Tester / date: NOT ASSIGNED
- Business approver / sign-off: NOT EXECUTED
- Legacy-order query evidence: NOT RUN
- Evidence location (restricted, sanitized): NOT PROVIDED

## 12-case execution matrix

| Case | Scenario | Expected result | Evidence to capture (sanitized) | Primary execution owner | Support role | Status |
|---|---|---|---|---|---|---|
| PAY-UAT-01 | General invoice: valid payable invoice, correct tenant and amount | Gateway order created from trusted invoice amount; immutable transaction snapshot persisted | Build SHA, test invoice reference alias, amount/currency, transaction public ID, provider order ID suffix, snapshot persistence assertion | Tester | Developer prepares/verifies trusted source and supports diagnosis | NOT RUN |
| PAY-UAT-02 | E-commerce checkout with multiple cart items | Order and receipt retain itemized line descriptions, quantities, unit amounts, adjustments, and correct total | Synthetic cart ID; compare order-time snapshot with receipt field-by-field for item descriptions, quantities, unit amounts, line totals, approved adjustments, and final INR-minor-unit total; reconcile against trusted checkout total; transaction ID and receipt ID | Tester | Developer supports fixture setup and defect diagnosis | NOT RUN |
| PAY-UAT-03 | Valid captured payment through signed webhook | Exactly one captured transaction and receipt; tenant scope and order snapshot preserved | Event ID hash, transaction ID, receipt ID/number, PDF digest | Tester | Support confirms webhook delivery/logs | NOT RUN |
| PAY-UAT-04 | Valid captured payment through /verify | Verified gateway payment reconciles to the persisted order and creates/reuses one receipt | Order/payment ID aliases, response code, receipt ID, PDF digest | Tester | Support assists gateway diagnostics | NOT RUN |
| PAY-UAT-05 | Gateway amount or currency mismatch | Reject; no capture persistence or receipt issuance | Expected/actual amount and currency only, response code, defect ID if any | Tester | Developer verifies fail-closed behavior | NOT RUN |
| PAY-UAT-06 | Wrong tenant attempts order, verification, or receipt access | Deny cross-tenant access without disclosing another tenant's data | Synthetic tenant aliases and separate response/effect evidence for order creation (no cross-tenant order created), payment verification (no cross-tenant disclosure or mutation), and receipt access (no cross-tenant receipt disclosure) | Tester | Developer verifies tenant enforcement | NOT RUN |
| PAY-UAT-07 | Invoice is not payable or source is missing | Reject according to authority result; do not create a chargeable order | Synthetic invoice alias, authority result category, response code | Tester | Developer supports authority fixture and fail-closed diagnosis | NOT RUN |
| PAY-UAT-08 | Trusted invoice or transaction authority unavailable / malformed response | Fail closed; no untrusted client amount or mutable fallback is used | Authority category (no URL/token), response code, no-secret log excerpt | Tester | Developer supports controlled fault setup and diagnosis | NOT RUN |
| PAY-UAT-09 | Invalid webhook signature | Reject with authentication failure; no state change | Event alias, signature-valid boolean, response code | Tester | Support checks sanitized webhook logs | NOT RUN |
| PAY-UAT-10 | Duplicate webhook and conflicting event replay | Duplicate is idempotent; same event ID with different payload is rejected as conflict | Event ID hash, payload digest, receipt ID consistency, response codes | Tester | Support checks replay/event logs | NOT RUN |
| PAY-UAT-11 | Receipt immutability and download integrity | Repeated download returns same bytes/digest; public receipt ID differs from transaction public ID | Transaction ID, receipt ID, SHA-256 digest for each download, equality result | Tester | Support archives sanitized digests | NOT RUN |
| PAY-UAT-12 | Legacy pre-migration order with NULL transaction snapshot / migration-007 gate | Before enabling payment flow, read-only eligible-row query returns zero rows, or each row is reconciled safely; never synthesize/backfill from mutable data or cancel a possibly charged order blindly | Sanitized row count and reviewer, reconciliation references for any rows, approved disposition; never include customer details | Tester | Developer and authorized DB operator execute/verify the approved read-only procedure; Support coordinates evidence | NOT RUN |


## Automated coverage crosswalk (CI evidence only)

The following repository tests provide pre-UAT technical coverage. **They do not change the live execution status above** and do not replace execution against the authorized non-production deployment.

| Case | Existing automated coverage | Coverage interpretation |
|---|---|---|
| PAY-UAT-01 General invoice | `payment-gateway.test.mjs`; `invoice-amount-authority.test.mjs`; `postgres-payment-api-route.test.mjs` | Partial — synthetic authority and gateway integration; live authority configuration remains unverified |
| PAY-UAT-02 Multi-item checkout | `transaction-receipt-contract.test.mjs`; `payment-gateway.test.mjs` (“receipt PDF paginates long checkout snapshots…”) | Partial — line-item/adjustment validation and PDF rendering; real checkout integration remains unverified |
| PAY-UAT-03 Captured webhook | `payment-gateway.test.mjs`; `postgres-payment-store.integration.test.mjs` | Covered in automated tests; live Razorpay webhook delivery/signature configuration remains unverified |
| PAY-UAT-04 `/verify` | `payment-gateway.test.mjs` | Covered in synthetic gateway tests; live gateway credentials and deployment remain unverified |
| PAY-UAT-05 Amount/currency mismatch | `payment-gateway.test.mjs`; `transaction-receipt-contract.test.mjs` | Covered in automated negative tests; live response/evidence remains outstanding |
| PAY-UAT-06 Wrong tenant | `payment-gateway.test.mjs`; `invoice-amount-authority.test.mjs`; `transaction-receipt-contract.test.mjs` | Covered in automated tenant-scope tests; live tenant configuration remains unverified |
| PAY-UAT-07 Non-payable/missing source | `invoice-amount-authority.test.mjs`; `transaction-receipt-contract.test.mjs` | Covered in automated fail-closed tests; live authority behavior remains unverified |
| PAY-UAT-08 Authority outage/malformed response | `http-transaction-snapshot-source.test.mjs`; `invoice-amount-authority.test.mjs` | Covered in adapter/unit tests; live endpoint availability and credentials remain unverified |
| PAY-UAT-09 Invalid webhook signature | `payment-gateway.test.mjs` | Covered in synthetic signature test; deployed webhook secret remains unverified |
| PAY-UAT-10 Duplicate/conflicting replay | `payment-gateway.test.mjs`; `postgres-payment-store.test.mjs` | Covered in idempotency and event-conflict tests; live provider replay remains unverified |
| PAY-UAT-11 Receipt immutability/digest | `payment-gateway.test.mjs`; `postgres-payment-store.integration.test.mjs` | Covered in persisted-byte/digest tests; live download evidence remains outstanding |
| PAY-UAT-12 Legacy NULL-snapshot gate | `postgres-payment-store.integration.test.mjs` covers migrations and snapshot immutability | **Not covered end-to-end** — still requires the read-only query on the authorized target database and sanitized evidence |



## Role split and execution controls

The role labels below are functional assignments for the three-resource team; they do not imply that a named person has executed a case or that access has been granted.

- **Developer:** prepare/fix the non-production build and approved configuration, support the Tester with controlled fixtures and technical diagnosis, verify fail-closed behavior, and coordinate migrations only after the target database is explicitly authorized. Developer support does not substitute for Tester execution.
- **Tester:** is the primary execution owner for all 12 cases; personally execute each scenario against the approved deployed build, record expected versus actual outcomes, attach sanitized evidence, and raise defects. The tester must leave a case NOT RUN until actual execution. The Primary execution owner column must remain Tester for every row.
- **Support engineer:** coordinate provider/webhook diagnostics, sanitized logs, evidence retention, access prerequisites, and the read-only legacy-order query with the authorized database operator. Never collect or paste secret values into tickets.
- **Independent security reviewer:** review tenant isolation, authority boundaries, secret handling, webhook replay/signature controls, and receipt immutability before the merge/release decision. This is a separate review gate, not a substitute for any of the three execution roles.

### Parallel readiness checklist

- [ ] Developer: exact candidate commit and dependency PR sequence recorded; no production route enabled.
- [ ] Developer + support: owner-approved transaction and invoice authority URLs/tokens configured through the approved secret store.
- [ ] Support: previously exposed Razorpay test secret rotated; new value stored only in the approved secret store.
- [ ] Business owner: receipt-numbering policy and prefix approved.
- [ ] Developer + authorized DB operator: migrations 006–007 applied only to the approved non-production database; migration-007 query evidence captured.
- [ ] Tester: approved test identity, synthetic tenant/data, and restricted evidence location confirmed.
- [ ] Independent reviewer: security review recorded against the exact commit before merge.
- [ ] Business owner: execution authorization and final acceptance decision recorded.

All checkboxes remain unchecked until independently verified. This checklist does not change any case status or authorize infrastructure spending.

## Release gate

Do not enable payment flow in the target environment until all of the following are true:

1. Trusted transaction authority and separate invoice/fee authority are approved and configured via the approved secret mechanism.
2. Previously exposed Razorpay test credentials are rotated; replacement credentials are stored only in the approved secret store.
3. Receipt-numbering policy and prefix are approved.
4. An isolated non-production target and database are authorized. Do not provision chargeable AWS resources without separate explicit approval.
5. Migrations are applied only to that authorized non-production database.
6. The migration-007 legacy-order query has sanitized evidence: zero eligible rows, or safe reconciliation of every returned row against authoritative invoice/cart and Razorpay state.
7. All 12 cases are executed with evidence and defects recorded.
8. Business owner records explicit UAT acceptance; technical CI alone is not acceptance.

Production routes remain fail-closed until a separate authorized readiness review. Preserve the 228 requirements and 38 chapters unchanged.
