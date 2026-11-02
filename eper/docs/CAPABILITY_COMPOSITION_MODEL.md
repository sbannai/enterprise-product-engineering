# EPER Capability Composition Model

**Status:** Engineering design proposal  
**Parent direction:** #352  
**Capability contract:** #353  
**Reference capability types:** #354  
**Workflow lifecycle and publication:** #351  
**Customer authoring implementation:** PR #350  
**Baseline guardrail:** Preserve the approved 228 requirements across 38 chapters. Any additive requirements remain draft until owner disposition.

## 1. Product principle

EPER is a capability fabric: customers assemble business outcomes from reusable, governed building blocks. The platform carries the technical complexity; the Customer Admin sees business concepts, guided choices, clear validation and a preview.

**Design rule: flexibility underneath, simplicity on the surface.** Do not expose programming-language generics, raw JSON schemas, arbitrary code, SQL, or internal service wiring as the normal authoring experience.

## 2. Four concepts that must remain distinct

| Concept | Meaning | Ownership |
|---|---|---|
| Capability type | Platform-maintained contract describing what a block can do | Product Admin / platform engineering |
| Template | Curated, compatible arrangement of capability types and starter settings | Platform catalogue; may be curated with governed customer contributions later |
| Application composition | Customer's editable arrangement and configuration inside one tenant/application | Customer Admin |
| Published composition | Validated immutable snapshot consumed by runtime | Created by authorized publication; immutable thereafter |

Instantiating a template copies its starting configuration into the target application. It does not create a live reference to shared mutable template state. Template upgrades are proposed as explicit diffs; they never overwrite customer changes silently.

## 3. Composition graph

A composition is a directed graph of typed capability instances.

- **Node:** one configured instance of an Activity, Rule, Integration or Reporting capability.
- **Port:** a named, typed input or output declared by the capability descriptor.
- **Data edge:** maps one output port to a compatible input port.
- **Control edge:** defines the next permitted workflow transition or rule outcome.
- **Event edge:** subscribes a capability to a declared event, with an explicit delivery and idempotency policy.
- **Dependency:** a capability-level prerequisite that must be satisfied before the node can be configured or published.

Every node has a stable instance ID within the draft, a capability type ID, a pinned descriptor contract version, a customer-facing label, and application-scoped configuration. Edges refer to node and port IDs, not display labels.

### 3.1 Typed connections

Connections are valid only when the source output and target input are compatible under the capability contract.

- Exact type match is accepted.
- Safe, explicitly declared widening/coercion may be offered with a plain-language explanation.
- Lossy conversion, unknown types, missing ports and undeclared implicit conversions are rejected.
- Required inputs must be connected or supplied by an allowed default/context value.
- Sensitive values carry classification metadata; a connection cannot lower classification or bypass authorization.
- The editor displays a business-readable mapping summary, e.g. “Approved amount → Payment amount”, not an internal generic type signature.

No automatic conversion should be guessed from field names.

### 3.2 Control flow

Activity nodes expose declared outcomes (for example Approved, Rejected, Completed, Failed). Rule nodes expose named outcomes (for example Yes/No or matched route IDs). Control edges may connect only from an outcome declared by the source node to a compatible next step.

- A Rule is a deterministic decision, not an executable script.
- Rule conditions use the bounded expression vocabulary already defined by the rule-engine contract.
- Rule priority and tie-breaking must be explicit; ambiguous matches fail closed.
- Every non-terminal Activity must have a defined continuation or an explicit wait/exception policy.
- Terminal outcomes are explicit and visible in the designer.
- A path must not silently fall through because a condition is missing or a value is null.

### 3.3 Events and asynchronous work

Event edges are separate from synchronous control transitions. Each event subscription declares event type, payload contract, authorized scope, delivery semantics, idempotency key strategy, retry policy and terminal failure handling. A successful enqueue is not described as successful external delivery. Runtime delivery remains behind the approved dispatcher and audit/outbox boundary.

### 3.4 Cycles and loops

The first composition release should reject cycles by default. This keeps the visual model understandable and prevents accidental infinite execution.

A later governed loop capability may introduce bounded repetition with:
- an explicit loop boundary and exit condition;
- a maximum iteration count and timeout;
- a visible retry/re-entry path;
- audit and observability for each iteration;
- validation that the loop cannot bypass authorization or terminal failure handling.

