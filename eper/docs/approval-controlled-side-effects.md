# Approval-Controlled Side Effects — Design and Delivery Contract

**Requirement:** EPER-ACT-APPROVAL-001  
**Requirements register:** EPER-PRD-ADD v1.5.0  
**Status:** Owner-directed control recorded; disabled-by-default orchestration slice implemented and CI-validated; production host integration and provider execution remain pending  
**Baseline:** Additive only. Preserve the approved 228 requirements / 38 chapters.  
**Safety:** No provider adapter, CRM write executor, external dispatch, cloud resource, or Business UAT is enabled by this design.

## 1. Purpose and non-negotiable boundary

All external actions and all CRM writes require a distinct, durable human approval for the exact action proposal being executed. Approval is not execution. Draft generation, workflow approval unrelated to the side effect, and an `APPROVED` label alone must never invoke a side-effect adapter.

Internal workflow state events (started, submitted, approved, rejected, cancelled, completed) remain internal events and may be delivered to internal consumers under their own authorization. They must not be confused with external side effects.

The gate applies regardless of initiator: human UI, API, workflow, integration, campaign worker, or AI agent.

## 2. Existing implementation observations

- Workflow outbox delivery is at-least-once and currently contains only six internal workflow lifecycle event types. Its dispatcher is supplied explicitly by the host.
- The outbox worker calls the supplied dispatcher and acknowledges delivery; it does not currently resolve a durable human approval for an external side effect.
- Agent jobs/drafts have PostgreSQL persistence, draft content hashes, maker-checker review, and audit writes. The current review path returns `execution: NOT_EXECUTED`; approval does not invoke an action.
- The CRM/Sales/Marketing build plan already requires human approval for external communications, publication, CRM writes, audience exports, pricing/discount/contract commitments and spend. It also identifies durable approvals, source draft hash/version, and maker-checker.
- The audit writer supports approval linkage and transactional append. This is not, by itself, a side-effect approval store or execution gate.
- The authorization review pack is explicitly draft / not approved. Role aliases, numeric thresholds, delegation rules, and exceptions must not be inferred from its proposed matrix.

## 3. Domain model

### 3.1 ActionProposal (immutable proposal version)

Required fields:
- `proposal_id`, `proposal_version`, `tenant_id`, `application_id`
- `action_type` and `side_effect_class` (CRM mutation, external communication, publish, audience export, financial commitment, other external action)
- `target_type`, `target_id` and a canonical, validated action payload
- `requested_by` (trusted human/service identity), requester type, source job/draft/workflow reference
- `payload_hash` (SHA-256 of canonical payload + action/target/scope/version envelope)
- `idempotency_key`, `created_at`, `expires_at`, correlation and causation IDs
- lifecycle is derived from append-only decisions and execution records; proposal content is not edited in place.

A material change creates a new proposal version and hash. It never inherits the prior version's approval.

### 3.2 ApprovalDecision (append-only)

Required fields:
- approval ID and proposal ID/version/hash
- tenant/application scope
- approver principal ID, authenticated human actor type, effective role/delegation reference
- decision (approve/reject/revoke), decision timestamp, reason/note
- policy version and authorization evidence reference
- correlation/request ID and audit event reference

Enforcement:
- requester and approver must be different principals.
- service/system identities cannot approve.
- approver must be currently authorized for this exact action, target and scope.
- no role name, amount threshold, or delegation exception is assumed until the owner-approved authorization matrix supplies it.
- approval/rejection/revocation records are append-only; corrections are additional decisions.

### 3.3 ActionExecution (durable execution ledger)

Required fields:
- execution ID, proposal ID/version/hash, approval ID
- tenant/application, action type, target, idempotency key
- state: ready, claimed, dispatching, succeeded, failed, cancelled, dead_letter
- worker/dispatcher identity, attempt count, lease timestamps, start/completion timestamps
- safe result/failure code, provider reference where applicable, correlation ID

A unique tenant/application-scoped idempotency constraint prevents duplicate logical execution. The dispatcher must pass the same idempotency key to downstream providers when supported. At-least-once delivery still requires receiver-side deduplication; it is not a universal exactly-once guarantee.

## 4. Required execution protocol

1. **Propose:** validate the command and trusted tenant/application identity. Persist an immutable proposal and payload hash. No side effect occurs.
2. **Review:** a different authenticated human submits approve/reject against the exact proposal version/hash. Recheck role, delegation, scope and policy server-side. Persist decision and audit atomically.
3. **Authorize at execution:** immediately before claim/dispatch, re-read proposal, approval, expiry/revocation, current authorization, tenant/application assignment, action policy and any applicable consent/suppression/commercial controls.
4. **Claim atomically:** transactionally claim a single approved proposal with a bounded lease and unique idempotency key. Reject stale hash/version or already-consumed approval.
5. **Dispatch:** invoke only a registered, explicitly enabled adapter with a typed payload and idempotency key. No generic arbitrary URL/tool invocation.
6. **Record outcome:** append execution attempt/outcome and audit evidence. Retry only according to bounded policy; dead-letter after configured maximum attempts. Do not retry a non-idempotent action unless downstream idempotency or reconciliation is proven.
7. **Revoke/cancel:** before dispatch boundary, revocation/cancellation prevents claim. Once an irreversible provider call has started, cancellation is best-effort and must be represented accurately; never claim rollback of an external effect.
8. **Observe:** expose scoped status, reason codes, approval provenance, attempts, timestamps and safe provider references. Audit access and replay/re-drive.

Approval storage, authorization lookup, audit append, or policy failure must fail closed. There is no in-memory approval fallback.

## 5. Transaction and persistence boundaries

