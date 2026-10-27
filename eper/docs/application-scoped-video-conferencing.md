# Application-Scoped Video Conferencing Configuration

**Status:** Requirements and customer-portal preview updated; provider runtime integration and authenticated customer APIs are not yet implemented or verified.

## Placement and ownership

Navigation: **Customer login → My Applications → select application → Settings → Video Conferencing**.

Video conferencing configuration belongs to the selected customer application. It must not be controlled by a platform-wide singleton or a global platform-admin settings page. Platform administrators may manage provider policy/entitlements, but customer administrators configure the provider connection and meeting defaults for each application they are authorized to administer.

## Configuration scope

Every record is scoped to trusted `tenant_id`, `application_id`, `provider_key`, and `environment`. A change for Application A must never change Application B.

Each application can configure:
- Approved provider (initial adapters may include Google Meet and Zoom; provider availability depends on implementation and authorization).
- Credential/connection reference and masked configured status; raw secrets remain in a managed secret store.
- Default meeting options and allowed meeting policies.
- Connection test result, last test timestamp, safe error code, and connection health.
- Environment separation for sandbox, UAT, and production.
- Audit history for provider selection, credential rotation/revocation, policy changes, and connection tests.

Provider selection alone does not mean credentials are connected or valid. Do not fabricate a successful connection status.

## API target contract

- `GET /customer/applications/:applicationId/integrations/video-conferencing`
- `PUT /customer/applications/:applicationId/integrations/video-conferencing` with optimistic `expectedVersion`
- `PUT /customer/applications/:applicationId/integrations/video-conferencing/credentials` to store or rotate a secret-store reference
- `POST /customer/applications/:applicationId/integrations/video-conferencing/test`

These are target contracts, not claims that routes already exist. Resolve tenant and actor from trusted authentication; verify application ownership and role permission on every request. Return masked metadata only. Sanitize provider errors and never log secrets, authorization headers, meeting tokens, or full credential payloads.

## Shared provider connections

A customer may explicitly reuse an authorized provider connection across selected applications, but each application must maintain its own policy, defaults, enabled state, audit trail, and access boundary. Sharing must be an explicit relationship, not an inference from matching provider names. Revoking a shared credential must surface the impact on every linked application without leaking those applications across tenants.

## Acceptance tests

1. Customer administrator can configure only applications assigned to their tenant and role.
2. Changing Application A leaves Application B's settings and version unchanged.
3. Cross-tenant and unauthorized application IDs are denied without disclosing configuration existence.
4. Raw credentials never appear in reads, errors, logs, or audit events.
5. Stale expected versions return a conflict rather than overwriting a concurrent change.
6. Connection-test failures are sanitized, application-scoped, and auditable.
7. A selected provider with no valid credential is shown as unconfigured/unverified, not connected.
8. Mobile and keyboard-only users can reach and operate the settings controls.
9. Integration is not marked Tested or Business-UAT accepted until runtime API and provider-backed tests produce evidence.

## Delivery boundary

The current customer portal is a **static design preview**. It may show the intended navigation and controls, but it does not authenticate users, persist configuration, connect to Google Meet/Zoom, or send alerts. Runtime implementation must use the existing customer/application settings persistence and authorized secret-store adapter, add integration and isolation tests, and retain durable audit events. No chargeable cloud resources are to be provisioned without explicit approval.