Do not infer loops from a back-edge in the canvas.

## 4. Reference capability behavior in the graph

| Type | Typical inputs | Outputs / outcomes | Graph role |
|---|---|---|---|
| Activity | Business data, actor/role, due-date policy | Completion data, approved/rejected/completed/failed outcome | Human or system work |
| Rule | Typed business values and declared context | Named boolean/decision outcomes | Branching and deterministic validation |
| Integration | Authorized input mapping, provider configuration reference | Accepted/rejected result, event or delivery status | Governed side effect or event exchange |
| Reporting | Authorized query/metric definition and time/window parameters | Read-only metric/result | Observation; must not mutate workflow state |

Reporting is read-oriented and must not become an indirect write path. An Integration may perform an external side effect only through the governed execution boundary and required human approval policy.

### 4.1 Activity actions: alerts and video conferencing

An Activity is a work step, but it may also carry one or more configured actions. Customer Admins should discover these actions inside the Activity designer using an **Add action** experience; they should not have to build a separate low-level integration graph for routine needs. Internally, each action resolves to a typed, versioned Integration capability and executes through the shared authorization, outbox, idempotency, retry and audit boundary.

Initial action catalogue examples:

| Activity action | Trigger points | Customer-facing configuration | Outputs / behavior |
|---|---|---|---|
| Send alert / notification | Activity created or assigned; due soon; overdue; approved/rejected/completed; escalation | Channel (in-app, email, SMS or WhatsApp where configured), recipients or role, message template, language and timing | Delivery/acceptance status, provider reference and failure outcome; never expose provider credentials |
| Schedule video conference | Activity created, assigned or explicitly scheduled; optionally on an approval/review step | Connected provider (e.g. Google Meet or Zoom), title, start/end or duration, participants/roles, timezone and reminder policy | Meeting URL, provider meeting ID, scheduled time and creation status, available to authorized downstream steps |
| Send meeting reminder | Before meeting start; reschedule or cancellation | Recipients, lead time and message template | Delivery status and reminder audit |

Design and runtime rules:

- Activity actions are optional, reusable and independently configurable; an Activity with no actions remains a valid human or system task.
- Triggers are explicit lifecycle events, not hidden timer polling. Time-based triggers must use the platform scheduler and durable due-work records.
- The designer shows action setup in business language and only offers providers/channels configured and enabled for that customer/application.
- Participant and recipient resolution uses authorized application actors/roles and explicit business data mappings. Cross-application identities or contacts are never implicitly included.
- Provider credentials and connection secrets are stored in governed integration configuration, never in workflow JSON, browser state, logs or published snapshots.
- External side effects are idempotent, retry-bounded and auditable. A queued request is not reported as a delivered alert or successfully created meeting until provider outcome is known.
- Provider failure follows an explicit action outcome (retrying, failed or needs attention) and configured workflow exception/escalation path; it must not silently mark the Activity complete.
- Meeting URLs and participant details are sensitive outputs. Only authorized actors in the same tenant/application may view them.
- The Activity designer may expose approval-before-send as a policy option where the action or customer governance requires it; the policy is enforced by the server, not just the UI.

This gives customers a simple experience—“notify these people” or “schedule a review meeting”—while keeping provider-specific behavior behind reusable Integration capability contracts.

### 4.2 Provider catalogue and connection configuration

These actions depend on real provider services. EPER must therefore include a first-class **Provider Configuration** area; a workflow action is publishable only when it references a valid, enabled connection with the required capabilities.

**Provider catalogue (Product Admin / platform governance)**

Product Admin governs the supported provider catalogue and its lifecycle:
- Register provider adapters and supported capabilities (send email, send SMS, WhatsApp message/template, in-app/push notification, create/update/cancel meeting).
- Define provider-specific configuration fields, authentication method, supported regions, rate/size limits, webhook requirements and contract/adapter version.
- Configure platform-managed credentials or secret references, global safety policies, approved environments and provider health/availability.
- Enable, suspend or deprecate a provider/capability, with impact visibility for affected customer connections and workflows.
- Define whether the provider is available through platform-managed service, customer-managed credentials, or both.

