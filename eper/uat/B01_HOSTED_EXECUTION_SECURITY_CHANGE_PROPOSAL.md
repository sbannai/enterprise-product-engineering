# B01 Hosted Execution Security Change Proposal

**Status:** Proposed — not approved for deployment or business execution  
**Scope:** B01, Chapters 463–470, 48 requirement cases  
**Constraint:** No chargeable AWS resources; do not weaken the current public endpoint posture.

## Current facts

- Render health evidence supplied by the operator reports `status: ok` and build ID `8825c0f8b9cf8a523e2943dbf2ce0a5a2d74b959`.
- CI six-family capability HTTP smoke passed on commit `a958a22ac0560003adc9a2f0e36a4da84df1ffdf`; this is local/loopback CI evidence, not hosted business acceptance.
- `EPER_UAT_API_ENABLED` is absent from the live service according to the operator and defaults to disabled in the application.
- The current public execution route requires a bearer token, tenant/principal configuration and a public-risk acknowledgement. Code comments explicitly warn not to enable it on a publicly reachable deployment.
- The B01 entry gate remains blocked until the controlled readiness evidence and formal session authorization are complete.

## Recommended change

Do **not** enable the existing public bearer-token route on the current Render service as a shortcut.

Preferred order:

1. Keep `EPER_UAT_API_ENABLED=false` (or absent) and `EPER_LOCAL_CAPABILITY_API=false` on the public Render service.
2. Continue non-mutating hosted preflight checks: HTTPS, `/health`, build identity, deployment logs and configuration review.
3. Run the existing six-family execution suite in the isolated CI runner, bound to the exact candidate commit and synthetic fixtures. Preserve the existing successful workflow evidence.
4. If true hosted business execution is required, implement a separate protected execution path before enabling any route. It must use an approved authenticated gateway or private network boundary, least-privilege test identity, tenant scoping, request/schema validation, rate limiting, audit correlation, secret storage outside source control, and explicit operator authorization. Do not expose a raw long-lived bearer token on an unrestricted public route.
5. Tie each hosted test result to the exact deployed build ID, synthetic dataset version, test identity/role, audit record reference and reset outcome. Redact credentials and personal data from evidence.
6. Obtain formal B01 session approval, then execute the existing 48-case pack in six waves. Do not infer business PASS from CI smoke results.

## Acceptance checks for the change

- Public `POST /uat/requirements/:requirementId/execute` remains unavailable until the protected design is approved and deployed.
- Unauthenticated, wrong-tenant, insufficient-role, malformed-body, unknown-requirement and replay/duplicate requests are rejected without unauthorized state changes.
- Authorized synthetic requests produce auditable outcomes with correlation IDs and documented persistence/reset behavior.
- All six capability families pass on the same candidate build in the protected target.
- Health/build identity, smoke results and logs agree on the exact deployed commit.
- Security tests and existing CI pass before any deployment.
- No AWS resources are provisioned and no Render environment values are changed by this proposal.
- Business UAT is marked executed only after explicit session authorization and real observations for the 48 cases.

## Decision record

This document is a technical recommendation only. It does not approve the security design, authorize public execution, approve requirement-level acceptance criteria, close readiness controls, or certify B01/G9/G10. Until the required approval and evidence exist, the decision remains **BLOCKED — DO NOT EXECUTE**.
