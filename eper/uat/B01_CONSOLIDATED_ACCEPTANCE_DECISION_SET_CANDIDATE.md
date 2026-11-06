# B01 Consolidated Acceptance Decision Set — Candidate Only

**Status:** Owner-review candidate; not an approval or authorization  
**Scope:** 48 requirements, Chapters 463–470; SRS-FR-2323–SRS-FR-2370  
**Baseline control:** Preserve 228 requirements / 38 chapters. No execution authorization is granted by this document.

## Purpose and rules

This consolidates the existing proposed oracle scaffold into one chapter-by-chapter review set. All oracle statements below remain proposals until the relevant business owner approves exact values, fixtures, expected outcomes and controlled source locators. The detailed BRD/SRS and LLD sources referenced by the current repository are not treated as approved merely because they are consolidated or traceable.

**Decision vocabulary:** `APPROVE WITH CONTROLLED SOURCE` (requires exact locator/version and approval reference) · `CLARIFICATION REQUIRED` · `RETURN FOR CORRECTION`.

## Chapter decision summary

| Chapter | Domain focus | Requirements | Owner decision focus |
|---|---|---:|---|
| 463 | Procurement / sourcing and purchase lifecycle | 6 | Approve or correct all six capability oracles; provide controlled source locators and measurable expected results. |
| 464 | Supplier relationship, scorecards, risk, compliance, CAPA and contract obligations | 6 | Approve or correct all six capability oracles; provide controlled source locators and measurable expected results. |
| 465 | Inventory, warehouse locations, balances, reservations, lots/serials and adjustments | 6 | Approve or correct all six capability oracles; provide controlled source locators and measurable expected results. |
| 466 | Order management, allocations, shipment, delivery, returns, refunds and order exceptions | 6 | Approve or correct all six capability oracles; provide controlled source locators and measurable expected results. |
| 467 | Transportation, carrier tender, tracking, freight invoice and claims | 6 | Approve or correct all six capability oracles; provide controlled source locators and measurable expected results. |
| 468 | Manufacturing plans/orders, operations, consumption, confirmations, quality and genealogy | 6 | Approve or correct all six capability oracles; provide controlled source locators and measurable expected results. |
| 469 | Inspection, nonconformance, containment, disposition, CAPA, audit and certificates | 6 | Approve or correct all six capability oracles; provide controlled source locators and measurable expected results. |
| 470 | Asset hierarchy, preventive maintenance, work orders, failure events and spare consumption | 6 | Approve or correct all six capability oracles; provide controlled source locators and measurable expected results. |

## Requirement-level decision set

### Chapter 463 — Procurement / sourcing and purchase lifecycle

#### REQ-46301 — SRS-FR-2323 — authoritative-records

- **Candidate oracle (not approved):** Draft only: Given an owner-approved record type, valid create/update/retire command should persist the specified field values and lifecycle/version history exactly once; invalid input should return the approved error outcome and leave authoritative state unchanged.
- **Evidence to capture:** Before/after record snapshots; persisted field values; lifecycle/version history; correlation ID; audit evidence.
- **Owner must decide:** Confirm record type, actor/owner, mandatory fields, uniqueness, lifecycle states, retention, and exact expected field values.
- **Minimum decision required:** Confirm entity/aggregate, required fields, identity/uniqueness, lifecycle states/transitions, version history and retention.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46302 — SRS-FR-2324 — authorization

- **Candidate oracle (not approved):** Draft only: For each owner-approved actor × role × tenant × resource × action case, authorized requests produce the specified result; unauthorized requests are denied before material mutation, with no cross-tenant disclosure and required security audit evidence.
- **Evidence to capture:** Actor/role/tenant context; action/resource; allow/deny result; response; before/after state; security audit event.
- **Owner must decide:** Approve role/permission matrix, resource ownership, tenant boundaries, delegation, and expected allow/deny response.
- **Minimum decision required:** Approve actor × role × tenant × resource × action matrix, delegation, segregation of duties, and exact deny response.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46303 — SRS-FR-2325 — business-validation

- **Candidate oracle (not approved):** Draft only: For each owner-approved valid, invalid, and boundary input, the operation returns the specified result; invalid inputs cause no prohibited state change, partial commit, duplicate side effect, or unauthorized event.
- **Evidence to capture:** Input/test data; rule decision; response/error; before/after state; transaction and event evidence.
- **Owner must decide:** Define business rules, mandatory conditions, boundary values, expected outcomes, and idempotency/side-effect requirements.
- **Minimum decision required:** Approve business conditions, validation order, boundary fixtures, error contract and prohibited side effects.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46304 — SRS-FR-2326 — audit-evidence