Product Admin controls the catalogue and platform service, not customer recipient lists, application templates or meeting participants.

**Customer connections and application settings (Customer Admin)**

Customer Admin manages connections available to their tenant/application:
- Select only providers/capabilities enabled in the catalogue and entitled for the tenant.
- Choose an allowed connection mode: platform-managed service under the applicable commercial plan, or customer-managed credentials where supported.
- Create/authorize the connection, select permitted sender identity/phone number/email domain/calendar account, and map it to one or more explicitly selected applications.
- Configure application-specific sender defaults, templates, locale, timezone, consent/suppression rules, quiet hours, participant policies, reminders and delivery preferences.
- Run a sandbox connection test, view masked connection health and last validation time, rotate/revoke credentials and inspect usage/failure history.
- Keep tenant-wide reusable connections separate from application-specific policy. Sharing a connection across applications is explicit; templates, audiences, event subscriptions, audit and delivery history remain application-scoped.

**Initial provider families**

| Capability family | Example provider integrations | Required connection/configuration |
|---|---|---|
| Email | Approved email delivery service or customer SMTP relay | Verified sender/domain, authentication secret reference, reply-to, templates, suppression/unsubscribe and delivery webhooks |
| SMS | Approved regional SMS gateway | Sender ID/number, account credentials, destination-country coverage, consent, rate/segment limits and delivery receipts |
| WhatsApp | WhatsApp Business solution provider | Business/account authorization, approved message templates, sender identity, opt-in and template/category rules |
| In-app / push | EPER Notification Center and Firebase Cloud Messaging | Application event subscriptions, Firebase project topology, credential reference, device registration and notification preferences |
| Video conferencing | Google Meet and Zoom | OAuth/service authorization, calendar/meeting permissions, organizer identity, allowed meeting settings and participant scope |

The catalogue is extensible; examples do not imply that every provider adapter is already implemented or enabled.

**Connection lifecycle and security**

- Connection states are NOT_CONFIGURED, PENDING_VALIDATION, ACTIVE, DEGRADED, SUSPENDED and REVOKED; transitions are audited.
- Credentials are write-only secret references held in the approved secret store. They must never appear in workflow drafts, published snapshots, browser storage, API read responses, logs or audit payloads.
- OAuth tokens require encrypted storage, least-privilege scopes, refresh/revocation handling and explicit reconnect behavior. API keys/passwords require rotation and revocation controls.
- Test actions are sandbox-only by default. A successful connection test proves authentication/connectivity, not delivery to every recipient or production readiness.
- Provider webhooks must be authenticated, replay-protected, tenant/application-correlated and idempotently processed.
- A provider becoming unavailable or revoked blocks new publication when required by policy; already-running executions follow their pinned failure/compensation policy and must not silently switch provider or credentials.
- Provider usage, quotas and tariff entitlements are checked server-side before dispatch. Exceeding an allowed limit blocks or queues according to explicit policy; it cannot be bypassed by changing workflow configuration.
- External communications enforce consent, unsubscribe/suppression, applicable regional rules and data minimization. Meeting links, calendar details, phone numbers and email addresses are protected data.

**Workflow binding**

A workflow action stores only a stable provider-connection reference, capability identifier/version, business configuration and policy reference. At execution, the server resolves the connection within trusted tenant/application scope, checks current status and entitlement, then dispatches through the provider adapter. Published workflow versions pin the required capability contract and policy identity, not raw credentials. Connection rotation can therefore occur without editing every workflow, while revocation and compatibility changes remain visible and governed.

**Canonical provider configuration resources**

Keep the following resources separate; do not overload the existing generic tenant admin-configuration JSON row with application-level credentials or delivery state:

