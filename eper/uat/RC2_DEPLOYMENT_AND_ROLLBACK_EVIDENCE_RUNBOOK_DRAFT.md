# EPER RC4 Deployment and Rollback Evidence Runbook (Draft)

**Status:** DRAFT — owner approval required  
**Scope:** EPER / EM-OPS Chapters 463–500; RC4 source baseline `5eb3c757d7407b6ecb4bf96fa762103a3463d905`; candidate packaging workflow commit `13dc7fa94a4c0998d94e22a361d6e5790eee1183`  
**Candidate artifact:** `EPER-0.1.0-RC4-13dc7fa94a4c0998d94e22a361d6e5790eee1183`  
**Build evidence:** [RC4 corrected workflow run](https://github.com/sbannai/enterprise-product-engineering/actions/runs/37211275119)  
**Not an authorization:** This runbook does not approve deployment, business UAT, production release, or final acceptance.

## 1. Required named owners and approvals

Complete this section before scheduling a deployment. Blank fields mean HOLD.

| Control | Required entry | Status |
|---|---|---|
| Service owner | Name, team, contact | PENDING |
| Deployment operator | Named person and backup | PENDING |
| Rollback decision owner | Named person authorized to call rollback | PENDING |
| Business UAT owner | Named business approver | PENDING |
| Release approver | Named authorized approver and approval reference | PENDING |
| Target environment | Environment name and approved HTTPS host (no credentials) | PENDING |
| Change/ticket reference | Approved change record | PENDING |
| Maintenance window | Start/end with timezone | PENDING |
| Backup/snapshot owner | Named owner and recovery point | PENDING |
| Monitoring/support owner | On-call route and escalation path | PENDING |

Do not put passwords, access tokens, private keys, or secret values in this document, issues, or workflow inputs.

## 2. Pre-deployment go/no-go checklist

Deployment remains **NO-GO** until every applicable item is evidenced and approved.

- [ ] Release approver confirms RC4 source baseline `5eb3c757d7407b6ecb4bf96fa762103a3463d905`, packaging workflow commit `13dc7fa94a4c0998d94e22a361d6e5790eee1183`, artifact ID `11306122539`, and digest `sha256:7206c96e72ce6a3279cd62063a694c3c4ecc558d92ae66622297a988f87e075a`.
- [ ] Artifact has been downloaded from the successful workflow and its embedded SHA-256 check passes.
- [ ] Change record, target environment, maintenance window, and operator are approved.
- [ ] Environment configuration and secret availability are verified by the authorized operator without exposing secret values.
- [ ] Data migration/compatibility impact is reviewed; backup/snapshot and recovery point are recorded if applicable.
- [ ] Monitoring, alert thresholds, log access, incident contact, and support coverage are verified.
- [ ] Rollback trigger thresholds and decision authority are agreed before deployment.
- [ ] Rollback steps have been rehearsed in a non-production environment and evidence is linked.
- [ ] Required protected-environment approvals are configured and granted.
- [ ] Business UAT plan, approved test cases, test data, and business sign-off route are ready.
- [ ] No unresolved release-blocking defects or exceptions remain, or each has an explicit authorized disposition.

## 3. Deployment execution record

Complete during the approved change window; do not pre-fill results.

| Field | Recorded value |
|---|---|
| Change/ticket and approval reference | PENDING |
| Target environment and approved host reference | PENDING |
| Operator and independent witness | PENDING |
| Start/end timestamps (UTC) | PENDING |
| RC4 artifact ID and digest | `11306122539`; `sha256:7206c96e72ce6a3279cd62063a694c3c4ecc558d92ae66622297a988f87e075a` (reconfirm against downloaded artifact before execution) |
| Source baseline / packaging workflow commit | `5eb3c757d7407b6ecb4bf96fa762103a3463d905` / `13dc7fa94a4c0998d94e22a361d6e5790eee1183` |
| Pre-deployment backup/snapshot reference | PENDING / N/A with approved rationale |
| Deployment command/procedure version | PENDING |
| Deployment result and log/evidence reference | NOT EXECUTED |
| Post-deployment health/build-ID preflight | NOT EXECUTED |
| Monitoring observation window and results | NOT EXECUTED |
| Incidents/deviations and disposition | NONE RECORDED |
| Operator and approver sign-off references | PENDING |

## 4. Post-deployment verification

The authorized UAT target preflight must use the service-owner-approved HTTPS base URL, safe health path, exact expected build ID, and protected `eper-business-uat` environment. Configure `UAT_ALLOWED_HOST` to the approved host. Do not run against an unapproved target.

A successful preflight proves only endpoint reachability and exact build-ID match. It is not business UAT or acceptance evidence.

- [ ] Preflight workflow passed and its artifact is retained.
- [ ] Application logs, metrics, alerts, and support route reviewed.
- [ ] Authorized smoke checks passed.
- [ ] Business UAT executed against approved cases and data by authorized testers.
- [ ] Defects recorded, triaged, and dispositioned.
- [ ] Business owner signed acceptance or documented rejection/hold.
- [ ] Release authority issued an explicit go/no-go decision.

## 5. Rollback decision and execution

**Trigger examples to agree in advance:** health/build-ID mismatch after the agreed retry window; sustained critical error/availability threshold breach; data-integrity concern; security/tenant-isolation defect; critical business flow failure; or rollback explicitly ordered by the release/incident authority. The service owner must set actual thresholds and time windows—these examples are not approved thresholds.

1. Operator raises incident/change record and freezes further rollout.
2. Rollback decision owner records GO/NO-GO for rollback, timestamp, rationale, and evidence.
3. Execute the approved, rehearsed rollback procedure for this deployment platform. This repository does not currently define platform-specific deployment or rollback commands; do not improvise them from this template.
4. Restore application/version/configuration and data only as covered by the approved recovery plan.
5. Verify health, expected restored build ID, critical monitoring, and data integrity.
6. Notify business owner, service owner, support/on-call, and release approver.
7. Attach logs, timestamps, artifact/build IDs, incident/change references, and operator/witness sign-offs.
8. Keep release status HOLD until incident disposition and any new release authorization are approved.

| Rollback record field | Value |
|---|---|
| Trigger and timestamp | PENDING |
| Decision owner and decision reference | PENDING |
| Procedure/version and rehearsal evidence | PENDING |
| Last known good artifact/build ID | PENDING |
| Execution operator/witness | PENDING |
| Start/end timestamps and result | NOT EXECUTED |
| Health/data-integrity verification | NOT EXECUTED |
| Incident/change reference | PENDING |
| Service/business owner acknowledgement | PENDING |

## 6. Current evidence boundary

Known technical evidence:
- RC4 build succeeded and the downloaded artifact was checked for GitHub ZIP digest, embedded tarball checksum, package/lockfile version `0.1.0-rc4`, and release metadata: [run](https://github.com/sbannai/enterprise-product-engineering/actions/runs/37211275119).
- The earlier RC4 artifact is superseded for current-candidate purposes; use only the corrected RC4 artifact ID/digest above for any future approved change.
- The automated 228-requirement pilot passed, but business acceptance and formal UAT remain NOT EXECUTED.

Not yet evidenced:
- Approved deployment target and environment configuration.
- Named deployment/rollback owners and release approver.
- Platform-specific deployment/rollback implementation and successful rollback rehearsal.
- Live authorized target preflight.
- Business UAT results and sign-off.
- Production release authorization.

**Current decision: HOLD / NOT AUTHORIZED FOR DEPLOYMENT.** Update this decision only when source evidence and authorized approvals are attached.