- **Candidate oracle (not approved):** Draft only: Each owner-defined material event produces the required audit record with approved actor, tenant, action, timestamp, correlation, and outcome fields; denied or failed events follow the explicitly approved audit policy; secret fields are absent.
- **Evidence to capture:** Trigger/action; audit record; required-field assertions; correlation linkage; secret/payload scan.
- **Owner must decide:** Enumerate auditable events, mandatory fields, failure/denial coverage, retention, and payload exclusions.
- **Minimum decision required:** Approve event inventory, mandatory audit fields, integrity/access controls, retention and audit-write failure behavior.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46305 — SRS-FR-2327 — exception-handling

- **Candidate oracle (not approved):** Draft only: For an owner-defined transient failure, retries remain within the approved retry limit; duplicate delivery does not duplicate material effects; exhausted/permanent failures enter the approved recovery/DLQ state and any compensation is evidenced.
- **Evidence to capture:** Injected failure; retry counter/timestamps; resulting workflow state; idempotency proof; DLQ/compensation record.
- **Owner must decide:** Set retry count/backoff, transient/permanent classification, timeout, compensation rules, and terminal/recovery outcomes.
- **Minimum decision required:** Approve exception taxonomy, retry limits/backoff, idempotency, escalation, compensation and terminal/recovery states.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46306 — SRS-FR-2328 — governed-reporting

- **Candidate oracle (not approved):** Draft only: For an approved fixture dataset and tenant, report rows, filters, aggregations, and totals match an independently calculated expected result; tenant scoping excludes unauthorized records and source data is not mutated.
- **Evidence to capture:** Fixture IDs; query/filter parameters; expected-versus-actual rows/totals; tenant-scope assertion; source-state comparison.
- **Owner must decide:** Approve metric definitions, filters, aggregation/time windows, freshness, permissions, and expected totals.
- **Minimum decision required:** Approve report catalogue, KPI formulas/owners, fixtures and expected totals, freshness, filters and access scope.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO


### Chapter 464 — Supplier relationship, scorecards, risk, compliance, CAPA and contract obligations

#### REQ-46401 — SRS-FR-2329 — authoritative-records

- **Candidate oracle (not approved):** Draft only: Given an owner-approved record type, valid create/update/retire command should persist the specified field values and lifecycle/version history exactly once; invalid input should return the approved error outcome and leave authoritative state unchanged.
- **Evidence to capture:** Before/after record snapshots; persisted field values; lifecycle/version history; correlation ID; audit evidence.
- **Owner must decide:** Confirm record type, actor/owner, mandatory fields, uniqueness, lifecycle states, retention, and exact expected field values.
- **Minimum decision required:** Confirm entity/aggregate, required fields, identity/uniqueness, lifecycle states/transitions, version history and retention.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46402 — SRS-FR-2330 — authorization

- **Candidate oracle (not approved):** Draft only: For each owner-approved actor × role × tenant × resource × action case, authorized requests produce the specified result; unauthorized requests are denied before material mutation, with no cross-tenant disclosure and required security audit evidence.
- **Evidence to capture:** Actor/role/tenant context; action/resource; allow/deny result; response; before/after state; security audit event.
- **Owner must decide:** Approve role/permission matrix, resource ownership, tenant boundaries, delegation, and expected allow/deny response.
- **Minimum decision required:** Approve actor × role × tenant × resource × action matrix, delegation, segregation of duties, and exact deny response.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46403 — SRS-FR-2331 — business-validation

- **Candidate oracle (not approved):** Draft only: For each owner-approved valid, invalid, and boundary input, the operation returns the specified result; invalid inputs cause no prohibited state change, partial commit, duplicate side effect, or unauthorized event.
- **Evidence to capture:** Input/test data; rule decision; response/error; before/after state; transaction and event evidence.
- **Owner must decide:** Define business rules, mandatory conditions, boundary values, expected outcomes, and idempotency/side-effect requirements.
- **Minimum decision required:** Approve business conditions, validation order, boundary fixtures, error contract and prohibited side effects.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46404 — SRS-FR-2332 — audit-evidence

- **Candidate oracle (not approved):** Draft only: Each owner-defined material event produces the required audit record with approved actor, tenant, action, timestamp, correlation, and outcome fields; denied or failed events follow the explicitly approved audit policy; secret fields are absent.
- **Evidence to capture:** Trigger/action; audit record; required-field assertions; correlation linkage; secret/payload scan.
- **Owner must decide:** Enumerate auditable events, mandatory fields, failure/denial coverage, retention, and payload exclusions.
- **Minimum decision required:** Approve event inventory, mandatory audit fields, integrity/access controls, retention and audit-write failure behavior.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46405 — SRS-FR-2333 — exception-handling

