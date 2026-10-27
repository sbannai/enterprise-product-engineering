# EPER Product User Manual

**Version:** Product POC Manual v0.1 · **Updated:** 2026-10-27  
**Audience:** Product Admins, Customer Admins, support/QA users and application operators  
**Status:** User guide for the current POC and intended workflows; not a statement that every screen or integration is production-ready.

## 1. Purpose and product map

EPER is designed as a multi-tenant, modular platform for managing applications, workflows, commercial plans, integrations, payments, support tickets and governed AI-assisted work. Use the relevant portal for the task and do not cross tenant or application boundaries.

### Platform Admin / Product Admin
Use the Platform Admin area for product catalogue and commercial control:
- Product catalogue and lifecycle.
- Localized market price books and price approvals.
- Plans, tariffs, billing models and accepted price versions.
- Customer records and application registration/assignment.
- Module/add-on entitlements and client/application access state.
- Product feedback and ticketing triage, prioritization, assignment and closure oversight.
- Audit review for authorized commercial and access changes.

### Customer Admin
Use the customer login for applications assigned to your tenant:
- Open **My Applications** and select the target application.
- Manage permitted application settings, users/roles, workflows and enabled add-ons.
- Configure application-scoped integrations such as messaging/WhatsApp, storage/document sharing, video conferencing, alerts/notifications and payment provider settings when available.
- Access Help Center and Growth Hub from customer login, not from the platform Admin portal.
- Submit feedback or support tickets for the selected application.

### Operators and reviewers
Work only within assigned roles. Review generated AI drafts and approve/reject them as authorized. Approval of a draft does not imply the external action ran successfully.

## 2. Sign-in and safe navigation
1. Open the approved EPER environment URL supplied by your administrator.
2. Sign in using the approved identity provider or authorized test credentials.
3. Confirm the tenant/customer and application context before changing settings or creating a ticket.
4. Do not paste credentials into screenshots, ticket descriptions, source control or audit comments.
5. If access is denied, the service is unavailable, or the displayed context looks wrong, stop and report the issue instead of trying another tenant or bypassing the control.

The repository includes POC routes such as `/admin/pricing-ui` and `/wireframes`. Availability depends on deployment configuration. A static preview is not the same as an enabled, authenticated, persistent production feature.

## 3. Product Admin: products and localized pricing
1. Open the Product Admin pricing console.
2. Select **Price Book** to view or enter a product/market price entry where the API is enabled.
3. Provide the product ID, market ID, ISO currency, amount, price-book ID/version, status and effective dates.
4. Keep entries in Draft until the required commercial approval has been recorded under the approved process.
5. Select **Market Resolver** to resolve an approved price for the explicit product and market.
6. Verify the returned amount, currency, price-book version and effective window before using the quote in downstream payment flows.
7. Record a reason and audit reference for commercial changes according to policy.

**Important distinctions**
- Locale changes language, date/number formatting and presentation only.
- Market selects an explicit approved price; it does not silently convert a base amount using FX.
- Accepted customer/application price snapshots must not change merely because the product catalogue changes.
- Never infer tax, rounding or compliance treatment from browser locale.
- Existing UI configuration may be held in process memory unless a durable adapter is configured. Do not use process-memory pricing as the production source of truth.

## 4. Product Admin: plans, tariffs, customers and access
The intended admin flow is **Customers → Applications → Plans & Tariffs → Entitlements → Client Access → Audit**.

For customer/application setup, confirm canonical customer identity, application ownership, approved plan/tariff version, entitlement scope and effective dates. For an access change, define the exact tenant/application scope, requested state and reason. High-impact changes may require independent approval.

Access state and integration state are different:
- Disabling an application must not accidentally disable sibling applications.
- A disabled/suspended customer or application must be enforced by APIs and background jobs, not just hidden navigation.
- Do not delete a customer/application record to disable access; preserve audit history.
- The Customers & Applications, Plans & Tariffs and Client Access screens are currently preview placeholders. Do not treat their visible controls as live changes.

## 5. Product Admin: Feedback & Ticketing

### Open the queue
1. From the Product Admin pricing console, select **Feedback & Ticketing**.
2. Choose **Open Feedback & Ticketing**. The browser opens the admin wireframe workspace directly at the Feedback & tickets section.
3. Enter an authorized admin/support bearer token in that workspace and select Connect. The pricing console token is not forwarded.
4. Confirm the tenant context and live-queue connection status before handling tickets. If the API is unavailable, treat any displayed sample content as non-authoritative.