| Resource | Scope and owner | Purpose |
|---|---|---|
| ProviderDefinition | Platform catalogue; Product Admin | Provider identity, adapter contract/version, supported capabilities, auth modes, configuration descriptor and lifecycle |
| ProviderCapability | Platform catalogue; Product Admin | Specific operations such as email.send, sms.send, whatsapp.send, push.send, meeting.create, meeting.update and meeting.cancel |
| ProviderConnection | Tenant-owned; Customer Admin or authorized platform operations | Connection identity, provider, auth mode, secret reference, lifecycle state, environment and safe health metadata |
| ProviderConnectionApplicationBinding | Tenant + application | Explicitly grants an application use of a tenant connection and records its permitted capability set |
| ApplicationProviderPolicy | Tenant + application | Sender/calendar identity, templates, consent/suppression, quiet hours, limits, approved audiences and action policy |
| ProviderOperation | Tenant + application + execution | Idempotency key, action/correlation reference, provider request reference, attempt count, outcome and timestamps |
| ProviderWebhookReceipt | Provider + tenant/application correlation | Authenticated, replay-protected provider callback receipt and normalized delivery/meeting status |
| ProviderAuditEvent | Tenant + application or platform scope | Configuration, authorization, rotation, test, suspension, revocation and operational audit evidence |

Connection secrets are references into an approved secret-management abstraction, never values in these rows. The abstraction must support create/read-by-reference/rotate/revoke with access policy and redaction; the concrete secret backend is deployment configuration and must not be hard-coded into provider adapters.

**Scope and lifecycle rules**

- A tenant may own a reusable connection and explicitly bind it to selected applications. An application may also own a dedicated connection. A tenant-wide connection does not automatically grant every application access.
- A connection is usable only if its provider definition and requested capability are active, the connection state is ACTIVE, the application binding grants that capability, the caller/runtime identity is authorized, and commercial entitlement/usage policy permits the operation.
- The connection's secret reference is resolved only by the server-side adapter at dispatch time. Customer Admin read APIs return connection metadata and masked identity, never a secret or token.
- Rotation updates the secret reference under optimistic concurrency, audits the change and preserves the stable connection ID. Existing workflow snapshots continue to refer to that connection ID; no workflow edit is required.
- Suspension/revocation immediately prevents new dispatches. In-flight operations follow an explicit policy: safely retry only if idempotency permits; otherwise move to a visible needs-attention/terminal state. Never silently fall back to another provider.
- Provider deletion is a deprecation/tombstone operation while referenced by connections, published workflows or retained operations. Hard deletion is prohibited until references and retention obligations are resolved.
- Provider callbacks must map to a known operation and tenant/application binding; unknown, duplicate, stale or invalidly signed callbacks are rejected or quarantined without mutating workflow state.
- Audit events record actor, scope, connection ID, before/after safe metadata digests, correlation ID and outcome. They must not contain credentials, message bodies, full meeting links or unnecessary personal data.

**API and persistence boundary**

Proposed business-oriented API surface:
- Product Admin: manage provider definitions/capabilities, activate/suspend/deprecate catalogue entries and inspect aggregate health.
- Customer Admin: list available providers; create/authorize a connection; test it in sandbox; list/read masked connection metadata; bind/unbind it to an application; configure application policy; rotate/revoke; inspect authorized usage and failures.
- Runtime service: resolve a connection for a specific tenant/application/capability; create an idempotent operation; dispatch; accept authenticated provider callbacks; expose normalized operation status to authorized workflow execution.

Persistence must enforce tenant/application scope in service authorization and PostgreSQL constraints/policies, not just UI filters. Use unique stable IDs, foreign keys, explicit environment, optimistic versions and indexes for tenant/application/provider/state and operation idempotency. Credential access is a separate least-privilege boundary from ordinary configuration reads. Configuration mutation and its audit event commit atomically. Provider operations and outbox records use durable transaction boundaries; webhook processing is idempotent.

Do not add these tables to the existing generic admin configuration resource without a migration and explicit scope redesign: that store currently keys configuration by tenant and resource type, while provider bindings, policies and operations require application scope and distinct retention/security controls.

**Configuration experience**

- Product Admin → Integrations Catalogue: provider adapters, capabilities, platform credentials/secret references, availability, versions and global limits.
- Customer Admin → Application Settings → Integrations: available connections, authorization, sender/calendar identity, test connection, health, rotation and revocation.
- Customer Admin → Application Settings → Alerts & Notifications: event subscriptions, audiences, templates, consent and delivery history (aligned with the existing Tenant Notification Center specification).
- Customer Admin → Workflow Designer → Activity → Add action: select an enabled connection and configure only the action-specific fields.

Do not duplicate the existing Notification Center as a second notification store. Extend its provider-neutral configuration, delivery and audit contracts for email/SMS/WhatsApp adapters and bind workflow events to those same services.

