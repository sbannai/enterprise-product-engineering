# Application Data Management

## Purpose

Provide one platform-owned data service for customer-defined business entities. A workflow is the process definition; application data records are the durable business facts created and changed while that workflow runs. E-commerce entities such as Product, Customer, Order, OrderItem, Shipment and Return are examples, not hard-coded platform modules.

## Boundaries

- Every model and record is scoped by tenant, application and entity type.
- Models are versioned and define an allow-listed field set, types, required/null rules, length limits, enumerations and relationship declarations.
- Records carry both schema version and optimistic concurrency version.
- Workflow activities bind to a registered entity type and operation. Workflow JSON cannot select a database, collection, table, SQL fragment or arbitrary storage adapter.
- Workflow data operations require an explicit authorization callback. API and product-admin entry points must apply the same tenant/application and role policy before calling the service.
- Payment, inventory reservation and other financially sensitive state changes remain behind their dedicated governed domain services. Generic record CRUD must not become a way to bypass those invariants.
- PostgreSQL writes place the record mutation, integrity-hashed audit evidence, outbox event and optional create-idempotency response in one transaction.
- A caller-supplied idempotency key is scoped to tenant and application. Replaying the same create request returns the original result; reusing the key for a different semantic request is rejected. Generated timestamps, tracing metadata and the currently active schema version do not change the request fingerprint. The service checks for a prior create result before validating against the current schema, so a retry after schema activation still returns the original committed record; reuse with different caller data is rejected.
- PostgreSQL relationship writes lock referenced target rows in the same transaction. Target deletion takes a conflicting row lock and checks active/retired model relationships before removal, preventing a concurrent create/delete race for declared relationships. MongoDB uses transactional guard writes on target documents and scans declared references before deletion; conflicting create/delete transactions therefore fail or retry rather than silently orphaning a reference. The local JSON adapter checks references before deletion but remains single-process/local-only and is not safe against concurrent processes.
- MongoDB writes use a session transaction and persist audit/outbox evidence in the same transaction; create-idempotency responses are stored in that same session transaction. MongoDB must run on a replica set or sharded cluster with transaction support; otherwise the adapter fails closed.
- JSON-file storage is for local development, fixtures and import/export only. It is not safe for multiple processes, distributed workers or production customer transactions.

## Adapter contract

The async ApplicationDataAdapter contract is the storage boundary. Implementations must preserve tenant/application/entity scoping, schema metadata, version checks, not-found versus version-conflict errors, and atomic governed writes where the backend supports transactions.

PostgreSQL is the first governed relational adapter. MongoDB is an optional document adapter and does not add a mandatory runtime dependency: it accepts the official driver's structural database/session interfaces. The application chooses one adapter for a data domain; the framework does not silently dual-write a single transaction across engines.

## Schema evolution

A model version is immutable in intent. Register a new version when a field or relationship contract changes; records retain the schema version they were written against. This initial slice does not automatically rewrite old records or infer destructive migrations. A production schema-change workflow must provide compatibility analysis, explicit migration plans, resumability and recovery before destructive transformations are enabled.

## Requirement baseline

This is a shared platform capability extension to authoritative records, validation, authorization, audit, workflow execution and outbox delivery. The current 228-row / 38-chapter baseline contains reusable generic capability patterns, but it does not define customer-configurable entity schemas, application-scoped business records or adapter-level transaction guarantees in sufficient detail. This implementation must therefore be treated as a proposed baseline extension/change for owner review, not as proof that the existing 228 requirements already fully specify it. Existing approved requirements remain unchanged.

## Current implementation limitations to close before production adoption

1. The workflow activity is a reusable service boundary; it still needs to be wired into the published workflow capability catalogue and runtime executor.
2. A governed model-authoring API/UI and a policy-backed model-registration permission are not yet included.
3. PostgreSQL and MongoDB enforce declared relationship targets and restrict deletion while referenced using adapter-specific transaction guards. The local JSON adapter checks references but cannot guarantee concurrency safety. Cross-entity cascade semantics are not implemented.
4. Automatic schema migration, idempotency for update/delete operations, soft-delete retention policy, backup/restore procedures and adapter conformance tests against live PostgreSQL/MongoDB instances remain follow-up gates.
5. The JSON adapter is intentionally not a concurrency-safe production backend.
6. This PR must not claim production readiness until build, unit tests, migration tests, tenant/application isolation tests, adapter conformance and end-to-end workflow tests pass in the repository CI environment.