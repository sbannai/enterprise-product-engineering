# EPER Application Peripheral Management — Design Contract

**Status:** Implementation design draft  
**Base:** main `86005b0bf6fb8685e73117e46a26c63f257d4831`  
**Scope:** Customer-application-scoped peripheral registration, assignment, configuration, operation and health monitoring.  
**Baseline protection:** Additive candidate scope only. This does not alter the approved 228 requirements or 38 chapters. No cloud resources, device credentials, real hardware connections or external provider calls are authorized.

## 1C. Adjacent application capability: Remote Desktop Sharing

Remote Desktop Sharing is a separate, optional capability under **Customer → Application**. It is not part of Peripheral Management and is not the same as Zoom/Google Meet/video-conferencing integration.

**Purpose:** allow an authorized support person, application administrator or approved operator to request a remote view of a user's/application endpoint screen for troubleshooting or guided assistance. If remote control is later enabled, it must be a separately authorized permission from screen viewing.

**Capability boundaries**
- Remote Desktop Sharing owns remote-assistance sessions, endpoint pairing, consent, session authorization, signalling/relay abstraction, session lifecycle, audit and evidence.
- Video conferencing owns meetings, participant audio/video, meeting links and collaboration-provider integration (for example Zoom or Google Meet).
- Peripheral Management owns physical/logical device registrations and their device I/O. It must not own desktop sessions.
- These capabilities may expose separate UI entry points in the same application workspace and may optionally link to one another, but neither requires the other to be installed or configured.
- A video meeting must not silently grant desktop viewing or control. Starting a remote desktop session must not create or join a Zoom/Meet call.

**Consent and security baseline**
- A remote session is off by default and begins only after an authenticated user explicitly requests it and the endpoint user explicitly accepts the session.
- Screen viewing and remote input/control are separate scopes. Default to view-only; control requires a separate explicit grant and visible in-session indication.
- No unattended access, persistent hidden agent, silent capture, stealth mode or bypass of operating-system permission prompts in the initial scope.
- Use short-lived, single-session, audience-bound credentials; bind each session to tenant, application, requester, endpoint and consent grant. Revalidate authorization on session start and on privilege escalation.
- Encrypt signalling and media/data transport in transit; use an approved WebRTC or equivalent transport abstraction with a relay interface. Do not expose arbitrary inbound ports on customer networks.
- Provide visible session indicators and immediate user-controlled stop/revoke. Session termination, consent withdrawal, token expiry, endpoint disconnect or authorization revocation must close the session and invalidate credentials.
- Audit request, approval/denial, start, view/control scope changes, stop, disconnect, revoke and outcome. Do not record screen contents by default; any recording requires a distinct explicit policy and consent flow.
- Enforce tenant/application/endpoint isolation, rate limits, bounded session duration and safe reconnect behaviour. Never allow session identifiers or endpoint tokens to be reused across applications.

**Initial delivery boundary**
- Define a provider-neutral Remote Assistance port and session state machine, with a local/synthetic test adapter.
- Implement request/accept/deny/start/stop/revoke flows, view-only mode, authorization, consent and audit first.
- Treat remote input/control, recording, file transfer, clipboard sharing, unattended access and production relay infrastructure as separate gated capabilities requiring explicit product/security approval.
- Keep this capability independently deployable and optional. Core application startup, workflows, Peripheral Management and video conferencing must continue to work when it is absent or unconfigured.

## 1B. Optional, configuration-gated modular integration

Peripheral Management is an optional capability. The core Customer Application and workflow runtime must remain fully functional when the capability is absent, disabled, or has no configured peripherals.

**Connection rule: no explicit configuration, no peripheral connection.**

- Merely creating an application, enabling its navigation entry, deploying EPER, or loading the peripheral package must not discover, connect to, poll, authenticate with, or send commands to any physical device.
- A peripheral becomes eligible for connection only after an authorized Client Admin explicitly registers it under the selected application, supplies validated connection/adapter configuration, and activates it.
- Registration/configuration and activation are distinct states. A draft or incomplete configuration must not open a connection. Activation is the explicit transition that allows the selected adapter to establish its connection.
- Only the configured adapter for that registered peripheral may connect. It receives a narrowly scoped tenant/application/peripheral context and only the secret references and capabilities it needs.
- Connection attempts are lifecycle-managed, bounded, observable and cancellable. Disable, suspend, retire, revoke or remove must stop new commands and close the associated connection/session; failures must not affect unrelated peripherals or the parent application.
- The application/workflow layer consumes a stable, typed peripheral capability port. It must not import vendor SDKs, transport implementations, gateway internals or optional package implementation details.
- The peripheral capability is resolved only for an authorized application operation that requires a configured and active assignment. Missing, inactive or unavailable peripherals return a typed unavailable/needs-attention result; they must not silently fall back to another application's device or claim success.
- Synthetic adapters follow the same configuration and activation lifecycle in development/CI. Tests must prove no connection side effects before activation and prove disable/revoke tears down the adapter session.
- Package boundaries must permit the peripheral capability and its adapters to be omitted from a deployment without breaking core application startup, application navigation, workflow execution or unrelated modules.

This is lazy, explicit, application-scoped integration—not an always-on device discovery service and not a mandatory dependency of every customer application.

## 1A. Product hierarchy and placement

This capability is a **child submodule of Customer → Application**. It is not a standalone top-level customer module and must not appear as a peer to Customer or Application in the primary navigation.

Canonical hierarchy:

`Customer -> Application -> Peripheral Management`

The Client Admin first selects a customer and then a specific application. Peripheral Management is available within that application's workspace alongside other application capabilities (for example workflow, actors/assignments, customer assets, payments/receipts and application KPIs). The selected application context is carried through the UI and API request lifecycle and is re-authorized server-side on every operation.

The submodule's navigation, list, create/edit screens, configuration, assignments, health view and event history are all scoped to the selected application. The UI must clearly display the active customer/application context and must not provide an unscoped cross-application device editor. Platform-level peripheral type catalogue and adapter allowlisting remain platform-admin configuration concerns; actual peripheral registrations and operational configuration live under the customer application.

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

## 3A. Application-specific peripheral sets

Peripheral configuration is an independent collection owned by each customer application. There is no mandatory global bundle and no assumption that two applications belonging to the same tenant need the same devices.

- Each application may have zero, one or many registered peripherals.
- Each application's set is independently selected and managed according to that application's operational requirements.
- A peripheral registration, configuration, assignment, health record and event is always bound to one tenant and one application.
- Sharing a physical device across applications is not implicit. If a customer later requires shared hardware, it must be represented by an explicit, authorized sharing/assignment model with separate access checks and audit evidence.
- Adding, removing, replacing, suspending or reconfiguring a peripheral in one application must not change another application's peripheral set.
- The admin UI must show the selected application context clearly and must never apply a configuration change to all applications by default.
- Templates may recommend device types, but applying a template is an explicit customer action that creates application-owned registrations; templates do not create hidden shared device instances.

Acceptance examples: a warehouse application can register barcode scanners and weighing scales while the same tenant's HR application registers ID scanners only; changing the warehouse set must leave the HR set and its permissions untouched.

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