- **Candidate oracle (not approved):** Draft only: For an owner-defined transient failure, retries remain within the approved retry limit; duplicate delivery does not duplicate material effects; exhausted/permanent failures enter the approved recovery/DLQ state and any compensation is evidenced.
- **Evidence to capture:** Injected failure; retry counter/timestamps; resulting workflow state; idempotency proof; DLQ/compensation record.
- **Owner must decide:** Set retry count/backoff, transient/permanent classification, timeout, compensation rules, and terminal/recovery outcomes.
- **Minimum decision required:** Approve exception taxonomy, retry limits/backoff, idempotency, escalation, compensation and terminal/recovery states.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46406 — SRS-FR-2334 — governed-reporting

- **Candidate oracle (not approved):** Draft only: For an approved fixture dataset and tenant, report rows, filters, aggregations, and totals match an independently calculated expected result; tenant scoping excludes unauthorized records and source data is not mutated.
- **Evidence to capture:** Fixture IDs; query/filter parameters; expected-versus-actual rows/totals; tenant-scope assertion; source-state comparison.
- **Owner must decide:** Approve metric definitions, filters, aggregation/time windows, freshness, permissions, and expected totals.
- **Minimum decision required:** Approve report catalogue, KPI formulas/owners, fixtures and expected totals, freshness, filters and access scope.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO


### Chapter 465 — Inventory, warehouse locations, balances, reservations, lots/serials and adjustments

#### REQ-46501 — SRS-FR-2335 — authoritative-records

- **Candidate oracle (not approved):** Draft only: Given an owner-approved record type, valid create/update/retire command should persist the specified field values and lifecycle/version history exactly once; invalid input should return the approved error outcome and leave authoritative state unchanged.
- **Evidence to capture:** Before/after record snapshots; persisted field values; lifecycle/version history; correlation ID; audit evidence.
- **Owner must decide:** Confirm record type, actor/owner, mandatory fields, uniqueness, lifecycle states, retention, and exact expected field values.
- **Minimum decision required:** Confirm entity/aggregate, required fields, identity/uniqueness, lifecycle states/transitions, version history and retention.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46502 — SRS-FR-2336 — authorization

- **Candidate oracle (not approved):** Draft only: For each owner-approved actor × role × tenant × resource × action case, authorized requests produce the specified result; unauthorized requests are denied before material mutation, with no cross-tenant disclosure and required security audit evidence.
- **Evidence to capture:** Actor/role/tenant context; action/resource; allow/deny result; response; before/after state; security audit event.
- **Owner must decide:** Approve role/permission matrix, resource ownership, tenant boundaries, delegation, and expected allow/deny response.
- **Minimum decision required:** Approve actor × role × tenant × resource × action matrix, delegation, segregation of duties, and exact deny response.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46503 — SRS-FR-2337 — business-validation

- **Candidate oracle (not approved):** Draft only: For each owner-approved valid, invalid, and boundary input, the operation returns the specified result; invalid inputs cause no prohibited state change, partial commit, duplicate side effect, or unauthorized event.
- **Evidence to capture:** Input/test data; rule decision; response/error; before/after state; transaction and event evidence.
- **Owner must decide:** Define business rules, mandatory conditions, boundary values, expected outcomes, and idempotency/side-effect requirements.
- **Minimum decision required:** Approve business conditions, validation order, boundary fixtures, error contract and prohibited side effects.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46504 — SRS-FR-2338 — audit-evidence

- **Candidate oracle (not approved):** Draft only: Each owner-defined material event produces the required audit record with approved actor, tenant, action, timestamp, correlation, and outcome fields; denied or failed events follow the explicitly approved audit policy; secret fields are absent.
- **Evidence to capture:** Trigger/action; audit record; required-field assertions; correlation linkage; secret/payload scan.
- **Owner must decide:** Enumerate auditable events, mandatory fields, failure/denial coverage, retention, and payload exclusions.
- **Minimum decision required:** Approve event inventory, mandatory audit fields, integrity/access controls, retention and audit-write failure behavior.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46505 — SRS-FR-2339 — exception-handling

- **Candidate oracle (not approved):** Draft only: For an owner-defined transient failure, retries remain within the approved retry limit; duplicate delivery does not duplicate material effects; exhausted/permanent failures enter the approved recovery/DLQ state and any compensation is evidenced.
- **Evidence to capture:** Injected failure; retry counter/timestamps; resulting workflow state; idempotency proof; DLQ/compensation record.
- **Owner must decide:** Set retry count/backoff, transient/permanent classification, timeout, compensation rules, and terminal/recovery outcomes.
- **Minimum decision required:** Approve exception taxonomy, retry limits/backoff, idempotency, escalation, compensation and terminal/recovery states.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46506 — SRS-FR-2340 — governed-reporting