### Triage a ticket
1. Review type, title, description, business impact, affected application and evidence reference.
2. Search for an existing canonical ticket before creating a new issue; link duplicates rather than inflating issue counts.
3. Distinguish defect, feedback, feature request and question. A feature request or feedback item is not automatically a P1 defect.
4. Confirm severity using documented impact and evidence. P1 candidates include severe workflow outage, payment/receipt integrity failure, cross-tenant exposure, material data loss or urgent security/privacy risk.
5. Assign an accountable owner and record the rationale, status and next action.
6. For security/privacy concerns, restrict visibility and escalate immediately; do not wait for a reporting threshold.
7. Verify a fix with the linked test/run/build evidence before closing. Reopen if verification fails.

### Ticket hygiene and access
- Ticket data must remain tenant-scoped; never reveal another tenant's ticket existence or content.
- Do not include passwords, tokens, payment-card details or unnecessary personal information.
- Use approved evidence references; attachments require access controls, scanning, retention and audit.
- Ticket creation, assignment, severity/status changes, comments, duplicate linking and closure should have audit events.
- Follow the P1 discovery/triage register and the approved owner decision before starting new feature scope.

The ticketing package and API/test coverage exist in the repository, but production availability depends on environment flags, identity mapping, durable PostgreSQL configuration and permissions. A passing UI preview or API test does not prove that a deployed queue is connected.

## 6. Customer Admin: application settings
1. Sign in to the customer portal.
2. Select **My Applications**.
3. Open one application and then **Settings**.
4. Choose the required integration or configuration area.
5. Change only settings within the assigned role and active entitlement.
6. Save with the expected version when supported; resolve version conflicts by reloading current settings.
7. Run Test Connection where available and check sanitized readiness/status output.
8. Confirm that the change is scoped to the selected application.

Video conferencing and alerts/notifications are application-specific settings. Do not configure them as global platform-wide values unless the product explicitly provides an authorized shared connection reference.

## 7. CRM, Sales, Marketing and AI agents
1. Open the authorized agent workspace for the selected tenant/application.
2. Choose a supported draft intent and provide business context without secrets or unnecessary personal data.
3. Review the generated draft for accuracy, policy and brand alignment.
4. A reviewer distinct from the creator approves or rejects where maker-checker applies.
5. Approval changes draft state; it does not itself publish content, send a message or write to CRM.
6. Any execution path must re-check authorization, entitlement, approval, idempotency and integration readiness.
7. Confirm execution outcome and audit evidence before reporting success.

External publishing, outbound messages and CRM writes require explicit human approval and authorization.

## 8. Payments, invoices and receipts
1. Resolve a server-authoritative quote for the explicit product and market.
2. Verify amount, currency, accepted price version and customer/application scope.
3. Use sandbox payment flow only in the configured controlled environment unless a production gateway has been separately approved.
4. For uncertain outcomes, reconcile payment/provider state before retrying; do not blindly repeat a payment.
5. After successful payment, verify that invoice and downloadable receipt match the accepted quote and payment record.

The UI showing a provider option does not prove the provider adapter or production charging is active. Never enable production charging without formal approval and completed verification.

## 9. Asynchronous operations and status
Long-running work should return a job/correlation ID and status instead of blocking the user. Keep the ID when escalating a failure. A retry should be safe and idempotent; do not create duplicate payments, receipts, campaign sends or CRM actions by repeatedly clicking a control.

## 10. Audit, troubleshooting and escalation
- Capture timestamp, environment/build, correlation/request ID, affected requirement or feature, expected/actual result and reproducible steps.
- Never attach secrets, raw authorization headers or payment credentials.
- A 401/403 should be resolved through approved identity/role assignment; do not work around it.
- A 409/version conflict usually requires refreshing the current record and reapplying the intended change.
- A 503 or readiness failure means the dependency/policy is unavailable; sensitive actions should fail closed.
- If live queue, pricing persistence or integration readiness cannot be confirmed, mark the activity blocked and escalate.

