# EPER PostgreSQL failover drill checklist

**Purpose:** prove that the configured PostgreSQL high-availability/recovery path can recover service without split-brain, unaccounted financial writes, tenant-boundary regressions, or audit-integrity failures.

**Safety:** this is an operator-run drill for an isolated UAT/staging environment. Do not run destructive steps against production. No cloud resources are provisioned by this checklist. A runbook is not evidence that a drill has passed.

## 1. Drill record

- Drill ID:
- Date/time (UTC):
- Environment and database provider:
- EPER commit/build ID:
- Primary endpoint identifier (no credentials):
- Standby/recovery endpoint identifier (no credentials):
- Operator:
- Independent reviewer:
- Approved change/incident reference:
- Approved RPO:
- Approved RTO:
- Result: NOT RUN / PASS / FAIL
- Evidence location:

## 2. Entry gates — all must pass

- [ ] Written authorization exists for the selected non-production target and test window.
- [ ] Target is isolated from production and destructive testing cannot affect production traffic/data.
- [ ] Latest backup/PITR recovery point and retention are verified.
- [ ] Standby health and replication status/lag are recorded.
- [ ] Current schema/migration version is recorded for primary and standby.
- [ ] Database provider's documented failover and fencing procedure is available.
- [ ] Operator has least-privilege failover access; credentials are not pasted into logs or evidence.
- [ ] Baseline health, connection counts, payment/receipt state, and audit verification result are captured.
- [ ] Test fixtures include at least two tenants and known idempotency keys.
- [ ] Rollback/abort criteria and incident contacts are agreed.

**STOP:** if any entry gate is unchecked, do not initiate failover.

## 3. Controlled failover sequence

1. Capture baseline timestamps, API readiness, active sessions, replication lag, and current writer identity.
2. Pause synthetic test traffic. Create a small, approved set of uniquely identified test operations; record idempotency keys and confirmed commit outcomes.
3. Use the provider-approved process to fence the primary and promote the standby. Do not change the application's database endpoint until the provider confirms the single-writer condition.
4. Verify the old primary cannot accept writes. If it can, abort the drill and restore a safe single-writer topology before proceeding.
5. Point the isolated EPER deployment at the promoted target using the approved secret/configuration mechanism; restart only as required by the documented procedure.
6. Run readiness and schema checks. Confirm failures remain fail-closed until database connectivity and required prerequisites are healthy.
7. Reconcile every test payment/receipt by durable idempotency key. For operations with an unknown commit outcome, query durable state before retrying.
8. Verify audit-chain integrity and confirm each required business mutation has its corresponding durable audit event.
9. Run tenant-isolation checks across the test tenants and application scopes.
10. Resume synthetic traffic only after the checks above pass. Observe latency, errors, pool saturation, lock waits, and recovery stability for the agreed observation period.

## 4. Backup/PITR restore drill (separate from HA promotion)

- [ ] Restore the selected backup/PITR point to an isolated recovery target.
- [ ] Record requested recovery timestamp and actual recovered data boundary.
- [ ] Verify schema/migration version and required extensions.
- [ ] Verify representative tenant-scoped records and configuration.
- [ ] Verify audit-chain integrity and retention evidence.
- [ ] Reconcile payment/receipt records against the test ledger or approved source of truth.
- [ ] Capture elapsed restore time and observed data-loss window.
- [ ] Destroy or securely retain the isolated test target according to policy.

Do not run this restore over the active primary.

## 5. Exit gates — all must pass

- [ ] Exactly one writable primary is confirmed.
- [ ] EPER readiness becomes healthy only after all required dependencies pass.
- [ ] Tenant/application isolation tests pass.
- [ ] No acknowledged test transaction is missing; ambiguous outcomes are reconciled.
- [ ] No duplicate payment/receipt result is created by retries.
- [ ] Audit verification passes with no unexplained gaps/forks.
- [ ] API and worker queues recover without unbounded retries or manual data edits.
- [ ] Measured RTO is recorded and compared with the approved target.
- [ ] Observed RPO/data-loss window is recorded and compared with the approved target.
- [ ] Monitoring confirms stable recovery for the agreed observation period.
- [ ] Independent reviewer signs the evidence.

Any failed exit gate means **FAIL**. Do not describe the fallback as production-ready. Capture the failure, restore a safe single-writer state, and create remediation work.

## 6. Evidence table

| Evidence | Required value |
| --- | --- |
| Primary fenced | Timestamp + provider evidence |
| Standby promoted | Timestamp + provider evidence |
| Single-writer verified | Check/result |
| EPER readiness restored | HTTP status + timestamp + build ID |
| Schema readiness | Result |
| Audit verification | Result + evidence reference |
| Tenant isolation | Test run/reference |
| Payment/receipt reconciliation | Counts, discrepancies, outcome |
| RPO observed | Duration / data boundary |
| RTO observed | Duration |
| Reviewer disposition | Name/role, timestamp, PASS/FAIL |

Never store passwords, full connection strings, payment secrets, or sensitive customer payloads in the drill evidence.

## 7. Current status

**NOT RUN.** Repository CI tests verify application behavior and test fixtures; they do not perform an actual provider-level standby promotion or backup restore. No live failover has been attempted, no recovery target has been provisioned, and no RPO/RTO has been measured. Provisioning chargeable infrastructure requires explicit authorization.
