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
