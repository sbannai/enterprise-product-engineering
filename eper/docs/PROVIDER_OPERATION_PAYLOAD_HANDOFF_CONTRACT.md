# Provider Operation Payload Handoff Contract

Status: required design prerequisite before real provider dispatch is enabled.

## Problem

The durable operation queue currently persists a SHA-256 request digest, capability identity, idempotency key, and routing identifiers. A digest is intentionally one-way: it proves payload identity but cannot reconstruct the request. The operation row therefore does not contain enough information for a worker to invoke an email, SMS, notification, or video capability.

Do not work around this by placing raw request bodies, credentials, access tokens, or provider responses in `eper_provider_operations`, audit events, logs, or `provider_reference`.

## Required boundary

1. The caller canonicalizes the operation request and computes the existing SHA-256 digest.
2. The caller stores the request body in an approved encrypted payload store. The store returns an opaque payload reference; the reference is not a credential and must not encode the payload.
3. The enqueue transaction stores the payload reference alongside the digest and idempotency tuple. Reusing an idempotency key with a different digest **or payload reference** must fail closed. A retry with the same digest and same reference returns the original operation.
4. The worker claims the operation using the existing tenant/application RLS scope and `FOR UPDATE SKIP LOCKED` queue behavior. Each claim assigns a database-time lease owner and expiry and increments a monotonic fencing token.
5. A live owner may renew only with its current fencing token before expiry. Expired `DISPATCHING` operations may be reclaimed only while their attempt count is below the configured maximum; the next claim increments the fencing token. Claims and renewals are audited transactionally.
6. The recovery worker must call `recoverExpiredLeases` for the tenant/application scope. Expired operations already at the attempt limit transition to `NEEDS_ATTENTION`, clear their lease and append an audit event in the same transaction. Recovery is bounded with `SKIP LOCKED` and a maximum batch size.
7. Outcome writes must present the current worker identity and fencing token while the lease is still live. Stale, expired or superseded workers are rejected; accepted outcomes clear the lease.
8. Before reading the payload, the worker authorizes access to the opaque reference for the operation's tenant, application, capability, and operation ID. The payload store must return the canonical payload whose digest matches the persisted digest.
9. The worker resolves effective provider configuration immediately before dispatch (application override → tenant default → explicit NONE), rechecks active binding/connection/capability, and resolves the connection's secret reference through a server-only secret resolver.
10. Only the selected adapter receives the payload, safe policy, and credential material. No credential material or raw payload is returned to API callers or written to audit.
11. The worker maps adapter results to the existing bounded operation outcomes. Error metadata is a stable safe code only; provider response bodies and exception text are discarded.
12. Payload retention/deletion is explicit. Terminal operations must not leave payloads available indefinitely; retention and legal/audit holds are governed separately from the operation row.

## Persistence change

Add a forward-only migration (next available migration number) for a nullable opaque `payload_reference` column first, to preserve historical operation rows. New enqueue calls must require a non-empty reference. Do not make the column globally NOT NULL until historical rows have been reconciled and a deployment sequence is approved.

The payload reference must be tenant/application scoped at the payload-store boundary. PostgreSQL must not treat an opaque reference alone as authorization. The reference should be bounded, opaque, and free of embedded secrets or user data.

## Required tests

- New enqueue requires a payload reference.
- Same idempotency key + same digest + same reference is idempotent.
- Same idempotency key with a different digest or reference conflicts.
- Tenant A cannot resolve tenant B's payload; application A cannot resolve application B's payload.
- Digest mismatch, missing payload, expired payload, or revoked payload reference fails closed before adapter invocation.
- The effective application override wins over tenant defaults and drives the actual adapter invocation.
- Tenant defaults drive invocation when no application override exists.
- Missing policy, suspended binding, suspended connection, unsupported capability, or ambiguous route invokes no adapter.
- Secret resolver failure invokes no adapter and exposes no secret or exception text.
- Adapter success/retry/permanent failure map to SUCCEEDED/RETRYING/FAILED; exhausted retry maps to NEEDS_ATTENTION.
- Audit failure rolls back state transitions; audit contains identifiers and safe codes only, never payload or credential values.
- Concurrent claimers cannot claim one live lease; expired leases can be reclaimed with a higher fencing token.
- Old worker identities/tokens and expired leases cannot renew or record outcomes.
- Expired leases at the configured attempt limit are moved to `NEEDS_ATTENTION` by a bounded recovery pass; the worker runtime must schedule this pass.
- Adapter dispatch must use the stable operation idempotency key. A database fencing token cannot cancel a remote request already accepted by a provider.

## Release guard

Real external delivery remains disabled until the payload-store implementation, migration, repository changes, adapter registry, server-side secret resolver, and the above tests pass on the exact PR head. This contract does not authorize production credentials, external sends, cloud provisioning, or Business UAT.
