# CRM, Sales and Marketing Agents — controlled workflow API

## Scope
This change adds one shared, provider-neutral draft workflow for CRM, Sales and Marketing. It uses the existing API server and keeps all 228 requirement IDs, 38 chapters, six capability families and the capability router unchanged.

## API (disabled by default)
Configure only in an isolated non-production environment:
- `EPER_AGENTS_API_ENABLED=true`
- `EPER_AGENTS_API_TOKEN`: at least 32 characters
- `EPER_AGENTS_TENANT_ID`: the tenant bound by the server
- `EPER_AGENTS_ALLOWED_PRINCIPALS`: comma-separated allowlist with at least two distinct principals

Every request requires `Authorization: Bearer <token>` and `X-EPER-Principal-Id`. Do not expose the shared bearer-token model as a production identity system; replace it with the approved identity provider and permission checks before production.

### Create drafts
- `POST /v1/agents/crm/drafts`: `lead-qualification`, `contact-summary`, `next-action`
- `POST /v1/agents/sales/drafts`: `follow-up`, `opportunity-plan`, `proposal-outline`
- `POST /v1/agents/marketing/drafts`: `campaign-brief`, `email-copy`, `social-copy`

Body shape: `{ "intent": "...", "input": { "objective": "...", "context": "...", "audience": "...", "offer": "..." } }`

### Review and list
- `GET /v1/agents/drafts` (optional `?status=PENDING_APPROVAL`)
- `POST /v1/agents/drafts/{id}/approve`
- `POST /v1/agents/drafts/{id}/reject`

A reviewer must differ from the draft creator (maker-checker). Approval changes only the draft's status. It does not send messages, publish content, write to CRM, modify pipeline stages, or execute transactions.

## Current boundaries and production gaps
- The current content generator is deterministic/template-based, not connected to an LLM provider.
- Draft storage is bounded process memory; drafts disappear on restart and are not suitable as an audit system.
- No CRM connector, email/SMS/social publisher, campaign scheduler, or execution adapter is called.
- Before production: use durable tenant-scoped storage, real user/role identity, permissioned CRM read/write adapters, immutable audit evidence, retention rules, rate limiting, provider-managed secrets, model/provider policy, prompt-injection/data-loss controls, consent/opt-out enforcement, and separate execution approvals.
- UI screens must call these routes through the authenticated same-origin API; the standalone wireframe's local demo interactions are not a backend integration.

## Verification
Automated API tests cover each agent's draft creation, allowlisted principals, maker-checker separation, listing, unsupported intents, and the no-side-effect approval contract. CI must pass on the final commit before the implementation is considered verified.
