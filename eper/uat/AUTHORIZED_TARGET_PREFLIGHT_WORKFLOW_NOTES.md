# EPER Authorized UAT Target Preflight — Workflow Notes

The workflow `.github/workflows/eper-authorized-uat-target-preflight.yml` is manually dispatched and runs under the protected GitHub Environment `eper-business-uat`.

## Required repository/environment setup
- Create the `eper-business-uat` environment and configure required reviewers/branch restrictions in accordance with the team's approved control policy.
- Set environment variable `UAT_ALLOWED_HOST` to the exact approved host, including a non-default port when used. Do not include scheme, path, credentials, query, or fragment.
- Have the service owner approve the HTTPS base URL, safe health path, expected deployed build ID, and JSON field name.
- Use an unauthenticated, read-only health endpoint that returns JSON and exposes the deployed build identifier.

## Dispatch
Actions → **EPER Authorized UAT Target Preflight** → Run workflow. Supply the approved base URL, health path (default `/health`), expected build ID, and JSON field (default `buildId`). Environment protection may require approval before the job starts.

## Safety behavior
- Requires HTTPS and exact host allowlist match.
- Rejects URL credentials, query/fragment, extra base paths, and health paths containing a host/query/fragment.
- Does not follow redirects.
- Uses a bounded timeout and response-size limit.
- Artifacts contain target host, status, timings, and expected/actual build ID, not the response body or credentials.
- Fails if the endpoint is unreachable, does not return 2xx JSON, or its build ID does not exactly match.

## Evidence boundary
A PASS proves only that the approved health endpoint was reachable and reported the expected build identifier at the recorded time. It does not establish OAuth login, roles/tenant boundaries, approved test data, audit/report access, business functionality, requirement acceptance, release authorization, G9 freeze, or G10 certification.

No live preflight has been run by creating this workflow. Environment configuration and the owner-approved target remain external prerequisites.
