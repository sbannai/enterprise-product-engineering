# ADR-EPER-PLATFORM-ADMIN-PROVISIONING-002

**Status:** Proposed implementation contract  
**Related:** Issue #339; ADR-EPER-CUSTOMER-ADMIN-DELEGATION-001  
**Baseline:** Preserve the approved 228 requirements across 38 chapters. This ADR defines a security boundary for existing Product Admin/customer lifecycle authority; it does not authorize production deployment or Business UAT.  
**Persistence:** PostgreSQL. Local development and integration tests only; no chargeable cloud resources.

## 1. Decision

Product Admin first-administrator provisioning and lockout recovery MUST use a distinct platform authority. The existing tenant-scoped admin configuration identity and customer identity/session resolvers MUST NOT be reused as platform authority.

The initial implementation may use a server-configured platform credential-to-principal mapping as a controlled local/integration bootstrap. The resolver contract MUST be replaceable by a verified platform identity-provider/session adapter without changing provisioning service semantics. A static mapping is not a substitute for production identity lifecycle, rotation, MFA, or operator governance.

## 2. Trusted principal contract

The resolver returns only:

- `platformActorId`: stable platform operator identifier;
- `permissions`: allow-listed platform permissions;
- `credentialId`: non-secret identifier/fingerprint for audit correlation.

Initial permissions:
- `customer_admin:provision` — assign the first active Customer Admin where none exists;
- `customer_admin:recover` — restore administrative access after verified lockout;
- `application:remediate` — explicitly suspend/revoke one tenant application assignment after version-checked operator confirmation; defined in follow-on issue #346 and is not part of Customer Admin provisioning/recovery routes.

The principal MUST NOT contain a tenant ID, application ID, customer role, or target actor. Those are requested resources, never authority claims.

Bootstrap mapping contract (server-side secret configuration only):

```json
{
  "<high-entropy-credential-at-least-32-characters>": {
    "platformActorId": "platform-operator-identifier",
    "permissions": ["customer_admin:provision", "customer_admin:recover"],
    "credentialId": "platform-credential-rotation-id"
  }
}
```

Resolver requirements:
- Read the mapping only from server-controlled configuration; never from request data or tenant configuration.
- Require bearer credentials of at least 32 characters and compare candidate secrets using constant-time byte comparison after checking equal lengths.
- Reject malformed JSON, duplicate/invalid identities, unknown permissions, blank or oversized identifiers, and credentials without an explicit permission.
- Return no principal on any parse, validation, or matching failure (fail closed).
- Never log, persist, return, or include the raw credential in audit metadata.
- Do not infer authority from email domain, OIDC identity alone, caller-supplied role, tenant membership, or a customer-admin token.
- Keep provision and recover permissions independently grantable; recovery is not implied by provisioning.

## 3. API authority boundary

Expose a platform-only service/API surface, separate from customer routes. Suggested operations:

- `POST /platform/tenants/:tenantId/applications/:applicationId/customer-admins` — provision first administrator;
- `POST /platform/tenants/:tenantId/applications/:applicationId/customer-admin-recovery` — controlled recovery.

The route MUST:
1. Resolve the platform principal from the trusted platform auth adapter.
2. Check the exact required permission for the operation.
3. Treat path/body tenant, application, and target actor as resource selectors only.
4. Validate tenant/application active state and target actor's active membership from PostgreSQL inside the transaction.
5. Reject authority attributes such as `platformActorId`, `grantorActorId`, `roleId`, `permissions`, or `isPlatformAdmin` supplied by the caller.
6. Derive grantor exclusively from the trusted principal.
7. Return generic denial responses without leaking cross-tenant resource existence.

Customer Admin delegation endpoints remain tenant/application scoped and cannot invoke this platform service.

## 4. PostgreSQL transaction contract

Provision/recovery must use a single transaction and durable tables/constraints. The transaction must:
- claim an idempotency key scoped to operation + tenant + application;
- acquire deterministic transaction-scoped locks for the tenant/application administrator set;
- verify the platform principal's required permission at the service boundary;
- re-check tenant/application active status and target actor active membership;
- for provisioning, require zero active Customer Admin assignments;
- for recovery, require an explicit reason/ticket reference and prove the configured lockout condition (no usable active Customer Admin);
- enforce a unique active Customer Admin assignment for the target and prevent conflicting concurrent first-admin/recovery operations;
- write the assignment, idempotency result, and append-only audit event atomically;
- roll back all writes if audit persistence fails;
- return the prior result for a same-key/same-payload retry; reject same-key/different-payload reuse;
- commit before triggering session invalidation or authorization-cache re-evaluation; failure to invalidate must cause protected requests to re-check durable authorization rather than trust stale grants.

The audit event must identify the platform actor, credential ID, operation, tenant/application resource, target actor, reason/ticket reference (for recovery), idempotency/correlation IDs, outcome, and resulting assignment version. Never include credentials or session tokens.

## 5. Recovery safeguards

- Recovery is a distinct break-glass operation, not a generic override of Customer Admin delegation.
- Require `customer_admin:recover` and a non-empty reason/ticket reference.
- Do not permit recovery to create Product Admin, platform permissions, or a tenant-wide role.
- Do not silently revoke existing administrators; recovery must restore access without privilege escalation and preserve complete history.
- Concurrent recovery attempts must serialize; only one valid active Customer Admin state may result.
- A failed audit write or uncertain transaction outcome must not be reported as success.

## 6. Required tests

### Resolver unit tests
- valid credential resolves only the configured platform actor and allow-listed permissions;
- provision-only principal cannot recover, and recover-only principal cannot provision;
- unknown credential, malformed mapping, short credential, invalid permission, malformed actor/credential IDs all fail closed;
- raw secret is absent from return values and audit payloads;
- tenant/customer identity mappings cannot satisfy platform resolver.

### Real PostgreSQL integration tests (must execute, not skip)
- provision first Customer Admin for an active tenant/application;
- reject provision when an active Customer Admin already exists;
- idempotent same-key retry returns same result; different-payload key reuse rejects;
- reject inactive tenant, inactive application, inactive/unassigned target actor, cross-tenant target;
- recovery succeeds only after lockout proof and with reason/ticket;
- reject recovery without reason, without permission, or when a usable administrator remains;
- concurrent first-admin/recovery attempts serialize and do not create conflicting active administrators;
- assignment, idempotency and audit commit atomically; forced audit failure rolls all back;
- stale/replayed request and duplicate assignment are safe;
- authorization after revocation/recovery re-resolves durable state.

### API/browser tests
- only a trusted platform principal with the exact permission can call each operation;
- forged body actor/role/tenant authority is ignored or rejected;
- customer admin/customer user credentials cannot reach platform routes;
- cross-tenant resource probing does not disclose existence;
- UI presents recovery reason and target before confirmation; UI visibility is not relied on for authorization.

## 7. Delivery sequence

1. Implement and unit-test the platform principal resolver behind an injectable auth adapter.
2. Add migration for idempotency and provisioning/recovery persistence with appropriate unique constraints and RLS/service-role boundary.
3. Implement transaction-safe PostgreSQL service and real integration tests.
4. Add platform-only API routes and negative authorization tests.
5. Add browser tests and Product Admin UI.
6. Reconcile all changed requirements with the existing 228-row register; do not silently alter the baseline.

## 8. Release boundary

This ADR is an implementation contract, not evidence that the service exists or passes tests. No cloud resources, production identity-provider setup, production deployment, or Business UAT is authorized by this document.