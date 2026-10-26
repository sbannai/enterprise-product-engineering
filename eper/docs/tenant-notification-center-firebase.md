# EPER Tenant Notification Center and Firebase Configuration

**Status:** Requirements specification committed for planning; runtime implementation not yet started.

## Objective
Provide each customer/tenant with a Notification Center to configure, preview, deliver and audit application-specific alerts. Each application has independent policies, recipients, templates and delivery history, even when applications share one Firebase project.

## Supported Firebase topology
Each tenant can select either model per application:

1. **Shared Firebase project:** a tenant-owned Firebase project/service identity can be reused across explicitly mapped applications. Application-specific settings remain isolated in EPER. Credentials are stored server-side and referenced by opaque credential IDs.
2. **Dedicated Firebase project per application:** each application maps to its own Firebase project and server-side credential reference, allowing independent rotation, sender identity, policy and operational ownership.

Allow mixed topology across applications within one tenant. Configuration records tenant ID, application ID, provider, Firebase project ID, credential reference, environment and status. Never store raw service-account private keys in ordinary application configuration or expose them in API responses.

## Application-specific controls
- Event subscriptions by application and event type.
- Alert templates, locale, timezone, severity, delivery preferences and quiet hours.
- Audience/recipient groups and role-based targeting, respecting application membership.
- Channels: in-app Notification Center and Firebase Cloud Messaging (FCM) push. Email/SMS/WhatsApp can be added through separate provider adapters and consent controls.
- Preview/test delivery in sandbox; separate UAT and production environments.
- Retry policy, rate limits, deduplication/idempotency key, expiry/TTL and delivery status callbacks.
- Per-application delivery log, failure reason, retry history and usage metrics.
- Enable/disable per application and event, default disabled until configuration is validated.

## Security and tenant boundaries
- Derive tenant and actor identity from trusted server-side authentication; never trust tenant ID supplied in request body/query.
- Verify the actor can administer the target application before reading or changing its notification settings.
- Enforce tenant/application authorization at each API and delivery entry point.
- Keep service credentials in managed secrets; redact secrets in API responses, logs, errors and audit events.
- Treat FCM device tokens as sensitive identifiers: encrypt at rest where supported, limit access, support revocation and remove invalid tokens.
- Prevent cross-tenant recipient/device-token reuse.
- Maintain audit events for configuration changes, credential rotation references, test sends, attempts, retries and administrative actions.
- Require applicable opt-in/consent, unsubscribe/suppression and privacy retention controls.

## Suggested data model
- TenantNotificationProfile: tenantId, defaultProvider, defaultTopology, createdAt, updatedAt.
- ApplicationNotificationConfig: tenantId, applicationId, provider, firebaseProjectId, credentialReferenceId, environment, enabled, policyVersion.
- NotificationEventSubscription: tenantId, applicationId, eventType, enabled, templateId, severity.
- NotificationTemplate: tenantId, applicationId, templateId, locale, title/body template, version, approval status.
- NotificationAudience and NotificationDeviceRegistration: tenantId, applicationId, actorId/recipientRef, token reference, platform, consent state, lastSeenAt, revokedAt.
- NotificationDelivery: tenantId, applicationId, notificationId, idempotencyKey, provider message ID, status, attempts, timestamps, safe error code.
- NotificationAuditEvent: tenantId, applicationId, actorId, action, correlationId, timestamp, redacted metadata.

Enforce tenant/application ownership in data access, not merely by filtering the UI.

## API outline
- GET/PUT /customer/apps/:applicationId/notifications/config
- GET/PUT /customer/apps/:applicationId/notifications/subscriptions
- GET/POST /customer/apps/:applicationId/notifications/templates
- POST /customer/apps/:applicationId/notifications/test
- GET /customer/apps/:applicationId/notifications/deliveries
- POST /customer/apps/:applicationId/notifications/devices/register
- POST /customer/apps/:applicationId/notifications/devices/revoke

Every route requires trusted customer identity and application assignment checks. Secret values are write-only references; GET returns masked/configured metadata only. Test-send is sandbox-only by default and must not become an arbitrary-message relay.

## UI placement
Customer login → select application → Notifications:
- Overview and delivery health
- Firebase connection and topology (shared or dedicated)
- Event/alert rules and templates
- Recipient/audience settings
- Test notification
- Delivery history and failures
- Audit trail

Tenant-wide settings can show reusable provider connections and applications explicitly linked to them. Admin/system settings remain separate from customer-facing application configuration.

## Acceptance criteria
1. A tenant admin can configure shared-project and dedicated-project models, including a mixed setup across two applications.
2. An application cannot read or change another tenant's settings, templates, device tokens or delivery records.
3. Application-specific event rules are respected when a Firebase project is shared.
4. No raw credential is returned by APIs, UI, logs or audit records.
5. Unauthenticated, unauthorized, cross-tenant and cross-application requests are denied.
6. Duplicate events do not create duplicate deliveries when the same idempotency key is used.
7. Test sends are sandbox-only unless explicit controlled release authorization exists.
8. Failed deliveries, retries and configuration changes are auditable for the authorized tenant.
9. CI tests cover both topologies, authorization, secret redaction, idempotency and failure handling.
10. Keep Dev, Tested, Production Ready and UAT statuses independent in the functionality tracker. Current KPI remains Dev + Tested before business UAT; production readiness follows accepted UAT.

## Implementation sequence
1. Add the functionality to the existing tracker and register requirements.
2. Define provider-neutral notification contracts and tenant/application authorization.
3. Add durable configuration storage using secret references only.
4. Implement FCM adapter, event dispatcher, idempotency and delivery audit.
5. Build the customer Notification Center and test-sends.
6. Add automated isolation/security/regression tests before marking Tested.

This document records requirements only; it does not claim the Notification Center or Firebase delivery is implemented.