- PostgreSQL is the approved target; implementation starts in local development and integration tests only.
- Persist proposal, approval decision, audit event and execution intent/outbox in a transaction where they share the database.
- Tenant/application scope must be part of primary/foreign keys, unique constraints, query predicates and row-level security.
- Use restricted service identities and least-privilege database grants. Never rely on RLS alone when queries can omit scope predicates.
- Approval and audit ledgers are append-only. Proposal versions are immutable. Execution status may be a projection, but the underlying attempt/outcome ledger is append-only.
- Migrations must be repeatable and tested against local/ephemeral PostgreSQL. No AWS resources or production database are authorized.
- Avoid mixing external side-effect messages with the existing internal workflow lifecycle outbox table unless the canonical event contract explicitly approves that design.

## 6. API and UI contract (proposed)

- Create proposal: returns proposal ID/version/hash and `awaiting_approval`; does not execute.
- Read proposal: tenant/application-scoped, permission checked, redacts sensitive payload fields.
- Approve/reject: requires expected version and hash; returns recorded decision; does not execute.
- Revoke: appends revocation decision if dispatch has not crossed the irreversible boundary.
- Execute: internal worker-only operation, not an unrestricted user-facing endpoint. Requires fresh authorization and consumes approval exactly once.
- Status: distinguishes proposed, awaiting_approval, approved, rejected, expired, revoked, ready, dispatching, succeeded, failed, cancelled and dead_letter.

UI must clearly show requester, approver, action/target, payload diff, expiry, source references and status. No "approve and send" combined control in the initial implementation. Any later one-step UX must still preserve separate approval and execution transactions and clear confirmation.

## 7. Security and failure tests

Mandatory tests:
- requester cannot approve own proposal through UI, API, worker or role switch
- service/system identity cannot approve
- unauthorized or out-of-scope human cannot approve
- cross-tenant/application proposal, approval, read and execution are denied
- approval for hash/version N cannot authorize changed N+1, target, recipient, CRM field or action type
- expired, rejected, revoked, missing or duplicate approval blocks dispatch
- authorization/policy/approval/audit database outage blocks dispatch
- CRM write path and every external side-effect class pass through the same policy gate
- internal workflow events are not misclassified as external actions
- concurrent workers, duplicate requests and replay produce one logical effect under the idempotency contract
- crash before dispatch, during dispatch and after provider success but before acknowledgement are recoverable and do not silently duplicate non-idempotent actions
- audit and execution evidence remain attributable and integrity-verifiable

## 8. Delivery sequence

| Slice | Deliverable | Exit condition |
|---|---|---|
| A | Requirement and contract baseline | EPER-ACT-APPROVAL-001 recorded; existing baseline unchanged |
| B | Typed proposal/approval/execution contracts and pure policy gate | Unit tests cover maker-checker, hash/version, scope, expiry and fail-closed cases |
| C | PostgreSQL migration and repositories | RLS, append-only, constraints, restart, concurrency and transaction tests pass locally |
| D | Approval API and review queue integration | Trusted identity, role policy, audit linkage, response envelope and negative tests pass |
| E | Worker execution gate | Fresh authorization and approval verification immediately before dispatch; idempotency/recovery tests pass |
| F | CRM mutation integration | All CRM writes route through gate; no alternate direct write path |
| G | External adapters (separately approved) | Provider-specific consent, secrets, idempotency, rate limits, audit, sandbox tests and explicit enablement review |

Slices A–F do not authorize enabling a real external provider. Slice G requires a separate explicit implementation/deployment authorization and provider-specific readiness evidence.

## 9. Open owner decisions (must not be guessed)

- Canonical approved role names and grantor/approver matrix.
- Delegation lifecycle and permitted delegation scopes.
- Amount/value thresholds by action, currency, tenant/application and period.
- Which actions require dual approval beyond maker-checker.
- Approval validity duration and revocation rules by action class.
- Retention and legal-hold policy for proposals, approvals and execution evidence.
- Emergency/break-glass policy, if any.
- Canonical EM-EVT-001 event names and ownership for proposal/approval/execution lifecycle.

Until these decisions are approved, the implementation must enforce the known minimum: distinct human approver, exact proposal hash/version, trusted tenant/application scope, fresh authorization, durable audit, and fail-closed behavior. Missing additional policy must block the affected action rather than invent a threshold or exception.


## 10. Execution orchestration implementation status (2026-10-31)

The first worker-side orchestration slice is implemented as a disabled-by-default library service:

- Loads the exact tenant/application/proposal version and selected approval grant from the durable store.
- Calls the host-owned `execute_proposal` authorization operation with proposal hash, approval ID and original human approver identity, so the host can recheck current grantor authority.
- Requires the fresh host policy version to match the approval grant's recorded policy version.
- Runs a required independent-controls callback before attempting the transactional execution claim.
- Passes only the typed proposal, execution ID and stable idempotency key to the host dispatcher contract.
- Persists successful outcome through the existing transactional execution ledger and audit path.
- Does not ship a provider/CRM adapter, public execution endpoint or production host wiring. Dispatch remains disabled unless an explicit host composition enables it; no production composition does so in this slice.

The host dispatcher must deduplicate using the supplied idempotency key. If dispatch returns an ambiguous outcome or the final ledger write fails after provider success, the lease is retained for controlled recovery; a retry is safe only where the receiver honors that same idempotency key. This slice does not claim universal exactly-once delivery.

Validation must cover policy denial, policy-version drift, independent-control denial, disabled dispatch, duplicate claims, concurrent workers, lease expiry/recovery and the crash-after-provider-success boundary. PostgreSQL remains local/ephemeral integration scope only; no cloud resource, real provider or Business UAT is enabled.
