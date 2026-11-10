# EPER Application Peripheral Management — Design Contract

**Status:** Implementation design draft  
**Base:** main `86005b0bf6fb8685e73117e46a26c63f257d4831`  
**Scope:** Customer-application-scoped peripheral registration, assignment, configuration, operation and health monitoring.  
**Baseline protection:** Additive candidate scope only. This does not alter the approved 228 requirements or 38 chapters. No cloud resources, device credentials, real hardware connections or external provider calls are authorized.

## 1. Product objective

Allow a Client Admin to configure peripherals required by a specific customer application, then let authorized users and workflow steps use those peripherals through a provider-neutral interface. EPER must not assume that a browser can directly access USB, serial, Bluetooth or LAN hardware.

## 2. Actors and permissions

- **Platform Admin:** manages the platform-wide peripheral type catalogue, adapter allowlist and security policy.
- **Client Admin:** registers a peripheral for a tenant application, configures it, assigns it to locations/workflow steps and manages its lifecycle.
- **Application Operator / User:** invokes only peripherals assigned to the application and permitted by their role.
- **Support Engineer:** views health and diagnostics within explicitly granted tenant scope; cannot read device secrets.
- **Device Gateway identity:** authenticates as a narrowly scoped machine principal for one tenant/application and registered device.

Every operation is authorized server-side against tenant, application, peripheral, assignment, principal and action. Client-supplied tenant/application identifiers are never trusted as authorization evidence.

## 3. Domain model

| Entity | Purpose | Key constraints |
|---|---|---|
| PeripheralType | Catalogue definition (scanner, QR/barcode reader, sensor, RFID/NFC, printer, custom) | Platform-managed; stable type key; supported capabilities and protocols |
| ApplicationPeripheral | Logical device registration for one tenant application | Tenant + application ownership; immutable ownership after creation |
| PeripheralInstance | Physical/logical endpoint identity | Unique within tenant/application; lifecycle and health state |
| PeripheralAssignment | Maps a peripheral to an application location, workflow or step | Cannot cross tenant/application boundaries |
| PeripheralConfigurationVersion | Versioned, validated configuration | Immutable version history; explicit activate/rollback |
| PeripheralCredentialReference | Reference to secret material | Secret values never returned in APIs, events, logs or audit payloads |
| PeripheralEvent | Idempotent device observations and command outcomes | Tenant/application/device scoped; schema/version and correlation IDs |
| PeripheralHealth | Last-seen, connectivity and diagnostic summary | No sensitive payloads; freshness window is policy-configured |

## 4. Supported connection patterns

1. **Browser-supported device APIs:** only where the browser and device explicitly support the required API and the user grants permission.
2. **Local Device Gateway / Agent:** preferred for USB, serial, Bluetooth and local-network hardware. The gateway initiates an authenticated outbound connection to EPER; EPER does not expose inbound ports to customer LANs.
3. **Network device adapter:** for explicitly approved devices reachable through a customer-managed gateway.
4. **Synthetic adapter:** mandatory first implementation for local development and CI; no physical hardware required.

The core domain and workflow engine must not contain manufacturer-specific SDKs or protocol logic.

## 5. Architecture

`Admin / User UI -> Peripheral API -> Authentication + RBAC + Tenant/Application Guard -> Registry + Assignment + Configuration -> Adapter Registry -> Synthetic Adapter (first) / Local Gateway Contract / Approved Network Adapter -> Device`

All state-changing operations emit audit evidence and, where appropriate, versioned domain events. Device events enter through an authenticated ingestion boundary, are schema-validated, deduplicated, authorized and correlated before they are made available to workflow execution.

## 6. API contract outline

- `POST /api/applications/{applicationId}/peripherals` — register a peripheral.
- `GET /api/applications/{applicationId}/peripherals` — list peripherals visible to the caller.
- `GET /api/applications/{applicationId}/peripherals/{peripheralId}` — read metadata and health summary.
- `PATCH /api/applications/{applicationId}/peripherals/{peripheralId}` — update descriptive metadata only.
- `POST /api/applications/{applicationId}/peripherals/{peripheralId}/configurations` — create a configuration version.
- `POST /api/applications/{applicationId}/peripherals/{peripheralId}/activate` — activate a validated configuration.
- `POST /api/applications/{applicationId}/peripherals/{peripheralId}/assignments` — assign to a location/workflow step.
- `DELETE /api/applications/{applicationId}/peripherals/{peripheralId}/assignments/{assignmentId}` — revoke assignment.
- `POST /internal/peripheral-gateway/events` — authenticated, idempotent event ingestion; machine identity required.

