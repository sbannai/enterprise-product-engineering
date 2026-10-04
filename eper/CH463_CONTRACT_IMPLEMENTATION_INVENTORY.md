# Chapter 463 Contract Implementation Inventory

**Reviewed:** 2026-10-04  
**Source branch:** `main`  
**Source files:** `eper/contracts/index.ts`, `eper/packages/capabilities/services.ts`, and the six capability modules.  
**Disposition:** IMPLEMENTATION-DERIVED INVENTORY — NOT AN APPROVED API/DATA/EVENT SPECIFICATION.

## Confirmed contract registry behavior

The contract registry exposes one `DATA`, one `API`, and one `EVENT` identifier per capability, all labelled `v1`. `validateRequirementContracts` verifies that the requirement registry's three IDs match those registry entries. This is identifier consistency validation; it does not validate JSON Schema, OpenAPI operations, event payload schemas, compatibility, persistence, or approval metadata.

## Chapter 463 capability details

| Requirement | Data/interface types observed in code | Implemented operations / behavior | Material limitation |
|---|---|---|---|
| REQ-46301 / SRS-FR-2323 | `AuthoritativeRecord { id, tenantId, version, state, data }`; `CapabilityInput.context { tenantId, principalId, correlationId }` | create, get, update with expectedVersion, delete with expectedVersion; tenant-scoped keys; version increments | Store is in-memory; lifecycle state is an unrestricted string; no lifecycle event publication in this service; no persistence/schema migration evidence |
| REQ-46302 / SRS-FR-2324 | `AuthorizationRequest { tenantId, principalId, action, resource }`; policy has optional principal, actions, resources, effect | Explicit deny wins; matching allow otherwise; default deny | In-memory policy list; no approved role mapping, policy administration endpoint, or authorization event publisher demonstrated |
| REQ-46303 / SRS-FR-2325 | `ValidationRule { id, evaluate }`; issue has code, message, severity; result has valid, issues | Register unique rules; execute all registered rules; valid false when any ERROR issue exists | Rules are registered in process; no authoritative business rule catalogue, rule versioning, or validation-outcome event publisher demonstrated |
| REQ-46304 / SRS-FR-2326 | `AuditEvidence { id, tenantId, requirementId, action, principalId, correlationId, occurredAt, payload, integrityHash }` | append, get, listByRequirement, SHA-256 integrity verification | In-memory storage; hash detects content changes but is not by itself tamper-proof storage, trusted timestamping, key management, or retention enforcement |
| REQ-46305 / SRS-FR-2327 | `WorkflowException { id, tenantId, requirementId, code, message, state, retryCount, idempotencyKey, owner?, createdAt, updatedAt }` | create with tenant-scoped idempotency; states OPEN/RETRYING/RESOLVED/ESCALATED; transition validation; lifecycle audit evidence | In-memory storage; no actual retry scheduler/backoff, delivery integration, or escalation notification shown; retryCount increments on each RETRYING transition |
| REQ-46306 / SRS-FR-2328 | `ReportRow { tenantId, reportId, values, sourceRequirementIds, generatedAt }`; query includes tenant, report, filters, limit | publish; tenant/report-scoped query; exact-value filters; limit defaults to 100 | In-memory storage; no report catalogue/metric definitions, freshness enforcement, aggregation engine, or report-refresh event publisher demonstrated |

## Cross-cutting context and operation observations

- `prepare` verifies pattern/capability identity and registry ID matching.
- If a context is supplied, all three fields (tenantId, principalId, correlationId) are required. Operations that call `requireTenantContext` require tenant context even if the top-level context is absent.
- `CapabilityResult.status` is the generic string `EXECUTED`; business success/failure is not represented by a complete typed result envelope at this layer.
- Data/API/Event contract IDs are descriptors only. The inspected registry contains no field-level schema or endpoint/event definitions.
- Service stores are created as private in-memory members; durable state across process restart is not provided by these modules.
- The only direct event-like behavior found in the reviewed Chapter 463 service layer is exception lifecycle evidence written to the in-memory audit evidence store. No general event bus or published event schema is demonstrated for the other five capability IDs.

## Required design decisions (owner-approved, not inferred)

1. Define the authoritative persisted data schemas, constraints, lifecycle enums, ownership, retention and migration policy.
2. Publish concrete API contracts: operation names, request/response schemas, auth requirements, status/error semantics, idempotency and version compatibility.
3. For each event ID, either define event name, schema, producer, trigger, delivery/replay guarantees and versioning, or record an approved N/A with rationale.
4. Decide whether in-memory stores are test-only or acceptable for a specific deployment tier; identify the approved persistence implementation and durability/recovery expectations.
5. Approve the business rules and acceptance oracles for role/tenant access, lifecycle transitions, validation, audit retention, retry/escalation and reporting metrics.
6. Link these specifications to approved, versioned HLD/LLD sections and record the design authority and approval reference.

**Control conclusion:** This inventory recovers code-level data shapes and actual operations to make the design gap concrete. It does not close SRC-003/G3, establish production readiness, or authorize UAT.
