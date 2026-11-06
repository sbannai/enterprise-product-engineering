# Help Center: CRM, Sales, Marketing Agents and WhatsApp Posts

**Audience:** tenant administrators, campaign operators, CRM/Sales users and reviewers  
**Status:** documentation draft for review; describes the current prototype, not a production-ready integration.

## What is available?

EPER provides draft workflows for CRM, Sales and Marketing. Users can request draft content, review the draft queue, and use a maker-checker review step. The Agent Tools screen provides a preview of tenant/application/environment-specific settings.

The current agent generator is template-based. Drafts are held in process memory and may disappear when the service restarts. Configuration preview is not persisted and is not yet enforced by the runtime.

## Open the screens

- Agent draft console: `/agents-ui`
- Agent tools and channel configuration: `/agents-tools`

These paths are available only when the corresponding application server build and routes are deployed. A local or pull-request wireframe is not proof that a hosted environment has these routes.

## Create and review a draft

1. Select the relevant CRM, Sales or Marketing workflow.
2. Enter a concise objective and only the business context needed for the draft. Avoid passwords, payment details and unnecessary personal data.
3. Submit a draft request.
4. Open the pending review queue.
5. A reviewer other than the draft creator must approve or reject the item.
6. Record any operational decision using the approved project audit process; the prototype's in-memory status is not a durable audit record.

**Important:** Approval changes the draft's status only. It does not send an email or WhatsApp message, publish a social post, write to CRM, change a pipeline stage, or execute a transaction.

## Configure tools by tenant and application

The configuration preview is scoped by:
- Tenant/client ID
- Application: School ERP, College ERP, Growth Hub or Corporate ERP
- Environment: sandbox, UAT or production

Review the settings for alerts, post/campaign drafts, reports, lead materialization, AI provider mode, retention, PII redaction, role access and audit controls. Use the generated JSON as a review artifact only. It is not saved to the server and changing it does not activate a tool.

Defaults should remain conservative: external actions disabled, lead materialization disabled until its server-side safeguards are ready, and human review required before any external action.

## Configure WhatsApp posts

The configuration preview supports these provider choices:
- Meta WhatsApp Cloud API
- Twilio (requires a provider adapter)
- Provider-neutral adapter

You can enter non-secret Business Account ID and Phone Number ID values, an approved template name, and choose Draft only or Approved template preview. Recipient opt-in, human approval and audit requirements should remain enabled.

### What does not work yet?

This is configuration-only. It does not connect to WhatsApp, validate templates against a provider, deliver messages, receive delivery callbacks, or persist settings. Sending is hard-disabled in the preview.

Never enter access tokens, app secrets, webhook verification tokens or signing secrets into this screen. Credentials must be stored server-side in a managed secret store and never returned to the browser.

### Requirements before live sending

Before enabling live messaging, the implementation must include:
- Tenant-scoped durable configuration and access control.
- A server-side provider adapter with secret management and webhook signature verification.
- Approved-template and WhatsApp policy validation.
- Verifiable recipient opt-in and opt-out suppression.
- Human approval separated from the draft author.
- Idempotency, rate limits, retry controls and delivery/status callbacks.
- Tenant-isolated durable audit evidence and retention rules.
- Explicit server-side execution authorization and tests that prove sending remains disabled by default.

## Troubleshooting

**I changed a setting but it disappeared.**  
The current page only generates a JSON preview. Persistence has not been implemented.

**I approved a draft but nothing was sent.**  
That is expected. Approval records the draft's review state only; external actions are not wired.

**The draft queue is empty after a restart.**  
The prototype uses process-memory storage. Durable storage is a production prerequisite.

**The WhatsApp configuration is complete but no message arrives.**  
The screen is not connected to a WhatsApp provider. No message is sent by this feature today.

**The page is unavailable.**  
Confirm that the branch containing the route is deployed to the environment you are using and that the API server is running. Do not assume a PR or wireframe is deployed.

## Requirements and release status

This help page accompanies the proposed CRM/Sales/Marketing/WhatsApp requirements delta and wireframe. It does not replace or renumber the 228 approved requirements, alter the 38-chapter baseline, or claim that a requirement is closed. Current-head CI and UAT must pass before the implementation is treated as verified.