Exact route conventions and response envelopes must follow the existing API response contract before implementation.

## 7. Lifecycle

`DRAFT -> REGISTERED -> CONFIGURED -> ACTIVE -> DEGRADED / OFFLINE -> SUSPENDED -> RETIRED`

- Activation requires valid type, compatible adapter, configuration validation, tenant/application binding and authorization.
- Offline/degraded state does not silently trigger a workflow action.
- Retired devices cannot be assigned or invoked.
- Configuration rollback creates a new active-version pointer; it never rewrites prior versions.

## 8. Security and resilience requirements

- Enforce tenant and application isolation in service and PostgreSQL persistence (RLS where supported).
- Scope device machine identity to exactly one registered peripheral and application.
- Use short-lived, audience-bound credentials with rotation/revocation; never store raw secrets in peripheral configuration JSON.
- Require TLS for gateway communications and signed/verified event identity.
- Apply idempotency keys and replay protection to event ingestion and command submission.
- Validate payload size, schema, content type and supported command per peripheral type.
- Rate-limit commands/events per tenant and device; bound retries and dead-letter poison events.
- Propagate cancellation; enforce command deadlines; represent unknown physical outcomes explicitly rather than blindly retrying non-idempotent actions.
- Audit registration, configuration, activation, assignment, invocation, revocation, credential rotation and retirement.
- Do not log raw sensor payloads or credentials by default.

## 9. Initial implementation slice

1. Domain contracts and validation for catalogue, registration, configuration versions, assignments and lifecycle.
2. PostgreSQL migration with tenant/application ownership, foreign keys, uniqueness, indexes, audit linkage and RLS.
3. Repository/service layer using trusted context and existing authorization/audit abstractions.
4. API routes and contract tests.
5. Synthetic adapter plus deterministic device simulator; no network or hardware dependency.
6. Client Admin UI for registration/configuration/assignment and user-facing device selection/status.
7. Workflow integration through a typed peripheral capability contract; workflows reference a peripheral capability, not a vendor SDK.
8. Health/event ingestion and worker supervision after the core slice is proven.

## 10. Acceptance tests

- Cross-tenant and cross-application read/write/assignment attempts are denied.
- A user without the required action permission cannot invoke or reconfigure a device.
- A gateway identity for device A cannot submit events for device B.
- Duplicate event IDs are idempotent; replay with different payload is rejected.
- Invalid schema, unsupported command, oversized payload and stale credentials fail closed.
- Configuration version history is immutable; rollback is auditable.
- Offline/degraded devices do not cause silent workflow completion or unbounded retry.
- Timeout after a physical command with unknown outcome is surfaced as `NEEDS_ATTENTION` unless the command is explicitly idempotent.
- Retired or suspended devices cannot be invoked.
- Synthetic adapter tests run without network, cloud resources or physical hardware.
- Audit records contain actor, tenant, application, device, action, result, timestamp and correlation ID without secret material.

## 11. Explicit non-goals for the first slice

- No AWS IoT Core, paid IoT broker, cloud gateway or other chargeable cloud provisioning.
- No live hardware pairing or production device credentials.
- No arbitrary executable plugins or user-supplied adapter code.
- No direct browser access to customer LANs or device secrets.
- No assumption that every scanner, sensor or reader supports the same commands.
- No change to the approved requirement baseline or UAT authorization.

## 12. Definition of done

The capability is not complete at documentation or API-contract level alone. Completion requires the domain model, migration/RLS, service and API, synthetic adapter, admin/user UI, workflow integration, audit evidence, exact-head CI, PostgreSQL integration tests, tenant-isolation tests and a verified merge to main. Production readiness and Business UAT remain separate gates.