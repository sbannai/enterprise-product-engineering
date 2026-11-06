# EPER Render controlled UAT runbook

## Target
- Service URL: `https://eper-b01-uat-lj3n.onrender.com`
- Deployment: Render web service using `eper/Dockerfile`
- Cost guardrail: no AWS resources. Confirm the Render service remains on the Free plan before deployment changes.
- Scope guardrail: do not change the 228-requirement registry or the 38-chapter baseline.

## 1. Confirm deployment health
Call `GET /health`. Expected HTTP 200 JSON:
`{"status":"ok","service":"eper-api","buildId":"<40-character commit SHA>"}`
Compare `buildId` with the commit actually deployed in Render. A 503 means the build ID is not configured/resolved; do not proceed to capability tests.

## 2. Public UAT capability endpoint
The route is `POST /uat/requirements/{requirementId}/execute`. It is deliberately disabled by default and is separate from the local-only `/internal/...` route.

Do not enable this route on a public endpoint unless the team explicitly accepts the risk of a long-lived bearer token being used against a public URL. Prefer a private service, access-control proxy, or short-lived identity integration before business UAT. This simple bearer-token mode is only for controlled synthetic technical smoke tests, not production or sensitive data.

To enable only for a controlled test window, configure these Render environment variables:
- `EPER_UAT_API_ENABLED=true`
- `EPER_UAT_API_TOKEN`: generate a unique random secret of at least 32 characters; never commit or paste it into tickets/logs.
- `EPER_UAT_TENANT_ID`: isolated synthetic tenant, e.g. `uat-test-tenant`
- `EPER_UAT_PRINCIPAL_ID`: dedicated synthetic test principal, e.g. `uat-test-operator`
- `EPER_UAT_PUBLIC_ENDPOINT_ACK=I_ACCEPT_PUBLIC_BEARER_UAT_RISK`

Set `EPER_UAT_API_ENABLED=false` immediately after the controlled test window. Never use production/customer data. Use a unique token and rotate/revoke it after testing. Render Free has ephemeral storage and the current capability services use in-memory stores; evidence/state is not durable across restarts or deploys.

## 3. Six capability family smoke
Use the six-family cases in `eper/uat/run-six-family-local-uat.ps1` as the payload/assertion reference. For Render, send those same synthetic payloads to `/uat/requirements/REQ-46301/execute` through `REQ-46306` with header `Authorization: Bearer <token>` and JSON body `{"payload": ...}`. Do not put the token in a command-line transcript or checked-in script. Capture per-case requirement ID, family (XX01–XX06), HTTP status, assertion result, UTC timestamp and deployed build ID. Treat missing/invalid credentials, non-2xx responses, wrong family, or failed assertions as FAIL/BLOCKED.

## 4. Evidence and acceptance boundary
- Technical smoke evidence must identify the deployed build SHA and all six family outcomes.
- Keep evidence synthetic and avoid logging bearer tokens or sensitive payloads.
- The 228-requirement/38-chapter automated pilot results are not business acceptance.
- Business UAT remains blocked until approved tester identities/roles, approved test data, audit/report access, and formal sign-off are available.
- Never report a family or requirement as accepted solely because the HTTP request returned 200.

## 5. Rollback
1. Set `EPER_UAT_API_ENABLED=false` and redeploy/restart if required.
2. Revoke/rotate the token; remove the public acknowledgement variable.
3. Confirm POST to the UAT route returns 404 and `GET /health` still reports the deployed build.
4. Archive the smoke evidence and record rollback time.
