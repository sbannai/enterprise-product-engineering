# EPER Contract Boundary

The contract layer is the governed interface between the 228-requirement registry and the six shared capability services.

The requirement registry binds each requirement to one DATA, API and EVENT identifier. `contracts/index.ts` provides reusable v1 **descriptors** and validates identifier consistency. A descriptor is not a field-level schema or a complete executable interface specification.

Contract families:
- DATA — authoritative input/output contract identifier.
- API — capability invocation/interface identifier.
- EVENT — lifecycle/audit event identifier.

There are six shared capability contract sets, not 228 duplicated implementations.

## Approval and evidence boundary

The descriptor identifiers are named to align with the EM-DATA-001, EM-API-001 and EM-EVT-001 contract families. That naming alignment alone does **not** establish that a specific schema, operation, event payload, version, requirement-level HLD/LLD binding, or approval is present in this repository.

The implementation currently checks that registry identifiers match the six descriptor sets. It does not, by that check alone, validate field-level DATA schemas, OpenAPI request/response/error definitions, EVENT payload schemas, compatibility guarantees, source locators, or approval metadata.

For Chapter 463, the located procurement catalogue candidates in the project Library are marked Draft. The controlled Chapter 463 intake document records them as candidates only. Do not promote a candidate to an approved contract, infer an approved N/A disposition, or declare SRC-003/G3 passed without exact source and approval evidence.

## Required contract promotion evidence

For every contract promoted from candidate to approved, record:
1. Stable contract ID and semantic name, schema/operation/event version.
2. Exact controlled source artifact, version, and stable section/schema/operation/event locator.
3. Requirement/SRS/traceability binding and exact HLD-to-LLD relationship.
4. Contract owner, approving authority, approval/change reference, and effective date.
5. Contract tests and compatibility evidence; approved N/A decisions where applicable.

Keep missing information marked OPEN or NOT EVIDENCED. CI success validates only the checks actually executed; it is not business approval or UAT acceptance.

## Execution path

228 requirements → registry → capability router → capability service → descriptor/contract validation → execution result.
