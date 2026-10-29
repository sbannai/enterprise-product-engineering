# EPER Functionality Maturity Governance

## Standing rule

API, UI, and database/persistence must advance together for every user-facing functionality. Do not allow a sustained maturity gap in any of the three layers. A feature is not complete because only its UI, API, or persistence layer is complete.

## Required per-functionality maturity record

Track these dimensions independently for every functionality:

1. **UI** — usable, responsive across supported mobile and desktop sizes, accessible enough for the intended workflow, with loading/empty/error/success states and role/tenant-aware presentation.
2. **API** — implemented endpoint/contract, input validation, authorization and tenant/application scope, consistent response/error contract, async behavior where appropriate, and API-level regression tests.
3. **Database/persistence** — appropriate schema/migrations, tenant isolation, durable state, transactional/audit/idempotency behavior where required, and persistence tests.
4. **Layer parity** — each UI action maps to a real API contract; each API state maps to durable persistence where required; the UI displays authoritative API/persisted outcomes rather than simulated success.
5. **Verification** — focused tests for all three layers, then integration tests across UI/API/database. A test is complete only with recorded execution evidence; queued, missing, or skipped results are not passes.

## Maturity states

- **Not started** — no implementation evidence.
- **In progress** — one or more layers are being implemented.
- **Imbalanced** — a layer materially lags or a layer has no real contract/implementation. Record the gap and prioritize the missing layer before expanding dependent functionality.
- **Layer-complete** — UI, API, and database changes for the scoped functionality exist, but cross-layer verification is still pending.
- **Functionality verified** — focused layer tests and cross-layer integration tests passed with evidence.
- **Blocked** — a concrete dependency, environment, or validation blocker prevents progress; name the blocker and the next action.

Do not represent a functionality as complete or ready for UAT while it is imbalanced, has unverified layers, or lacks required integration evidence.

## Delivery sequence

1. Define the end-to-end user outcome and API/data contracts before implementation.
2. Implement the UI, API, and database work as one bounded functionality slice. Work may be parallelized, but all layers must converge before calling the slice complete.
3. Test each layer independently, including failure and authorization paths.
4. Run UI-to-API-to-database integration tests and verify persisted outcomes.
5. Close any maturity gap before starting dependent functionality, unless an explicit dependency plan identifies the gap and prevents downstream work from relying on it.
6. Only after functionality and integration evidence is complete, assess UAT entry criteria. Business UAT remains a separate authorized gate.

## Guardrails

- Prefer small, reviewable changes that preserve existing functionality; do not merge whole diverged feature branches just to create apparent parity.
- Keep feature flags and outbound effects disabled until their safety and verification gates are satisfied.
- Do not claim tests passed without exact-head results. Queued, missing, or skipped CI is unverified.
- Do not provision chargeable cloud resources or run migrations against shared/production databases without explicit approval.
- Maintain the existing product requirements and traceability; this governance rule does not reduce or replace requirements.
- Update the functionality status tracker with UI, API, database, focused-test, integration-test, imbalance, and evidence fields when the tracker is next explicitly updated.

## Review question

For each functionality, ask: **Can a user complete the intended workflow in the UI, does the API enforce the right contract and authorization, and is the resulting state correctly and durably stored?** If any answer is no or unverified, the functionality is not yet verified.
