# EPER Sequential Functionality Build Plan

## Delivery rules

- Work from prerequisites to dependent features; do not start a downstream feature until its dependency exit criteria are met.
- Keep work in the existing consolidated pull request/release stream. Do not open a PR per functionality.
- Implement in small commits inside the owning module, with API/domain/persistence/UI responsibilities separated.
- Run focused tests after each change and the regression suite on the release candidate. CI success is engineering evidence only.
- Shared API response contract: see [`API_RESPONSE_CONTRACT.md`](./API_RESPONSE_CONTRACT.md). Versioned envelopes are opt-in through `Accept: application/vnd.eper.v1+json` until each consumer has migrated; every route family needs current-commit contract evidence.
- Ship related, complete functionality as a release group; run Business UAT against the integrated release candidate only after the formal entry gates are satisfied and explicitly authorized.
- Preserve the 228 requirements, 38 chapters (463–500), six capability families XX01–XX06, and the single execution routing layer.
- Local development and CI only. Do not provision chargeable cloud resources.

## Sequence and dependency gates

| Order | Functionality group | Must be complete first | Exit criteria before proceeding | Delivery state |
|---|---|---|---|---|
| 0 | Shared engineering baseline: response/error envelopes, request IDs, tenant identity contracts, persistence migrations, durable audit/outbox contracts | None | Current-head CI; migration repeatability; response contract tests; audit and rollback/failure tests | PARTIAL — CI has ephemeral PostgreSQL migration/integration lanes. PR #306 adds a fresh-clone `npm run dev:verify` path and a dedicated PostgreSQL CI job; exact-head run is pending. |
| 1 | Customer identity, tenant/application context, RBAC and entitlements | 0 | Missing/invalid identity denied; tenant and actor derived server-side; cross-tenant read/write denied; application assignment and module entitlement enforced; denial audited where required | PARTIAL — PostgreSQL tenant/application and actor/application assignment stores support versioned assign/revoke and transactional audit. Customer APIs check trusted actor application allowlists. Authentication still relies on a server-side static bearer credential map; no production OIDC login, durable browser session lifecycle or session revocation is implemented. PR #307 records the provider-neutral target architecture. |
| 2 | Customer workspace shell and authenticated navigation | 1 | Real customer identity/session, role-aware navigation, application context, loading/empty/error states; Help Center and Growth Hub visible only in customer workspace | PARTIAL — workspace preview is wired to customer APIs and shows clear preview/disconnected states; it is not a production login/session. Browser end-to-end evidence remains outstanding. |
| 3 | Customer Help Center and Growth Hub content | 1, 2 | Content loaded through authorized tenant-scoped APIs; entitlement checks; no admin-only navigation; responsive and keyboard-tested | PARTIAL — tenant-scoped content API wiring is present; authorization regression, current-head CI, and browser validation remain unverified |
| 4 | Customer feedback and ticket submission | 1, 2, durable ticket persistence and audit | Customer can submit; server derives tenant/actor; input validation, idempotency/retry behaviour, durable record and audit; confirmation/error states; no client-selected tenant trust | PARTIAL — API contract, PostgreSQL ticket store, application-scoped customer submission/history/replies and stable idempotent retry path exist. Exact-head integrated PostgreSQL evidence and browser journey remain to be proven. |
| 5 | Admin ticket triage and support operations | 1, 4, admin RBAC/audit | Authorized staff can search/filter/assign/update permitted statuses; customer/admin surfaces separate; every state change audited; cross-tenant access denied | PARTIAL — admin support queue and ticket triage routes exist. Complete the customer source journey and verify role-scoped queue, internal-note confidentiality, assignment/status audit and tenant-wide (not implicit cross-tenant) scope. |
| 6 | Customer application-specific settings | 1, 2, persistence/audit/versioning | Settings scoped to the customer and application; validation, optimistic concurrency, reload/restart persistence, audit; role permissions enforced | BLOCKED until 1–2 |
| 7 | Workflow configuration and execution | 1, 6, workflow contracts and audit | Validated transitions, assigned actors/roles, tenant/application scope, conflict handling, idempotency/concurrency tests, durable audit | BLOCKED until 1 and required application context/settings |
| 8 | Pricing, market price resolution and payment vendor configuration | 0, 1, 6, trusted price/amount source | Server-authoritative amount and currency; sandbox-only until separately authorized; configuration versioning, tenant scope, failure handling, audit | BLOCKED until customer/application context and trusted price inputs are verified |
| 9 | Payment lifecycle, transaction status and receipt generation/download | 8, durable payment store, receipt numbering policy, transaction snapshot source | Idempotent capture/retry; transaction state reconciliation; authorized receipt download with stable content type and unique receipt number; failure injection and audit | BLOCKED until 8 and all trusted sources configured |
| 10 | Notifications and external integrations (including WhatsApp) | 1, 6, integration credential storage, consent/approval and audit | Secret-safe configuration; tenant/application isolation; retries and idempotency; human approval for external actions; no uncontrolled external sends | BLOCKED until shared identity/configuration and approval contracts |
| 11 | Reporting, KPIs and operational dashboards | 1, relevant source flows (4–10), query/pagination contracts | Tenant-scoped aggregation, filters, provenance, bounded pagination, empty/error states, no cross-tenant leakage | BLOCKED until the data-producing workflows are complete |
| 12 | Cross-product responsive/accessibility and integrated regression | All release-group functionality selected for shipment | Browser/viewport checks at 320, 375, 390, 768, 1024 and 1440px; no unintended overflow; keyboard/touch checks; complete regression suite and evidence tied to exact commit | Run per release candidate; source-string assertions alone are not browser evidence |
| 13 | Consolidated release-candidate review and Business UAT gate review | Selected release group above; formal G1–G13 entry gates | Traceability, evidence, known issues, rollback plan, deployment/health evidence and required approvals reviewed; explicit authorization before Business UAT | NOT AUTHORIZED by this plan; requires separate gate review and approval |

