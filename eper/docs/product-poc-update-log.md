# EPER Product POC — Change Log and Documentation Index

**Updated:** 2026-10-27 · **Branch:** `feat/campaign-scheduler-foundation`

## Product decisions reflected in this update
1. Platform/Product Admin owns product catalogue, localized market pricing, plans/tariffs, customer and application registry/assignment, entitlements, and client/application access enablement/suspension/disablement.
2. Customer Admin owns operational settings for each assigned application, including messaging/WhatsApp, video conferencing, alerts/notifications, storage/document sharing, workflows and enabled add-ons.
3. Display locale is presentation-only. The approved price for the explicit market and the accepted contract price snapshot determine actual charges.
4. Market switching selects a separate approved price; it is not an implicit FX conversion.
5. AI-driven external publishing, outbound messages and CRM writes require human approval and authorization.
6. Long-running actions should be asynchronous, idempotent and observable.
7. Mobile compatibility, tenant isolation and durable audit are cross-cutting requirements.

## Documentation and POC artifacts
- [Product BRD](product-brd.md) — business outcomes, owners, scope and success measures.
- [Product HLD](product-hld.md) — component boundaries, flows and resilience principles.
- [Product LLD](product-lld.md) — entities, target APIs, policy, concurrency, audit and tests.
- [Product SRS](product-srs.md) — testable functional and non-functional requirements.
- [Pricing/payment admin console](pricing-payment-admin-console.md) — existing price-book and payment-vendor behavior plus runtime limitations.
- [Customer/application settings architecture](customer-application-settings-architecture.md) — admin versus customer settings boundary.
- [Market price book implementation](market-price-book-implementation.md) — current price resolver contract and configuration boundary.
- [Interactive product admin wireframe](../wireframes/product-admin-localization-wireframe.html) — static POC only; no live APIs.
- [Marketing presentation (HTML slides)](../marketing/eper-product-marketing-deck.html) — editable browser presentation.
- [Sales flyers (HTML)](../marketing/eper-sales-flyers.html) — two customer-facing flyer concepts.

## Wireframe navigation changes
- Platform Admin: Product Catalogue, Localized Pricing, Plans & Tariffs, Customers & Applications, Entitlements, Client Access, Audit.
- Customer Portal: My Applications → select application → Settings; app-specific integrations and alerts remain within that application.
- Commercial changes show approval state, version, effective dates and audit reason.
- Pricing UI distinguishes market currency/amount from display locale and formats preview values without mutating the authoritative quote.
- Every UI must expose loading, empty, validation, unauthorized, unavailable and success states; controls are disabled where runtime APIs are not connected.

## Honest implementation boundary
These artifacts update product documentation and static POC wireframes. They do not by themselves implement the placeholder admin APIs, make pricing persistence durable, activate live payment gateways, validate tax compliance, or prove production security/availability. The static marketing deck and flyers are positioning drafts, not approved claims of certifications, SLA, integrations or completed capabilities. Business UAT remains subject to its entry gates.


## Product manual and Product Admin ticketing update (2026-10-27)

- [Product User Manual](product-user-manual.md) now covers Product Admin localized pricing, plans/tariffs and access boundaries; Customer Admin application settings; Feedback & Ticketing triage; governed AI drafts; payment/receipt checks; troubleshooting; and current POC limitations.
- Product Admin pricing console includes a **Feedback & Ticketing** tab and launch action to the separate support workspace at `/wireframes#support`.
- The wireframes workspace now opens the Feedback & tickets screen when that hash is present. Ticketing still uses its own authorized token and server-side authorization; the pricing-console token is not forwarded.
- Ticket access and workflow remain subject to environment configuration and live API readiness. Do not treat a preview screen as proof of a connected production queue.


## Ticketing scope clarification (2026-10-27)

- Product Admin ticketing is a privileged cross-client oversight queue, guarded by a distinct platform-support permission and audited.
- Client ticketing/feedback remains available in customer login but is limited to the selected application assigned to that customer's tenant.
- The customer-facing application selector and all API operations must be validated against trusted tenant/application membership; UI filters alone are not authorization.
- [Product User Manual](product-user-manual.md) includes the updated admin/client workflows; [Product Admin wireframe](../wireframes/product-admin-localization-wireframe.html) includes a static Client Tickets & Feedback screen.
