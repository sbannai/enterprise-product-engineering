# Protected Business UAT Environment Setup Runbook

**Purpose:** Configure the GitHub controls needed to run the authorized UAT target reachability/build-identity preflight. This is setup guidance, not proof that a target is deployed or approved.

## 1. Create the protected environment

In the repository, open **Settings → Environments → New environment** and create:

- Environment name: `eper-business-uat`
- Add required reviewers if supported by the repository plan and require approval before deployment/preflight.
- Restrict deployment branches to the approved maintenance branch(es), preferably `main` for the merged workflow.
- Keep environment access limited to authorized maintainers.

## 2. Configure the approved host allowlist

Within **Settings → Environments → eper-business-uat → Environment variables**, add:

- Name: `UAT_ALLOWED_HOST`
- Value: the exact approved host including port if non-default, e.g. `uat.example.org` (example only; do not use this as a real target).

The workflow compares this value to the host from the supplied base URL. Do not include scheme, path, credentials, query strings, or fragments in the variable. Do not use a wildcard.

## 3. Confirm the target contract before dispatch

The authorized UAT service owner must provide and approve all of the following outside this document:

- HTTPS base URL whose host exactly matches `UAT_ALLOWED_HOST`.
- A safe, unauthenticated health/readiness path (default `/health`).
- The expected deployed build/commit identifier.
- The JSON field name in the health response containing that identifier (default `buildId`).

The health endpoint must return a 2xx response and JSON where the selected field is a string exactly matching the expected build identifier. The workflow does not follow redirects. Never put credentials, OAuth tokens, passwords, client secrets, or sensitive query parameters in the URL or workflow inputs.

## 4. Dispatch the preflight

Open **Actions → EPER Authorized UAT Target Preflight → Run workflow** and provide the approved base URL, health path, expected build identifier, and JSON field name. Ensure the run is authorized under the protected environment. Review the workflow log and artifact:

- `uat-target-health-result.json`
- `uat-target-preflight.json`

Artifacts intentionally record metadata rather than response bodies. Treat the artifact as evidence of reachability/build identity only.

## 5. Do not infer business acceptance

A successful preflight does **not** verify OAuth login, user roles/tenant scope, test-data approval, audit/report visibility, functional behavior, business UAT, acceptance, or sign-off.

Before starting B01 (Chapters 463–470; 48 requirements), separately verify:

1. Authorized tester identity and live OAuth login through the approved identity provider.
2. Approved roles and tenant scope.
3. Approved test-data reference.
4. Access to target-system audit logs and business reports.
5. Business owner authorization to execute UAT.
6. Evidence capture for actual steps, expected/actual results, outcome, evidence reference, defect/exception, and business decision.

Keep the authoritative requirement register unchanged until execution evidence and authorized decisions exist. Never convert `NOT_RUN` or `PENDING` into a pass/acceptance based on CI or target health.

## Current state

This runbook does not populate the environment, set the allowlist, identify a live UAT target, or execute a probe. Those actions require authorized repository/environment administration and an approved target supplied by the service owner.