## 11. Current POC limitations
- Product Admin Customer/Application, Plans/Tariffs and Client Access screens are previews, not live controls.
- The Product Admin Feedback & Ticketing entry opens a separate authenticated support workspace; it does not pass credentials automatically.
- The Product Admin wireframe, marketing deck and sales flyers are static POC artifacts.
- Localized price configuration may be process-memory based unless a durable adapter is configured.
- Production payment provider activation, tax policy, operational database failover, backup restoration and Business UAT acceptance must be evidenced separately.
- Do not claim production readiness or Business UAT acceptance from documentation, screenshots or CI status alone.

## 12. Related documents
- [Product BRD](product-brd.md)
- [Product HLD](product-hld.md)
- [Product LLD](product-lld.md)
- [Product SRS](product-srs.md)
- [Product POC update log](product-poc-update-log.md)
- [Pricing & payment admin console](pricing-payment-admin-console.md)
- [Customer/application settings architecture](customer-application-settings-architecture.md)
- [Ticketing and feedback P1 register](product-ticketing-feedback-p1-register.md)
- [Product Admin localized-pricing wireframe](../wireframes/product-admin-localization-wireframe.html)


## 11. Product Admin and client ticketing/feedback scope

### Product Admin: client-wide support oversight
1. Open the Product Admin console and select **Feedback & Ticketing**. Use the separate authenticated support workspace and confirm that the live queue is connected.
2. Filter the central queue by customer/tenant, application, record type, severity, status, owner and date, limited to the support scopes granted to your platform role.
3. Review client-reported defects, feedback, feature requests and questions. These categories must remain distinct; a request is not a defect merely because it is urgent to a client.
4. Deduplicate reports by linking duplicates to a canonical ticket. Assign an owner, capture impact/evidence, record status and next action, and verify linked fix evidence before closure.
5. Use cross-client visibility only when your role explicitly grants platform support access. All cross-tenant reads and changes must be authorized and audited. Do not export or disclose another client's ticket to unauthorized users.
6. Restrict security/privacy tickets to approved responders and escalate immediately. Never wait for a P1 count threshold when active security or privacy risk is suspected.

### Client: application-scoped support
1. Sign in to the customer portal and open **My Applications**.
2. Select the application that is affected, then open **Tickets & Feedback** in that application's context.
3. Submit a ticket with type, title, impact/description and safe evidence references. The application selector must list only applications assigned to the authenticated tenant; the server must validate that relationship regardless of what the browser submits.
4. View and follow up only on tickets associated with the same tenant and permitted application scope. Switching to another assigned application changes the queue context; it does not grant access to other tenants or unrelated applications.
5. Do not include passwords, bearer tokens, payment-card details, raw secrets or unnecessary personal information in ticket text or attachments.

### Scope and audit rules
- Ticket identity includes a canonical ticket ID plus trusted tenant ID and application ID; never infer scope solely from a client-provided application label.
- Client access is tenant- and application-scoped. Product Admin's cross-client visibility is a separate privileged support permission, not the default permission of every customer-facing role.
- Ticket create, read where sensitive, assignment, severity/status change, comments, duplicate linking, attachment access and closure should be authorized and auditable.
- A ticket's visibility must not broaden because it is linked to a duplicate, attached to a campaign, or mentioned in a report.
- The customer portal and admin wireframes are POC surfaces. Verify the authenticated APIs, tenant/application membership checks, durable store and audit events before relying on them in production.

## 12. User manual maintenance

This manual covers the intended product workflows and current POC boundaries. Update it alongside changes to the BRD, HLD, LLD, SRS, wireframes, API contracts and role/permission matrix. Treat proposed APIs and static previews as design guidance until their implementation and environment evidence are verified.


## Role-derived ticket API scope (implementation note, 2026-10-27)

Product Admin and client views reuse `GET /admin/support/tickets`; the authenticated role controls the result scope. Configure `EPER_TICKETING_ADMIN_ROLE_KEYS_JSON` for roles allowed to use the admin ticket API and `EPER_TICKETING_CROSS_TENANT_ROLE_KEYS_JSON` only for roles approved to see the cross-client queue (for example, a platform Product Admin role). Keep the cross-tenant list empty unless explicitly authorized. The endpoint returns `scope: "authorized_platform"` for the configured cross-tenant role and `scope: "tenant"` plus the authenticated tenant ID otherwise. A role must be in the admin API allowlist as well as the cross-tenant list to receive broader results.

This currently describes list-result scope only. Cross-client ticket status/assignment mutations and their audit tenant resolution require separate verification before Product Admin can be considered fully enabled to manage tickets across clients. Do not claim Business UAT acceptance based on this change alone.
