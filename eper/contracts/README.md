# EPER Contract Boundary

The contract layer is the governed interface between the 228-requirement registry and the six shared capability services.

The registry already binds every requirement to one DATA, API and EVENT contract identifier. `contracts/index.ts` provides the reusable v1 contract descriptors and validates those bindings.

Contract families:
- DATA — authoritative input/output contract identifier.
- API — capability invocation/interface identifier.
- EVENT — lifecycle/audit event identifier.

There are six shared capability contract sets, not 228 duplicated implementations.

The identifiers remain aligned with the controlled EM-DATA-001, EM-API-001 and EM-EVT-001 baselines; this implementation does not invent external contracts.

Execution path:

228 requirements → registry → capability router → capability service → contract validation → execution result.