- **Candidate oracle (not approved):** Draft only: For an approved fixture dataset and tenant, report rows, filters, aggregations, and totals match an independently calculated expected result; tenant scoping excludes unauthorized records and source data is not mutated.
- **Evidence to capture:** Fixture IDs; query/filter parameters; expected-versus-actual rows/totals; tenant-scope assertion; source-state comparison.
- **Owner must decide:** Approve metric definitions, filters, aggregation/time windows, freshness, permissions, and expected totals.
- **Minimum decision required:** Approve report catalogue, KPI formulas/owners, fixtures and expected totals, freshness, filters and access scope.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO


### Chapter 466 — Order management, allocations, shipment, delivery, returns, refunds and order exceptions

#### REQ-46601 — SRS-FR-2341 — authoritative-records

- **Candidate oracle (not approved):** Draft only: Given an owner-approved record type, valid create/update/retire command should persist the specified field values and lifecycle/version history exactly once; invalid input should return the approved error outcome and leave authoritative state unchanged.
- **Evidence to capture:** Before/after record snapshots; persisted field values; lifecycle/version history; correlation ID; audit evidence.
- **Owner must decide:** Confirm record type, actor/owner, mandatory fields, uniqueness, lifecycle states, retention, and exact expected field values.
- **Minimum decision required:** Confirm entity/aggregate, required fields, identity/uniqueness, lifecycle states/transitions, version history and retention.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46602 — SRS-FR-2342 — authorization

- **Candidate oracle (not approved):** Draft only: For each owner-approved actor × role × tenant × resource × action case, authorized requests produce the specified result; unauthorized requests are denied before material mutation, with no cross-tenant disclosure and required security audit evidence.
- **Evidence to capture:** Actor/role/tenant context; action/resource; allow/deny result; response; before/after state; security audit event.
- **Owner must decide:** Approve role/permission matrix, resource ownership, tenant boundaries, delegation, and expected allow/deny response.
- **Minimum decision required:** Approve actor × role × tenant × resource × action matrix, delegation, segregation of duties, and exact deny response.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46603 — SRS-FR-2343 — business-validation

- **Candidate oracle (not approved):** Draft only: For each owner-approved valid, invalid, and boundary input, the operation returns the specified result; invalid inputs cause no prohibited state change, partial commit, duplicate side effect, or unauthorized event.
- **Evidence to capture:** Input/test data; rule decision; response/error; before/after state; transaction and event evidence.
- **Owner must decide:** Define business rules, mandatory conditions, boundary values, expected outcomes, and idempotency/side-effect requirements.
- **Minimum decision required:** Approve business conditions, validation order, boundary fixtures, error contract and prohibited side effects.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46604 — SRS-FR-2344 — audit-evidence

- **Candidate oracle (not approved):** Draft only: Each owner-defined material event produces the required audit record with approved actor, tenant, action, timestamp, correlation, and outcome fields; denied or failed events follow the explicitly approved audit policy; secret fields are absent.
- **Evidence to capture:** Trigger/action; audit record; required-field assertions; correlation linkage; secret/payload scan.
- **Owner must decide:** Enumerate auditable events, mandatory fields, failure/denial coverage, retention, and payload exclusions.
- **Minimum decision required:** Approve event inventory, mandatory audit fields, integrity/access controls, retention and audit-write failure behavior.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46605 — SRS-FR-2345 — exception-handling

- **Candidate oracle (not approved):** Draft only: For an owner-defined transient failure, retries remain within the approved retry limit; duplicate delivery does not duplicate material effects; exhausted/permanent failures enter the approved recovery/DLQ state and any compensation is evidenced.
- **Evidence to capture:** Injected failure; retry counter/timestamps; resulting workflow state; idempotency proof; DLQ/compensation record.
- **Owner must decide:** Set retry count/backoff, transient/permanent classification, timeout, compensation rules, and terminal/recovery outcomes.
- **Minimum decision required:** Approve exception taxonomy, retry limits/backoff, idempotency, escalation, compensation and terminal/recovery states.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46606 — SRS-FR-2346 — governed-reporting

