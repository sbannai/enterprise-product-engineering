# EPER Deployment Platform Decision Record

**Status:** DECISION REQUIRED — NO PLATFORM SELECTED  
**Related candidate:** RC4 artifact ID `11306122539`  
**Candidate source baseline:** `5eb3c757d7407b6ecb4bf96fa762103a3463d905`  
**Candidate packaging workflow commit:** `13dc7fa94a4c0998d94e22a361d6e5790eee1183`  
**Related runbook:** [RC4 deployment and rollback evidence runbook](./RC2_DEPLOYMENT_AND_ROLLBACK_EVIDENCE_RUNBOOK_DRAFT.md)

## Purpose

Select the real deployment platform and target before authoring executable deployment or rollback steps. Repository inspection found a release-candidate build/package workflow and an authorized UAT target preflight workflow, but no checked-in platform-specific deployment configuration (for example, Docker/Kubernetes manifests, Terraform, a Procfile, or a deployment script). This is a repository observation; infrastructure may be managed outside this repository.

## Decision owner input required

| Decision field | Required value | Status |
|---|---|---|
| Application/service owner | Named owner and team | PENDING |
| Platform decision authority | Named approver and approval reference | PENDING |
| Target platform | Exact platform/service (not just cloud provider) | NOT SELECTED |
| UAT environment | Environment name and owner-approved HTTPS host | NOT PROVIDED |
| Production environment | Environment identifier; keep credentials out of this record | NOT PROVIDED |
| Deployment mechanism | Platform-native deploy, container, VM/service, or other approved method | NOT SELECTED |
| Artifact delivery | How artifact ID `11306122539` is retrieved and verified | PENDING |
| Configuration/secrets owner | Named owner and approved secret/configuration mechanism | PENDING |
| Persistent data and migrations | Data stores, migration/compatibility policy, backup and restore owner | PENDING |
| Rollback mechanism | Platform-specific steps and last-known-good release identifier | PENDING |
| Health and acceptance checks | Approved endpoint, expected build ID, business smoke checks and thresholds | PENDING |
| Change record and maintenance window | Approved reference and timezone-aware window | PENDING |
| Operations/support owner | Monitoring, on-call route and escalation path | PENDING |

## Platform selection criteria

The decision authority should choose a platform only after confirming:

1. It is the intended, owner-approved hosting target for this application.
2. It supports a controlled promotion of the immutable RC artifact, with artifact digest verification.
3. Runtime, network, configuration, secrets and persistent data requirements are understood.
4. A documented rollback can restore the last-known-good application and address any incompatible data migration.
5. Health checks, logs, monitoring, access controls and operational ownership are available.
6. UAT and production are separated, and deployment permissions/approvals are enforceable.
7. A non-production deployment and rollback rehearsal can be performed and evidenced.

## Options to evaluate — not recommendations or selections

- **Existing managed application/service platform:** use only if this is already the approved hosting target and its runtime/build contract matches the artifact.
- **Container platform:** consider only if a reviewed container build/runtime definition and platform operations are available.
- **VM or self-managed service:** consider only if service supervision, configuration, networking, backup, monitoring and rollback ownership are documented.
- **Other existing organizational platform:** prefer only where the service owner confirms it is the authoritative target and supplies its deployment runbook.

Do not select a platform based solely on convenience or the existence of a cloud account. Do not add deployment commands until the platform decision and target contract are approved.

## Required decision response

The service owner/platform authority should fill in:

- **Decision:** APPROVE / REJECT / RETURN FOR CLARIFICATION
- **Selected platform and exact service:**
- **UAT target identifier and approved HTTPS host:**
- **Artifact promotion method:**
- **Rollback method and last-known-good reference:**
- **Data migration/restore treatment:**
- **Health and business smoke criteria:**
- **Service owner / deployment operator / rollback decision owner:**
- **Change record / approval reference / effective date:**

## Gate disposition

**HOLD — NOT AUTHORIZED FOR DEPLOYMENT.** RC4 artifact integrity/version consistency has been verified, but no target platform decision, deployment rehearsal, rollback rehearsal, live preflight, business UAT approval, G9 freeze or release authorization is established by this record. Update the status only when the decision authority provides evidence.
