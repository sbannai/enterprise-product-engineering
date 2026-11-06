# EPER Product User Manual — v2
**Baseline:** 2026-10-31 | **Audience:** Platform Admin, Customer Admin, operators, reviewers, finance, support and QA. POC guidance, not production certification.

## 1. Safe start
Sign in to the approved environment. Confirm tenant and selected application before every change. Use only assigned roles. Never paste credentials, payment details or secrets into tickets, screenshots or logs. If identity, scope, persistence or readiness is unavailable, stop and escalate.

## 2. Platform Admin
Manage product catalogue, approved market price books, plans/tariffs, customer registry, application assignment, entitlements and access state. Record reason and approval for high-impact changes. Disabling one application must not disable sibling applications. Use Feedback & Ticketing to enter the separate authenticated support workspace; platform-wide visibility requires explicit support permission.

## 3. Customer Admin
Open My Applications and select an assigned application. Manage only its users/actor assignments, workflows, integrations, assets, conferencing, notifications and enabled add-ons. Revocation must block API and background jobs; never use UI hiding as a security workaround.

## 4. Workflow and scheduler
Create or edit a schedule in the authorized application workspace. Review validation and approval requirements. A durable worker triggers due work; browser polling is not the execution mechanism. Keep the job/correlation ID. Use execution history and diagnostics to inspect queued/running/retry/failed/dead-letter states. Do not repeatedly click retry or submit duplicate requests. Pause/cancel and consent revocation must prevent pending dispatch.

## 5. AI-assisted CRM/Sales/Marketing
Create drafts only. Review accuracy, brand and consent. Where maker-checker applies, a different authorized reviewer approves/rejects. Approval does not mean a message was sent, a post published or CRM updated. Confirm separate execution result and audit record. External actions remain disabled unless specifically authorized.

## 6. Payments and receipts
Resolve an explicit market quote and verify amount, currency and price version. Use test mode unless production activation is separately approved. A payment is successful only after server-side gateway verification. Download the receipt only after captured status; check receipt number and transaction match. Unknown outcomes require reconciliation, not blind retry.

## 7. Tickets and assets
Customers submit/follow tickets for their own assigned application. Platform support can see wider queues only with privileged permission. Classify defect/feedback/feature request/question correctly; restrict security/privacy reports. Do not attach secrets. Asset sharing/download must remain within tenant and actor assignment; use only configured trusted storage providers.

## 8. Troubleshooting
401: authenticate through approved identity process. 403: request proper role/assignment; do not bypass. 409: reload and resolve version conflict. 503/readiness failure: stop protected writes and escalate. For scheduler/payment issues capture timestamp, build, correlation ID, safe diagnostics and exact steps.

## 9. Known limitations and evidence rule
Some admin/customer screens and integrations may still be previews or feature-flagged. Verify live API, durable PostgreSQL state and authorization before relying on a control. A screen, design, merged PR or CI workflow is not proof of end-to-end completion. Business UAT remains unauthorized until all approved entry gates and explicit authorization are satisfied.
