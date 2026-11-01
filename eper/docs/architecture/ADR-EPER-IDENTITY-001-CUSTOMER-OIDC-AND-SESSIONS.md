# ADR-EPER-IDENTITY-001 — Provider-Neutral Customer Authentication and Session Management

**Status:** Accepted technical direction for implementation; identity-provider deployment configuration remains environment-specific.  
**Date:** 2026-11-01  
**Scope:** Customer workspace, customer APIs, tenant/application context and all browser-originated protected operations.  
**Baseline:** Preserve the 228 approved requirements and 38 chapters. This ADR does not add or alter product requirements.

## Context and verified current state

The repository currently has:
- An `IdentityProvider.authenticate(token)` interface, but no production OIDC browser-login/session implementation.
- `resolveCustomerAccessIdentity` in `apps/api/server.ts`, which maps a bearer token through `EPER_CUSTOMER_ACCESS_IDENTITIES_JSON`.
- A `/customer/session` introspection route that resolves that configured bearer token. The code explicitly says this is not a substitute for a browser login UI.
- PostgreSQL tenant-to-application and actor-to-application assignment stores. Their mutations use expected-version checks, transaction boundaries and audit writes.
- Customer ticket routes that derive tenant/actor/role from trusted server-side credential mapping and check both tenant ownership and actor application assignment.
- A customer portal marked Preview, not a production authenticated session.

The static credential map is useful for controlled tests and preview, but it is not acceptable as the production customer identity/session lifecycle.

## Decision

Implement a provider-neutral OpenID Connect (OIDC) Authorization Code flow with PKCE and durable opaque server-side browser sessions. Do not bind EPER to one commercial identity provider.

### 1. Authentication protocol

- Use OIDC Authorization Code flow with PKCE (S256), state and nonce.
- Validate issuer, audience, authorized party where applicable, signature, permitted algorithm, expiry, not-before, nonce and token binding.
- Use the issuer's discovery document and JWKS; cache keys with bounded lifetime and refresh on unknown key ID.
- Require HTTPS redirect/callback URLs outside local test mode.
- Reject implicit flow, password grant, unsigned tokens, algorithm downgrade and caller-supplied identity headers.
- Do not use email address as the immutable subject key. Identity binding key is `(issuer, subject)`.

### 2. Server-side subject binding and authorization

- A durable identity binding maps `(issuer, subject)` to an EPER actor identity and tenant.
- Provisioning/binding is an explicit privileged admin operation; successful OIDC authentication alone does not create a tenant, actor, role or application assignment.
- Resolve active role/delegation and application assignments from current server-side authorization and PostgreSQL assignment stores on each protected request or through a bounded, revocable authorization cache.
- Never accept tenant ID, actor ID, role, application allowlist or entitlements from browser request bodies, query strings or unsigned headers as authority.
- Tenant-to-application ownership and actor-to-application assignment are separate checks; both must pass.
- Revocation must take effect for subsequent requests and worker dispatch authorization.

### 3. Browser session

- After successful OIDC callback, create a cryptographically random opaque session ID; persist only a keyed hash of the session ID in PostgreSQL.
- Cookie: `__Host-eper_session`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, no Domain attribute. Secure cookies are mandatory outside local HTTP development.
- Use server-side idle and absolute expiries; rotate session identifiers after authentication and privilege/context changes.
- Logout revokes the server-side session and expires the cookie. Password/IdP logout is a separate upstream concern.
- Unsafe cookie-authenticated methods require CSRF protection (same-site policy plus synchronizer token or equivalent origin-bound mechanism).
- Never store OIDC access/refresh tokens in browser localStorage or expose them to customer JavaScript.

### 4. Durable persistence and audit

Introduce PostgreSQL tables for:
- OIDC subject bindings (issuer, subject, tenant, actor, active/revoked, version, provisioning metadata).
- Login transactions (state hash, nonce hash, PKCE verifier hash or encrypted verifier, expiry, one-time consumption).
- Browser sessions (session hash, issuer/subject binding, tenant/actor reference, created/last-seen/idle/absolute expiry, revoked metadata, rotation lineage).

Apply RLS or equivalent tenant isolation to tenant-scoped rows. Keep security-critical session lookup/revocation keyed by an opaque hash and use narrow service permissions. Never log tokens, authorization codes, PKCE verifiers, cookies or secrets. Audit login success/failure, subject binding changes, session creation/rotation/revocation and authorization denials without recording credentials.

### 5. Compatibility and rollout

- Keep `EPER_CUSTOMER_ACCESS_IDENTITIES_JSON` available only for automated tests and explicitly labelled local preview mode.
- Production startup must reject preview credential-map authentication and require configured OIDC, durable subject binding, PostgreSQL sessions, secure cookies, audit persistence and a configured public origin.
- Do not silently fall back from OIDC/session persistence to environment credentials, in-memory sessions or client-provided identity.
- Existing actor/application and tenant/application assignment stores remain authoritative for access scope; the OIDC subject binding only establishes which EPER actor authenticated.

## Required implementation sequence

1. Add migrations and PostgreSQL stores for subject bindings, login transactions and sessions.
2. Add a provider-neutral OIDC discovery/JWKS/token-validation adapter with injected clock/fetch for deterministic tests.
3. Add login start, callback, session introspection, CSRF, logout and revocation routes.
4. Wire browser UI to same-origin cookie sessions; remove bearer token entry from the production customer experience.
5. Connect subject binding to existing tenant/actor/application assignment and role/entitlement checks.
6. Add live PostgreSQL integration and browser end-to-end tests.
7. Add deployment configuration and operational runbooks without enabling any real provider or cloud resource by default.

## Acceptance criteria

- Invalid signature, issuer, audience, expiry, nonce, state, PKCE, replayed callback and unknown subject binding fail closed.
- A subject bound to Tenant A cannot resolve Tenant B or another actor by changing browser state or API parameters.
- An actor without active application assignment is denied even when the tenant owns that application.
- Revoking tenant/actor assignment, role or session blocks subsequent protected requests and asynchronous side effects.
- Session cookie is HttpOnly, Secure outside local mode, SameSite=Lax, host-only and never readable by JavaScript.
- CSRF, session fixation, replay, logout, idle expiry, absolute expiry, rotation and concurrent revocation tests pass.
- Session, subject binding and audit state survive PostgreSQL restart; database outage fails closed.
- No OIDC token, authorization code, cookie, secret or PKCE verifier appears in logs, UI, artifacts or audit payloads.
- Production startup refuses preview bearer-map authentication and missing durable session dependencies.

## Explicit non-goals

- Selecting or provisioning a specific identity provider.
- Self-service tenant/actor provisioning.
- Password storage or local password reset.
- Business UAT authorization or production deployment.
- Changing the 228 approved requirement baseline.
