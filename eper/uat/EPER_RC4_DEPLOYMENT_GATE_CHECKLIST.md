# EPER RC4 Controlled Deployment Gate Checklist

**Decision:** HOLD — NOT AUTHORIZED FOR DEPLOYMENT  
**Candidate artifact ID:** `11306122539`  
**Candidate artifact name:** `EPER-0.1.0-RC4-13dc7fa94a4c0998d94e22a361d6e5790eee1183`  
**GitHub artifact ZIP digest:** `sha256:7206c96e72ce6a3279cd62063a694c3c4ecc558d92ae66622297a988f87e075a`  
**Embedded tarball SHA-256:** `93cdc02a685faa9c4385d2d0cb142dd8704a6743a36c805b36e5de4d02605bca`  
**Source baseline:** `5eb3c757d7407b6ecb4bf96fa762103a3463d905`  
**Packaging workflow commit:** `13dc7fa94a4c0998d94e22a361d6e5790eee1183`  
**Verification run:** [37211275119](https://github.com/sbannai/enterprise-product-engineering/actions/runs/37211275119)

> This checklist separates artifact verification from authorization to deploy. A passing build or checksum is not deployment approval, business UAT, G9 freeze, or production authorization. Do not mark a row PASS without the specified evidence and accountable owner.

## Gate A — Candidate identity and integrity

| ID | Acceptance criterion | Required evidence | Status |
|---|---|---|---|
| A1 | Exact RC4 artifact is selected | Artifact ID, name, source baseline and packaging commit match this record | PASS — recorded |
| A2 | Downloaded ZIP integrity is verified | Downloaded ZIP SHA-256 matches GitHub artifact digest | PASS — recorded |
| A3 | Embedded package integrity is verified | Embedded tarball checksum passes | PASS — recorded |
| A4 | Package version is consistent | `package.json`, lockfile root and lockfile package entry all equal `0.1.0-rc4` | PASS — recorded |
| A5 | Candidate remains clearly non-production | Metadata says NOT RELEASED / NOT PRODUCTION | PASS — recorded |

## Gate B — Platform and target authorization

| ID | Acceptance criterion | Required evidence | Status |
|---|---|---|---|
| B1 | Deployment platform and exact service are selected | Approved platform decision record, service owner and authority | BLOCKED — decision not supplied |
| B2 | UAT target is approved | HTTPS base URL, exact allowed host, safe health path and expected build ID supplied by owner | BLOCKED — not supplied |
| B3 | Protected environment and reviewers are configured | GitHub environment configuration and reviewer/approval evidence | NOT VERIFIED |
| B4 | Deployment method is executable and reviewed | Platform-specific procedure/workflow, access model and immutable artifact retrieval | BLOCKED — no repository implementation evidenced |
| B5 | Configuration and secrets are ready | Named owner, approved injection/storage method, required variables/secrets validated without exposing secret values | NOT VERIFIED |

## Gate C — Data safety and rollback

| ID | Acceptance criterion | Required evidence | Status |
|---|---|---|---|
| C1 | Last-known-good release is identified | Artifact/build ID and compatibility evidence | BLOCKED |
| C2 | Data migration and restore treatment is approved | Migration plan, backup/recovery point, compatibility/compensation plan and owner | BLOCKED |
| C3 | Rollback procedure is platform-specific | Reviewed executable steps, preconditions, abort conditions and decision owner | BLOCKED |
| C4 | Rollback thresholds are approved | Health/error/data-integrity thresholds and observation window approved by service owner | BLOCKED |
| C5 | Non-production rollback rehearsal passes | Timestamped execution logs, before/after build IDs, health/data checks and operator/witness sign-off | NOT EXECUTED |

## Gate D — UAT and operational readiness

| ID | Acceptance criterion | Required evidence | Status |
|---|---|---|---|
| D1 | Authorized target preflight passes | Approved target, allowlisted host, expected build ID and workflow evidence | NOT EXECUTED |
| D2 | Business UAT is approved | Requirement-level results, defect disposition and authorized business sign-off | BLOCKED — business approval pending |
| D3 | G9 traceability baseline is frozen | Approved reconciliation and explicit freeze decision | BLOCKED — not frozen |
| D4 | Monitoring and alerts are verified | Target-specific dashboards/alerts and test evidence | NOT VERIFIED |
| D5 | Support and escalation are staffed | Named operations/on-call owner, escalation route and handover acceptance | NOT VERIFIED |
| D6 | Change and release are authorized | Change record, approved window, release approver and explicit GO decision after all prerequisites | BLOCKED |

## Execution rules

1. Do not deploy while any required gate is BLOCKED, NOT VERIFIED, or NOT EXECUTED.
2. Run target preflight only after the service owner provides the approved HTTPS URL, exact allowed host, safe health path and expected build ID.
3. Never put credentials or secret values in this checklist, issue comments, or logs.
4. Preserve artifact ID and digest through promotion; do not rebuild or silently substitute a different artifact after approval.
5. If rollback is invoked, record trigger, decision owner, timestamps, candidate and restored build IDs, health/data checks, and final disposition.
6. Any artifact change invalidates the candidate identity checks and requires a fresh checklist/evidence set.

## Final decision

- **Artifact integrity:** VERIFIED for the candidate identified above.
- **Deployment authorization:** HOLD.
- **Business UAT / G9 freeze:** NOT APPROVED / NOT FROZEN.
- **Deployment and rollback rehearsal:** NOT EXECUTED.
- **Production release:** NOT AUTHORIZED.

Release authority must record an explicit GO only after every applicable gate has objective evidence and all blocking business/design approvals are resolved.