- **Candidate oracle (not approved):** Draft only: For an approved fixture dataset and tenant, report rows, filters, aggregations, and totals match an independently calculated expected result; tenant scoping excludes unauthorized records and source data is not mutated.
- **Evidence to capture:** Fixture IDs; query/filter parameters; expected-versus-actual rows/totals; tenant-scope assertion; source-state comparison.
- **Owner must decide:** Approve metric definitions, filters, aggregation/time windows, freshness, permissions, and expected totals.
- **Minimum decision required:** Approve report catalogue, KPI formulas/owners, fixtures and expected totals, freshness, filters and access scope.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO


### Chapter 467 — Transportation, carrier tender, tracking, freight invoice and claims

#### REQ-46701 — SRS-FR-2347 — authoritative-records

- **Candidate oracle (not approved):** Draft only: Given an owner-approved record type, valid create/update/retire command should persist the specified field values and lifecycle/version history exactly once; invalid input should return the approved error outcome and leave authoritative state unchanged.
- **Evidence to capture:** Before/after record snapshots; persisted field values; lifecycle/version history; correlation ID; audit evidence.
- **Owner must decide:** Confirm record type, actor/owner, mandatory fields, uniqueness, lifecycle states, retention, and exact expected field values.
- **Minimum decision required:** Confirm entity/aggregate, required fields, identity/uniqueness, lifecycle states/transitions, version history and retention.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46702 — SRS-FR-2348 — authorization

- **Candidate oracle (not approved):** Draft only: For each owner-approved actor × role × tenant × resource × action case, authorized requests produce the specified result; unauthorized requests are denied before material mutation, with no cross-tenant disclosure and required security audit evidence.
- **Evidence to capture:** Actor/role/tenant context; action/resource; allow/deny result; response; before/after state; security audit event.
- **Owner must decide:** Approve role/permission matrix, resource ownership, tenant boundaries, delegation, and expected allow/deny response.
- **Minimum decision required:** Approve actor × role × tenant × resource × action matrix, delegation, segregation of duties, and exact deny response.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46703 — SRS-FR-2349 — business-validation

- **Candidate oracle (not approved):** Draft only: For each owner-approved valid, invalid, and boundary input, the operation returns the specified result; invalid inputs cause no prohibited state change, partial commit, duplicate side effect, or unauthorized event.
- **Evidence to capture:** Input/test data; rule decision; response/error; before/after state; transaction and event evidence.
- **Owner must decide:** Define business rules, mandatory conditions, boundary values, expected outcomes, and idempotency/side-effect requirements.
- **Minimum decision required:** Approve business conditions, validation order, boundary fixtures, error contract and prohibited side effects.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46704 — SRS-FR-2350 — audit-evidence

- **Candidate oracle (not approved):** Draft only: Each owner-defined material event produces the required audit record with approved actor, tenant, action, timestamp, correlation, and outcome fields; denied or failed events follow the explicitly approved audit policy; secret fields are absent.
- **Evidence to capture:** Trigger/action; audit record; required-field assertions; correlation linkage; secret/payload scan.
- **Owner must decide:** Enumerate auditable events, mandatory fields, failure/denial coverage, retention, and payload exclusions.
- **Minimum decision required:** Approve event inventory, mandatory audit fields, integrity/access controls, retention and audit-write failure behavior.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46705 — SRS-FR-2351 — exception-handling

- **Candidate oracle (not approved):** Draft only: For an owner-defined transient failure, retries remain within the approved retry limit; duplicate delivery does not duplicate material effects; exhausted/permanent failures enter the approved recovery/DLQ state and any compensation is evidenced.
- **Evidence to capture:** Injected failure; retry counter/timestamps; resulting workflow state; idempotency proof; DLQ/compensation record.
- **Owner must decide:** Set retry count/backoff, transient/permanent classification, timeout, compensation rules, and terminal/recovery outcomes.
- **Minimum decision required:** Approve exception taxonomy, retry limits/backoff, idempotency, escalation, compensation and terminal/recovery states.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46706 — SRS-FR-2352 — governed-reporting

- **Candidate oracle (not approved):** Draft only: For an approved fixture dataset and tenant, report rows, filters, aggregations, and totals match an independently calculated expected result; tenant scoping excludes unauthorized records and source data is not mutated.
- **Evidence to capture:** Fixture IDs; query/filter parameters; expected-versus-actual rows/totals; tenant-scope assertion; source-state comparison.
- **Owner must decide:** Approve metric definitions, filters, aggregation/time windows, freshness, permissions, and expected totals.
- **Minimum decision required:** Approve report catalogue, KPI formulas/owners, fixtures and expected totals, freshness, filters and access scope.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO


### Chapter 468 — Manufacturing plans/orders, operations, consumption, confirmations, quality and genealogy