## 5. Customer Admin authoring journey

1. **Start with intent:** choose a business outcome or a template (e.g. “employee leave approval”).
2. **Add building blocks:** search a catalogue using business labels and short descriptions; show only compatible blocks for the current context.
3. **Configure:** use guided forms with defaults, examples and inline validation. Advanced settings are progressively disclosed.
4. **Connect:** drag a visible output to a compatible input or select a suggested mapping. Explain why incompatible connections are unavailable.
5. **Review:** show a readable end-to-end path, branch labels, required roles, integrations, data mappings and exception paths.
6. **Validate:** present blocking errors separately from warnings, each with a location and corrective action.
7. **Publish:** only an authorized Customer Admin can publish for the current application after all blocking validation passes and the immutable snapshot is created atomically.
8. **Observe:** show execution state and authorized reporting without exposing other applications' data.

The designer is an alternative way to modify the same application-scoped workflow definition, not a second configuration store. Rule Engine and visual designer changes must save to the same draft lifecycle.

## 6. Validation pipeline

Validation runs at save for fast feedback and again authoritatively at publish. Publish validation is deterministic and uses the exact draft revision submitted.

1. **Identity and scope:** authenticated Customer Admin; tenant, application and workflow definition resolved from trusted session/assignment, never trusted from request body.
2. **Descriptor resolution:** every capability type and pinned contract version exists and is allowed for new publication.
3. **Configuration validation:** required fields, types, ranges, enums, defaults and cross-field constraints.
4. **Port validation:** all required inputs resolved; all edges reference real nodes/ports; type compatibility holds.
5. **Dependency validation:** prerequisites present, versions compatible, no deprecated/blocked dependency.
6. **Graph validation:** valid entry point, reachable nodes, valid terminal paths, no unsupported cycles, no dangling control edges, no ambiguous rule routing.
7. **Security validation:** permissions, data classifications, actor assignments, application scope and side-effect approval policies are satisfied.
8. **Runtime validation:** integrations have a configured provider reference; idempotency/retry/failure policies are bounded; no unsupported runtime feature is requested.
9. **Snapshot validation:** canonicalize and digest the complete graph, descriptors, configuration, mappings and policy references.

Blocking errors prevent publication. Warnings may be acknowledged only where the policy explicitly permits it. The validator must not silently repair a graph or silently drop unknown fields.

## 7. Draft, publish and execution lifecycle

- Drafts are application-scoped and use optimistic concurrency (revision/ETag).
- A stale save returns a conflict and preserves the newer draft; no last-write-wins overwrite.
- Each successful save advances the draft revision and records actor, scope, timestamp and change evidence.
- Publish validates one exact draft revision and atomically creates an immutable published composition/version plus audit evidence.
- A published version includes the capability type IDs and contract versions, node/edge graph, config, data mappings, policy references and canonical digest.
- An execution stores tenant, application, workflow identity and exact published version ID/digest at creation.
- A later publication never changes an in-flight execution.
- Rollback means selecting a prior valid published version for new executions; it does not mutate historical versions or existing executions.

This section is a composition-specific restatement of #351; it does not replace that lifecycle contract.

## 8. Failure behavior

| Condition | Required behavior |
|---|---|
| Unknown capability or contract version | Fail closed; identify the unsupported block |
| Missing required input | Block publish; show the field/connection |
| Incompatible port types | Reject connection; explain expected business value |
| Missing dependency | Block publish; suggest compatible catalogue item |
| Ambiguous rule outcome | Block publish; require deterministic priority/conditions |
| Unsupported cycle | Block publish; explain that loops are not enabled |
| Unauthorized actor/data scope | Deny operation; do not reveal protected data |
| Integration timeout/retry exhaustion | Record attempt and failure; follow declared retry/dead-letter policy |
| Stale draft revision | Return conflict; require refresh/reconciliation |
| Descriptor deprecated after publication | Existing pinned version remains interpretable; new publication follows deprecation policy |

## 9. Persistence and API responsibilities

The durable model must represent capability descriptors/catalogue versions, templates, application-scoped draft compositions, nodes, ports, edges, configuration, draft revisions, immutable published snapshots, execution-to-version references, validation results and audit events.

