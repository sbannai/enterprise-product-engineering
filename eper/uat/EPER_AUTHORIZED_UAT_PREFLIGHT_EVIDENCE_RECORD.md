# EPER Authorized UAT Target Preflight — Evidence Record

**Record status:** TEMPLATE — NOT EXECUTED  
**Control:** UAT target reachability and deployed build identity only  
**Workflow:** .github/workflows/eper-authorized-uat-target-preflight.yml  
**Evidence generator:** eper/uat/scripts/authorized_uat_preflight.py

> Do not fill execution-result fields until an authorized operator has dispatched the protected workflow against a service-owner-approved target. Do not use a guessed URL, example host, credentials, or sensitive query parameters.

## 1. Authorization and target contract

| Field | Required value | Record |
|---|---|---|
| Service / application name | Owner-confirmed | PENDING |
| Service owner | Name and approval reference | PENDING |
| Authorized operator | Name / GitHub identity | PENDING |
| Change / ticket reference | Approved change ID | PENDING |
| UAT base URL | Owner-approved HTTPS URL; no credentials/path/query/fragment | NOT PROVIDED |
| Health path | Approved read-only unauthenticated path | NOT PROVIDED |
| Allowed host | Exact UAT_ALLOWED_HOST environment variable value | UNVERIFIED |
| Expected build ID | Approved deployed commit/build identifier | NOT PROVIDED |
| JSON build-ID field | Approved response field (workflow default: buildId) | NOT CONFIRMED |
| Protected environment | eper-business-uat | CONFIGURATION UNVERIFIED |
| Required reviewers / branch restrictions | Confirmed by repository administrator | UNVERIFIED |
| Execution authorization | Approval to run target preflight | PENDING |

## 2. Pre-dispatch go/no-go checklist

Mark each item only after verifying it from the authoritative source.

- [ ] Service owner has approved the exact HTTPS base URL and health path.
- [ ] Repository administrator confirmed eper-business-uat exists.
- [ ] Required reviewers and deployment branch restrictions are configured and appropriate.
- [ ] Environment variable UAT_ALLOWED_HOST matches the approved hostname exactly (including non-default port if applicable).
- [ ] Expected build ID and JSON field are confirmed against the selected deployment.
- [ ] Operator and change/ticket approval are recorded.
- [ ] Health endpoint is safe, read-only, unauthenticated, and returns JSON with a string build ID.
- [ ] No credentials, tokens, secrets, or sensitive data are present in inputs.

**Dispatch decision:** HOLD until all applicable items above are verified and approved.

## 3. Execution record — fill only after the workflow runs

| Field | Value |
|---|---|
| GitHub Actions run URL / run ID | NOT EXECUTED |
| Workflow run timestamp (UTC) | NOT EXECUTED |
| Workflow source commit | Record run's exact head_sha |
| Operator / approver | PENDING |
| Result artifact | Expected: uat-target-health-result.json |
| Artifact ID / URL | NOT GENERATED |
| Artifact digest, if available | NOT GENERATED |
| Overall preflight result | NOT EXECUTED |
| HTTP status / elapsed time | NOT EXECUTED |
| Target host recorded by workflow | NOT EXECUTED |
| Expected build ID | NOT PROVIDED |
| Actual build ID | NOT EXECUTED |
| Failure reason / follow-up | PENDING |

## 4. Result interpretation

- **PASS:** approved HTTPS health endpoint returned 2xx JSON and the configured build-ID field exactly matched the expected string.
- **FAIL:** stop; preserve the run and artifact, notify the service owner, and resolve the recorded failure before retrying.
- **No run / no artifact:** no target verification has occurred. Do not report the environment as healthy.

A PASS establishes only endpoint reachability and build identity at the recorded time. It does **not** establish OAuth authentication, roles or tenant isolation, approved test data, business functionality, requirement acceptance, business UAT, G9 traceability freeze, release authorization, or G10 certification.

## 5. Separate business UAT authorization gate

Before any business UAT execution, record and verify separately:

- [ ] Approved requirements baseline and measurable acceptance criteria.
- [ ] Named and authorized testers; approved OAuth login and role/tenant scope.
- [ ] Approved test data reference and reset/cleanup approach.
- [ ] Access to target-system audit logs and required business reports.
- [ ] Business owner approval to execute the named UAT batch.
- [ ] Actual test steps, expected/actual results, pass/fail/not-run outcome, evidence links, defects/exceptions, and decision owner captured.
- [ ] Explicit business acceptance or rejection recorded by an authorized approver.

## 6. Current checkpoint (2026-10-04)

- Automated chapter pilot: 38/38 chapters passed; 248/248 tests passed; 228 requirements classified as AUTOMATED_PILOT_TEST_PASS_NOT_BUSINESS_UAT.
- Local pilot HTTP smoke: 28/28 checks passed across 9 chapters with HTTP apps in scope.
- Authorized live target preflight: **NOT EXECUTED**.
- Protected environment / reviewer configuration / allowlist: **UNVERIFIED** through the available repository interface.
- Business UAT and formal acceptance: **NOT EXECUTED / PENDING AUTHORIZED EVIDENCE**.
- Deployment and release authorization: **NOT AUTHORIZED**.

These checkpoint figures refer to the linked automation run and are not a substitute for the execution evidence fields above.

## 7. Evidence links

- Workflow: https://github.com/sbannai/enterprise-product-engineering/actions/workflows/eper-authorized-uat-target-preflight.yml
- Workflow notes: https://github.com/sbannai/enterprise-product-engineering/blob/main/eper/uat/AUTHORIZED_TARGET_PREFLIGHT_WORKFLOW_NOTES.md
- Protected environment setup: https://github.com/sbannai/enterprise-product-engineering/blob/main/eper/uat/PROTECTED_UAT_ENVIRONMENT_SETUP.md
- Latest 228-requirement pilot run on the recorded current-main checkpoint: https://github.com/sbannai/enterprise-product-engineering/actions/runs/37208462411
- Verified RC4 candidate artifact ID: `11306122539`; artifact ZIP digest: `sha256:7206c96e72ce6a3279cd62063a694c3c4ecc558d92ae66622297a988f87e075a`.
- **Important:** the RC4 artifact ID/digest is not automatically the runtime build ID returned by the target health endpoint. The service owner must confirm the deployed build identifier and the exact JSON field before preflight.