#### REQ-46801 — SRS-FR-2353 — authoritative-records

- **Candidate oracle (not approved):** Draft only: Given an owner-approved record type, valid create/update/retire command should persist the specified field values and lifecycle/version history exactly once; invalid input should return the approved error outcome and leave authoritative state unchanged.
- **Evidence to capture:** Before/after record snapshots; persisted field values; lifecycle/version history; correlation ID; audit evidence.
- **Owner must decide:** Confirm record type, actor/owner, mandatory fields, uniqueness, lifecycle states, retention, and exact expected field values.
- **Minimum decision required:** Confirm entity/aggregate, required fields, identity/uniqueness, lifecycle states/transitions, version history and retention.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46802 — SRS-FR-2354 — authorization

- **Candidate oracle (not approved):** Draft only: For each owner-approved actor × role × tenant × resource × action case, authorized requests produce the specified result; unauthorized requests are denied before material mutation, with no cross-tenant disclosure and required security audit evidence.
- **Evidence to capture:** Actor/role/tenant context; action/resource; allow/deny result; response; before/after state; security audit event.
- **Owner must decide:** Approve role/permission matrix, resource ownership, tenant boundaries, delegation, and expected allow/deny response.
- **Minimum decision required:** Approve actor × role × tenant × resource × action matrix, delegation, segregation of duties, and exact deny response.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46803 — SRS-FR-2355 — business-validation

- **Candidate oracle (not approved):** Draft only: For each owner-approved valid, invalid, and boundary input, the operation returns the specified result; invalid inputs cause no prohibited state change, partial commit, duplicate side effect, or unauthorized event.
- **Evidence to capture:** Input/test data; rule decision; response/error; before/after state; transaction and event evidence.
- **Owner must decide:** Define business rules, mandatory conditions, boundary values, expected outcomes, and idempotency/side-effect requirements.
- **Minimum decision required:** Approve business conditions, validation order, boundary fixtures, error contract and prohibited side effects.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46804 — SRS-FR-2356 — audit-evidence

- **Candidate oracle (not approved):** Draft only: Each owner-defined material event produces the required audit record with approved actor, tenant, action, timestamp, correlation, and outcome fields; denied or failed events follow the explicitly approved audit policy; secret fields are absent.
- **Evidence to capture:** Trigger/action; audit record; required-field assertions; correlation linkage; secret/payload scan.
- **Owner must decide:** Enumerate auditable events, mandatory fields, failure/denial coverage, retention, and payload exclusions.
- **Minimum decision required:** Approve event inventory, mandatory audit fields, integrity/access controls, retention and audit-write failure behavior.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46805 — SRS-FR-2357 — exception-handling

- **Candidate oracle (not approved):** Draft only: For an owner-defined transient failure, retries remain within the approved retry limit; duplicate delivery does not duplicate material effects; exhausted/permanent failures enter the approved recovery/DLQ state and any compensation is evidenced.
- **Evidence to capture:** Injected failure; retry counter/timestamps; resulting workflow state; idempotency proof; DLQ/compensation record.
- **Owner must decide:** Set retry count/backoff, transient/permanent classification, timeout, compensation rules, and terminal/recovery outcomes.
- **Minimum decision required:** Approve exception taxonomy, retry limits/backoff, idempotency, escalation, compensation and terminal/recovery states.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46806 — SRS-FR-2358 — governed-reporting

- **Candidate oracle (not approved):** Draft only: For an approved fixture dataset and tenant, report rows, filters, aggregations, and totals match an independently calculated expected result; tenant scoping excludes unauthorized records and source data is not mutated.
- **Evidence to capture:** Fixture IDs; query/filter parameters; expected-versus-actual rows/totals; tenant-scope assertion; source-state comparison.
- **Owner must decide:** Approve metric definitions, filters, aggregation/time windows, freshness, permissions, and expected totals.
- **Minimum decision required:** Approve report catalogue, KPI formulas/owners, fixtures and expected totals, freshness, filters and access scope.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO


### Chapter 469 — Inspection, nonconformance, containment, disposition, CAPA, audit and certificates

#### REQ-46901 — SRS-FR-2359 — authoritative-records

- **Candidate oracle (not approved):** Draft only: Given an owner-approved record type, valid create/update/retire command should persist the specified field values and lifecycle/version history exactly once; invalid input should return the approved error outcome and leave authoritative state unchanged.
- **Evidence to capture:** Before/after record snapshots; persisted field values; lifecycle/version history; correlation ID; audit evidence.
- **Owner must decide:** Confirm record type, actor/owner, mandatory fields, uniqueness, lifecycle states, retention, and exact expected field values.
- **Minimum decision required:** Confirm entity/aggregate, required fields, identity/uniqueness, lifecycle states/transitions, version history and retention.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46902 — SRS-FR-2360 — authorization