PostgreSQL is the approved target for local development and CI/integration first. Tenant/application scope must be enforced in service authorization and database access controls; UI filtering alone is insufficient. Mutations, audit evidence and publication must have explicit transaction boundaries. No chargeable cloud resources are required for this design.

The API should expose business-oriented operations (discover compatible blocks, configure node, connect ports, validate draft, publish revision) while retaining stable typed contracts internally. Do not make raw generic schemas the customer-facing API.

## 10. Acceptance tests for the first vertical slice

1. A Customer Admin can instantiate a starter template into Application A and customize it without changing the template or Application B.
2. The visual designer and Rule Engine edit the same persisted draft revision.
3. A valid Activity → Rule → Activity composition saves, validates and publishes.
4. A Rule's true/false outcomes route deterministically; missing values and equal-priority ambiguity fail closed.
5. An Activity output can connect to a compatible Integration input; incompatible or unknown types are rejected with actionable feedback.
6. A Reporting node reads only data authorized for its application and cannot mutate workflow state.
7. A required input, dependency, actor permission or terminal path missing from the graph blocks publication.
8. Unsupported cycles are rejected; an explicit bounded loop is not accepted until the loop capability exists.
9. Stale concurrent edits produce a conflict without overwriting the newer draft.
10. Publishing revision N creates an immutable snapshot; a later revision N+1 does not alter executions pinned to N.
11. Cross-tenant and cross-application reads, writes, connections, validation and publication fail closed at API and PostgreSQL boundaries.
12. Fresh-clone setup, migrations, real PostgreSQL integration tests and browser application-switch tests cover the same delivered vertical slice.
13. Product Admin can activate, suspend and deprecate a provider definition without editing customer-owned connection or application policy records.
14. A Customer Admin can create a sandbox connection, test it, receive only masked metadata on reads, and rotate/revoke it without exposing credentials.
15. A tenant connection is unusable by an application until an explicit application binding grants the requested capability; another application in the same tenant remains denied.
16. Provider connection resolution rejects inactive/revoked connections, unsupported capability versions, missing entitlements and cross-scope references before dispatch.
17. Rotation preserves the connection ID and does not require workflow republishing; revocation blocks new dispatches without silently switching providers.
18. Duplicate or replayed provider callbacks do not duplicate delivery/meeting state transitions; invalid signatures and unknown operation references are rejected or quarantined.
19. Provider operation idempotency, retry exhaustion, callback reconciliation, audit redaction and needs-attention outcomes are covered by PostgreSQL integration tests.
20. Provider usage and commercial limits are enforced server-side and cannot be bypassed by editing workflow configuration.

## 11. Delivery sequence

**Slice A — composition contract and validator:** descriptors, ports, edges, compatibility rules, graph validation and contract tests.

**Slice B — guided canvas:** catalogue discovery, node configuration, typed connection suggestions, readable errors and preview.

**Slice C — durable lifecycle:** application-scoped draft persistence, revision conflicts, immutable publication and execution pinning, aligned with #351.

**Slice D — provider configuration foundation:** provider catalogue descriptors and lifecycle; tenant-owned connections; application bindings and policies; secret-reference boundary; masked APIs; sandbox connection tests; audit and PostgreSQL isolation tests. Start with one notification provider and one conferencing provider adapter to prove the vertical slice.

**Slice E — first four blocks end to end:** Activity, Rule, Integration and Reporting with PostgreSQL and browser evidence. Activity actions consume the same configured connections and operation/outbox path; do not create provider-specific shortcuts inside workflow code.

**Slice F — governed extensibility:** template upgrade diffs, capability deprecation migration, bounded loops and additional provider/capability families.

Do not claim the fabric is delivered because the canvas renders. A complete slice requires the same behavior across UI, API, PostgreSQL, authorization, audit and runtime.

## 12. Explicit non-goals for the first slice

- Customer-authored arbitrary code, SQL, scripts or plug-ins.
- Automatic lossy data conversion.
- Implicit loop semantics.
- Live shared mutable templates.
- Unreviewed external side effects.
- Platform Admin access to customer workflow data by virtue of catalogue ownership.
- Changes to the approved 228/38 baseline.
- Production/UAT readiness claims based only on design or CI evidence.
