# EPER Customer Administrator Delegation — Design and Acceptance Contract

**Status:** Proposed implementation contract; not yet production-authorized  
**Baseline:** Preserve the approved 228 requirements and 38 chapters. This document clarifies enforcement for existing customer administration and access-management capabilities; it does not add a new product requirement.  
**Persistence:** PostgreSQL only for durable authorization state. Local development and integration tests only; no cloud resources.

## 1. Authority model

Use three distinct authority boundaries:

1. **Product Admin** — platform-level authority. May provision the first Customer Admin for a tenant, revoke any tenant administrator, suspend a tenant, and manage platform-wide commercial configuration.
2. **Customer Admin** — tenant-scoped authority. May invite or delegate only explicitly delegable customer roles within the same tenant and only for applications the tenant owns and the delegator is authorized to administer.
3. **Customer User** — application-scoped business access. Cannot grant roles, manage access, alter tariff plans, or change tenant lifecycle.

OIDC authentication proves identity only. It never grants a role. Role and application permissions are resolved from durable server-side records on every protected request (or a bounded, revocable cache with immediate invalidation).

## 2. Delegation invariants

- Initial Customer Admin assignment is Product Admin-only.
- Customer Admin delegation is opt-in per role through the explicit durable `delegable` catalogue flag, and remains permission-subset constrained; no implicit administrator inheritance.
- A Customer Admin cannot grant Product Admin, platform permissions, billing authority, tenant lifecycle authority, non-delegable roles, or permissions they do not currently possess.
- A grant must be within the same tenant and an application the tenant owns. Tenant-wide grants require an explicit tenant-wide scope and a permission specifically marked tenant-wide.
- No self-grant, no cross-tenant target, no browser-supplied tenant/actor/role authority.
- Delegation cannot increase privilege: granted permission set must be a subset of the delegator's currently effective delegable permissions.
- A Customer Admin cannot revoke or modify a peer or superior administrator unless a separate explicit permission allows it. Product Admin retains break-glass recovery authority.
- Prevent accidental lockout: reject removal/demotion of the last active Customer Admin unless a Product Admin performs the change or a replacement administrator is activated in the same transaction.
- Revocation takes effect on the next protected request and before queued work is dispatched. Revoke affected sessions or force authorization re-resolution; never rely on stale browser role state.
- All grants, changes, expiry, and revocations are versioned, attributable, correlated, and written to append-only audit evidence in the same database transaction.

## 3. Durable data contract

Implement a tenant-scoped delegation record with:
- immutable assignment ID;
- tenant ID, optional application ID (null only for explicitly tenant-wide roles);
- subject actor ID and role ID;
- grantor actor ID and grantor authority snapshot/reference;
- status: active, revoked, expired;
- created, effective, expiry, revoked timestamps;
- optimistic version and correlation ID;
- reason / ticket reference where policy requires it.

Enforce foreign keys to tenant/application, actor/application, and role-definition records. Add unique/partial indexes preventing duplicate active grants. Apply and FORCE RLS to tenant-scoped records. Use a narrowly privileged service role for cross-tenant Product Admin operations; never bypass RLS using client-provided context.

Use the explicit role catalogue `delegable` flag as the grant gate and an explicit scope classification. The flag defaults to false; do not infer delegability from permission names or role labels.

## 4. Mutation transaction

For grant, update, or revoke:
1. Authenticate the browser session and resolve actor identity.
2. Resolve current tenant/application membership and effective permissions from PostgreSQL.
3. Validate target membership and role scope.
4. Enforce no-escalation, no-self-grant, peer/superior protection, and last-admin safeguards.
5. Acquire deterministic transaction-scoped locks for tenant/application and target actor/role.
6. Compare expected version; reject stale writes with a conflict response.
7. Persist the mutation and append the audit event in the same transaction.
8. Commit, then invalidate/re-resolve affected authorization and sessions.
9. Fail closed on database, audit, or authorization-service failure.

## 5. API and browser contract

Provide tenant-scoped list/detail and grant/update/revoke operations for Customer Admins, with Product Admin provisioning/recovery operations kept in the platform-admin surface. Derive tenant, actor, grantor and effective permissions exclusively from the trusted server-side session. Reject unknown request fields and any attempt to pass authority attributes in the body.

The browser must show the target, scope, role, effective permissions, expiry and consequence before confirmation. Render only actions the current actor is authorized to perform. A UI hide/show decision is not an authorization control.

## 6. Required automated evidence

### Positive
- Product Admin provisions the first Customer Admin for Tenant A.
- Customer Admin delegates a permitted lower-privilege role to a member of Tenant A.
- Customer Admin delegates only within an owned application.
- Versioned grant/revoke persists across PostgreSQL restart.
- Audit event and mutation commit atomically.

### Negative / security
- Customer User cannot grant, edit, list privileged assignments, or revoke.
- Customer Admin cannot grant Product Admin or any permission they do not hold.
- Customer Admin cannot grant a role marked non-delegable.
- Cross-tenant and unowned-application target denied.
- Self-grant, forged actor/tenant fields, and role escalation denied.
- Peer/superior administrator modification denied unless explicitly authorized.
- Last active Customer Admin cannot be removed without atomic replacement or Product Admin recovery.
- Revoked/expired grants and revoked sessions deny subsequent requests and queued dispatch.
- Stale expected version returns conflict; concurrent grants cannot bypass the last-admin invariant.
- PostgreSQL/RLS/audit outage fails closed.
- No secrets, session tokens, OIDC tokens, or authorization codes appear in logs or audit payloads.

## 7. Delivery sequence

1. Add role delegability/scope metadata and migration.
2. Add durable delegation migration, RLS, indexes and readiness checks.
3. Implement transaction-safe PostgreSQL store with optimistic concurrency and audit.
4. Add session-derived API authorization; keep Product Admin and Customer Admin surfaces separate.
5. Add API negative/positive tests and real PostgreSQL integration tests.
6. Add Chromium end-to-end tests for delegation, denial, revocation and last-admin protection.
7. Wire the Customer Admin UI and document operational recovery.

## 8. Release boundary

This work is not evidence of production readiness by itself. No Business UAT, production deployment, identity-provider provisioning, or chargeable infrastructure is authorized by this design. The 228-requirement baseline and existing acceptance criteria remain authoritative.