- **Candidate oracle (not approved):** Draft only: For each owner-approved actor × role × tenant × resource × action case, authorized requests produce the specified result; unauthorized requests are denied before material mutation, with no cross-tenant disclosure and required security audit evidence.
- **Evidence to capture:** Actor/role/tenant context; action/resource; allow/deny result; response; before/after state; security audit event.
- **Owner must decide:** Approve role/permission matrix, resource ownership, tenant boundaries, delegation, and expected allow/deny response.
- **Minimum decision required:** Approve actor × role × tenant × resource × action matrix, delegation, segregation of duties, and exact deny response.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46903 — SRS-FR-2361 — business-validation

- **Candidate oracle (not approved):** Draft only: For each owner-approved valid, invalid, and boundary input, the operation returns the specified result; invalid inputs cause no prohibited state change, partial commit, duplicate side effect, or unauthorized event.
- **Evidence to capture:** Input/test data; rule decision; response/error; before/after state; transaction and event evidence.
- **Owner must decide:** Define business rules, mandatory conditions, boundary values, expected outcomes, and idempotency/side-effect requirements.
- **Minimum decision required:** Approve business conditions, validation order, boundary fixtures, error contract and prohibited side effects.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46904 — SRS-FR-2362 — audit-evidence

- **Candidate oracle (not approved):** Draft only: Each owner-defined material event produces the required audit record with approved actor, tenant, action, timestamp, correlation, and outcome fields; denied or failed events follow the explicitly approved audit policy; secret fields are absent.
- **Evidence to capture:** Trigger/action; audit record; required-field assertions; correlation linkage; secret/payload scan.
- **Owner must decide:** Enumerate auditable events, mandatory fields, failure/denial coverage, retention, and payload exclusions.
- **Minimum decision required:** Approve event inventory, mandatory audit fields, integrity/access controls, retention and audit-write failure behavior.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46905 — SRS-FR-2363 — exception-handling

- **Candidate oracle (not approved):** Draft only: For an owner-defined transient failure, retries remain within the approved retry limit; duplicate delivery does not duplicate material effects; exhausted/permanent failures enter the approved recovery/DLQ state and any compensation is evidenced.
- **Evidence to capture:** Injected failure; retry counter/timestamps; resulting workflow state; idempotency proof; DLQ/compensation record.
- **Owner must decide:** Set retry count/backoff, transient/permanent classification, timeout, compensation rules, and terminal/recovery outcomes.
- **Minimum decision required:** Approve exception taxonomy, retry limits/backoff, idempotency, escalation, compensation and terminal/recovery states.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-46906 — SRS-FR-2364 — governed-reporting

- **Candidate oracle (not approved):** Draft only: For an approved fixture dataset and tenant, report rows, filters, aggregations, and totals match an independently calculated expected result; tenant scoping excludes unauthorized records and source data is not mutated.
- **Evidence to capture:** Fixture IDs; query/filter parameters; expected-versus-actual rows/totals; tenant-scope assertion; source-state comparison.
- **Owner must decide:** Approve metric definitions, filters, aggregation/time windows, freshness, permissions, and expected totals.
- **Minimum decision required:** Approve report catalogue, KPI formulas/owners, fixtures and expected totals, freshness, filters and access scope.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO


### Chapter 470 — Asset hierarchy, preventive maintenance, work orders, failure events and spare consumption

#### REQ-47001 — SRS-FR-2365 — authoritative-records

- **Candidate oracle (not approved):** Draft only: Given an owner-approved record type, valid create/update/retire command should persist the specified field values and lifecycle/version history exactly once; invalid input should return the approved error outcome and leave authoritative state unchanged.
- **Evidence to capture:** Before/after record snapshots; persisted field values; lifecycle/version history; correlation ID; audit evidence.
- **Owner must decide:** Confirm record type, actor/owner, mandatory fields, uniqueness, lifecycle states, retention, and exact expected field values.
- **Minimum decision required:** Confirm entity/aggregate, required fields, identity/uniqueness, lifecycle states/transitions, version history and retention.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-47002 — SRS-FR-2366 — authorization

- **Candidate oracle (not approved):** Draft only: For each owner-approved actor × role × tenant × resource × action case, authorized requests produce the specified result; unauthorized requests are denied before material mutation, with no cross-tenant disclosure and required security audit evidence.
- **Evidence to capture:** Actor/role/tenant context; action/resource; allow/deny result; response; before/after state; security audit event.
- **Owner must decide:** Approve role/permission matrix, resource ownership, tenant boundaries, delegation, and expected allow/deny response.
- **Minimum decision required:** Approve actor × role × tenant × resource × action matrix, delegation, segregation of duties, and exact deny response.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-47003 — SRS-FR-2367 — business-validation