.
- The actor's `applicationIds` allowlist is separate from `EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON`, which verifies that the application belongs to the tenant. Both checks must pass; tenant ownership does not grant every actor access to every application.
- Missing, empty, or malformed actor allowlists fail closed with `403 ACTOR_NOT_ASSIGNED_TO_APPLICATION` before the ticket store is called. Do not infer application access from role names or request headers.
- Ticket route tests cover denial for create/list/history/reply and malformed allowlists. They are committed, but remain **NOT RUN / NOT VERIFIED** until a CI run for the exact current commit completes.

## Ticket visibility and role boundary

- **Customer workspace:** a customer may submit a ticket against an application to which their trusted identity is assigned. Ticket history is restricted to the currently selected/authorized application; changing the selected application changes the history scope. The API derives tenant, actor, role, and application assignment from trusted server-side identity and authorization, never from caller-supplied tenant/actor/role headers or query parameters.
- **Admin support workspace:** authorized support/admin users see client-submitted tickets across applications **within their authenticated tenant only**. Application ID is an optional queue filter; status, type, and severity filters do not expand access. Assignment and status changes require admin authorization and durable audit events.
- **No implicit platform-wide access:** “admin” does not mean cross-tenant super-admin. Any cross-tenant support role requires a separately specified permission, explicit approval, and negative/positive cross-tenant regression tests before implementation.
- **Evidence required:** test customer application-level isolation, admin tenant-wide queue visibility, denial of another tenant’s records, spoofed header/query rejection, and audit of admin state changes. UI labels/copy explain the different scopes but do not replace server authorization. Business UAT remains gated until formal entry criteria are met.

## First shipment target

Prioritize a coherent **Customer Support foundation**:
1. Close identity/tenant/application/entitlement gaps (Order 1).
2. Wire the customer workspace to the existing authenticated customer APIs (Order 2).
3. Connect Help Center and Growth Hub content to the customer workspace (Order 3).
4. Connect customer feedback/ticket submission to durable tenant-scoped ticket APIs and audit (Order 4).
5. Complete admin ticket triage only after the customer ticket source flow is proven (Order 5).
6. Run the integrated responsive/regression checks for this shipment (Order 12).

This first shipment is not declared complete until its exit criteria have current-commit evidence. Do not treat the current static customer portal preview as a functional customer login. Existing API routes/tests are useful foundations, but must be verified against the UI integration and end-to-end behaviour.

## Independent functionality rule

A feature is eligible to be developed independently only when its required shared contracts and upstream data/identity dependencies have passed their exit criteria. Independent work may proceed in parallel only if it does not modify the same module/API contract or undermine a prerequisite gate. Prefer completing and merging related changes in the existing PR rather than fragmenting work across branches.

## Feature completion evidence

For every row marked complete, record: requirement IDs; implementation paths; focused test names/results; current commit SHA; relevant CI run; responsive/browser evidence; security/tenant-boundary evidence; audit/persistence evidence; unresolved limitations. Use NOT RUN, BLOCKED, FAIL, or PASS; never infer PASS from the existence of a prototype, route, or unrelated green CI job.
