# Provider Payload Retention and Key Lifecycle

**Status:** Engineering contract — keyring and audited terminal-operation tombstones implemented; policy resolver and bounded purge remain open  
**Date:** 2026-11-03  
**Applies to:** PostgreSQL encrypted provider-operation payloads

## Purpose

Define safe lifecycle controls for encrypted provider request payloads before enabling a long-running provider worker or real provider dispatch. This document is additive implementation guidance; it does not amend the approved 228-requirement baseline.

## Current implementation facts

- Migration `034_encrypted_provider_payload_store.sql` stores AES-256-GCM envelope version 1.
- Version 1 additional authenticated data (AAD) is the ordered tuple: tenant, application, operation, capability, payload reference, envelope version.
- `PostgresEncryptedProviderPayloadStore` retains its legacy 32-byte-key constructor for v1 compatibility and also accepts an explicit keyring configuration for v2 writes and version-aware reads.
- The keyring-backed path stores `envelope_version=2` and the authenticated key identifier; v1 rows continue to use the legacy key and byte-compatible AAD.
- PostgreSQL `delete()` requires an actor-attributed `authorizeDelete` decision, locks the operation row before the payload row, rejects non-terminal operations, active legal holds and unresolved/unexpired retention, then scrubs ciphertext into a tombstone while preserving the operation reference, payload reference, digest, scope and policy provenance. Tombstone plus audit event commit in one transaction.
- Tombstoned payload reads fail closed with `PROVIDER_PAYLOAD_DELETED`; repeated deletion is idempotent. The in-memory test store retains its separate test-only delete behavior.
- The legacy boolean-only authorization object can no longer delete payloads; it must provide `authorizeDelete` with actor, source, environment, reason, and policy-decision reference.
- `putInTransaction()` is the atomic primitive used by operation enqueue; the public `put()` helper can create a payload independently and must not be used by production enqueue paths.

## Required design

### 1. Retention policy — no implicit expiry

1. An expiry timestamp must be resolved from an explicit, versioned retention policy before a payload becomes eligible for automated purge.
2. No hard-coded 90-day default is approved by this document.
3. A missing/unresolved policy means `expires_at IS NULL` and **not eligible for automatic deletion**.
4. Policy resolution must be attributable to the tenant/application and preserve the policy identifier/version used for the decision.
5. Legal hold overrides expiry. A held payload is never purge-eligible, even when its expiry has passed.
6. Purge selection must be bounded, tenant/application scoped, concurrency-safe, and re-check expiry and legal hold inside the deletion transaction.
7. Retention changes must not silently shorten the retention period of existing payloads. Any retroactive application requires an explicit policy action and audit record.

### 2. Key lifecycle — preserve version 1

1. Existing version-1 rows remain decryptable with the legacy key configuration for as long as those rows are retained.
2. New envelopes use a versioned keyring interface: an active write key identifier plus read access to active and retiring keys.
3. Envelope version 2 binds the key identifier into its AAD. The exact AAD encoding must be deterministic and covered by compatibility tests.
4. A key identifier is metadata, never key material. No raw key or secret value may enter PostgreSQL, logs, audit payloads, or PR evidence.
5. Rotation sequence: add new read key -> switch active write key -> verify new writes and old reads -> re-encrypt retained rows in bounded batches -> verify counts/digests -> retire old key only after zero retained references remain.
6. Unknown key identifiers and authentication failures fail closed with stable safe error codes. No plaintext fallback is permitted.
7. Re-encryption must preserve payload reference, scope, and plaintext digest; update ciphertext/envelope metadata atomically and audit the rotation operation.

### 3. Deletion authorization and audit

1. Deletion requires an authenticated actor context: actor type, actor ID, source, environment, and an authorization decision. A boolean-only callback is insufficient for auditable deletion.
2. Automated purge uses an explicitly identified system actor and a policy decision reference; it must not impersonate a human or use a guessed identity.
3. A successful deletion and its audit event must commit in the same PostgreSQL transaction.
4. The audit event records tenant/application, payload reference, operation ID, digest, policy ID/version, reason code, actor, and correlation ID. It must never contain plaintext, ciphertext, key material, provider secrets, or request body.
5. Deletion is blocked when legal hold is active, expiry is absent/not reached, or authorization cannot be established.
6. Purge must be idempotent and safe under concurrent workers. Audit failure means deletion rolls back.

### 4. Orphan prevention

1. Production enqueue must use `enqueueWithPayload()` and `putInTransaction()` so payload and operation row commit atomically.
2. A standalone payload write is not an approved production enqueue path.
3. A reconciliation job may identify orphan payload rows, but must not delete them without a separately audited retention/cleanup decision.
4. Operation terminal-state retention and payload retention must be modeled separately; do not assume operation completion itself authorizes payload deletion.

## Migration and implementation sequence

1. Add nullable lifecycle metadata and key identifier metadata without rewriting version-1 ciphertext or changing its AAD.
2. [x] Implement a backward-compatible keyring codec with explicit version-1 legacy reads and version-2 writes, and wire it into the PostgreSQL store.
3. [ ] Add retention-policy resolution and lifecycle metadata persistence; unresolved policy remains non-expiring.
4. [x] Replace boolean-only delete authorization with an actor-bearing audited command and transactional audit append; PostgreSQL retention deletion now tombstones only terminal operations and preserves the reciprocal operation/payload reference.
5. [ ] Add a bounded legal-hold-aware purge runner with concurrent-claim protection; current store exposes only a single-reference audited tombstone operation.
6. [ ] Extend tests for every terminal and active operation status, transition-vs-delete concurrency, v1 compatibility, v2 key selection, unknown key failure, rotation, missing expiry, policy changes, legal hold, actor attribution, audit rollback, RLS boundaries, duplicate purge, and orphan reconciliation. Current PostgreSQL lifecycle test covers queued-operation rejection, terminal-operation tombstoning, idempotence, digest/reference retention and deleted-read denial.
7. Run fresh-clone, PostgreSQL lifecycle, controlled QA, UAT technical simulation, and 228-requirement matrix checks on the exact resulting commit.

## Explicitly not authorized

- No automatic 90-day retention default.
- No deletion of payloads with unresolved expiry.
- No real provider dispatch or production worker process host.
- No cloud resource provisioning.
- No retirement of the version-1 key until all retained v1 records are proven migrated or otherwise lawfully disposed.

## Open policy decision

The retention period and whether customer/application overrides are permitted remain a product/data-governance decision. Engineering must accept a policy value and version; it must not invent or silently default that policy.
