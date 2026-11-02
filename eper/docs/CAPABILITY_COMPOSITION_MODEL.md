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

## 11. Delivery sequence

**Slice A — composition contract and validator:** descriptors, ports, edges, compatibility rules, graph validation and contract tests.

**Slice B — guided canvas:** catalogue discovery, node configuration, typed connection suggestions, readable errors and preview.

**Slice C — durable lifecycle:** application-scoped draft persistence, revision conflicts, immutable publication and execution pinning, aligned with #351.

**Slice D — first four blocks end to end:** Activity, Rule, Integration and Reporting with PostgreSQL and browser evidence.

**Slice E — governed extensibility:** template upgrade diffs, capability deprecation migration, bounded loops and additional capability families.

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