- **Candidate oracle (not approved):** Draft only: For each owner-approved valid, invalid, and boundary input, the operation returns the specified result; invalid inputs cause no prohibited state change, partial commit, duplicate side effect, or unauthorized event.
- **Evidence to capture:** Input/test data; rule decision; response/error; before/after state; transaction and event evidence.
- **Owner must decide:** Define business rules, mandatory conditions, boundary values, expected outcomes, and idempotency/side-effect requirements.
- **Minimum decision required:** Approve business conditions, validation order, boundary fixtures, error contract and prohibited side effects.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-47004 — SRS-FR-2368 — audit-evidence

- **Candidate oracle (not approved):** Draft only: Each owner-defined material event produces the required audit record with approved actor, tenant, action, timestamp, correlation, and outcome fields; denied or failed events follow the explicitly approved audit policy; secret fields are absent.
- **Evidence to capture:** Trigger/action; audit record; required-field assertions; correlation linkage; secret/payload scan.
- **Owner must decide:** Enumerate auditable events, mandatory fields, failure/denial coverage, retention, and payload exclusions.
- **Minimum decision required:** Approve event inventory, mandatory audit fields, integrity/access controls, retention and audit-write failure behavior.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-47005 — SRS-FR-2369 — exception-handling

- **Candidate oracle (not approved):** Draft only: For an owner-defined transient failure, retries remain within the approved retry limit; duplicate delivery does not duplicate material effects; exhausted/permanent failures enter the approved recovery/DLQ state and any compensation is evidenced.
- **Evidence to capture:** Injected failure; retry counter/timestamps; resulting workflow state; idempotency proof; DLQ/compensation record.
- **Owner must decide:** Set retry count/backoff, transient/permanent classification, timeout, compensation rules, and terminal/recovery outcomes.
- **Minimum decision required:** Approve exception taxonomy, retry limits/backoff, idempotency, escalation, compensation and terminal/recovery states.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

#### REQ-47006 — SRS-FR-2370 — governed-reporting

- **Candidate oracle (not approved):** Draft only: For an approved fixture dataset and tenant, report rows, filters, aggregations, and totals match an independently calculated expected result; tenant scoping excludes unauthorized records and source data is not mutated.
- **Evidence to capture:** Fixture IDs; query/filter parameters; expected-versus-actual rows/totals; tenant-scope assertion; source-state comparison.
- **Owner must decide:** Approve metric definitions, filters, aggregation/time windows, freshness, permissions, and expected totals.
- **Minimum decision required:** Approve report catalogue, KPI formulas/owners, fixtures and expected totals, freshness, filters and access scope.
- **Controlled source locator:** PENDING
- **Owner decision reference:** PENDING
- **UAT execution authorized:** NO

## Cross-cutting release conditions

1. Confirm requirement-specific oracle with approved BRD/SRS version, exact section/paragraph, approver and change-control reference.
2. Approve the case actor/role/tenant, preconditions, positive and negative steps, fixture IDs, measurable outputs, and state/side-effect assertions.
3. Confirm exact approved HLD→LLD binding for each requirement and either a versioned DATA/API/EVENT contract or approved not-applicable disposition.
4. Verify all E1–E13 gates and the authorized target/build preflight; retain artifacts.
5. Record explicit business-owner authorization before any live business UAT. Technical CI or simulated tests do not count as business acceptance.

## Current disposition

- Candidate requirement oracles included: 48/48 (source scaffold rows)
- Owner-approved acceptance oracles established by this document: **0/48**
- Execution authorization: **NO for all 48**
- Business acceptance: unchanged; do not mark any requirement PASS from this candidate set.

Source inputs: [B01 proposed oracle scaffold](https://github.com/sbannai/enterprise-product-engineering/blob/main/eper/uat/B01_48_PROPOSED_ORACLE_SCAFFOLD.csv), [acceptance resolution matrix](https://github.com/sbannai/enterprise-product-engineering/blob/main/eper/uat/B01_48_ACCEPTANCE_CRITERIA_RESOLUTION_MATRIX.csv), [candidate HLD/LLD/DATA/API/EVENT crosswalk](https://github.com/sbannai/enterprise-product-engineering/blob/main/eper/uat/B01_48_CANDIDATE_HLD_LLD_DATA_API_EVENT_CROSSWALK.csv).
