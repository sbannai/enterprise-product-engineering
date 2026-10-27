# EPER database resilience and failover policy

## Decision

EPER will use PostgreSQL as its transactional system of record and must have an independently recoverable PostgreSQL target. The first fallback is a PostgreSQL HA standby / managed failover target plus verified backups and point-in-time recovery—not an automatic switch to SQLite, MySQL, or an unrelated database engine.

A second engine is not a safe hot fallback for payments, receipts, tenant configuration, workflow state, and the audit chain unless a separately tested replication and reconciliation design exists. Do not add dual writes or silently change the database URL on connection failure.

## Failure modes and response

| Failure | Required behavior |
| --- | --- |
| Short network interruption / connection reset | Bounded retries only for safe, idempotent operations; return a standardized retryable error when exhausted. |
| Primary unavailable, standby healthy | Use the database provider's tested HA failover mechanism. Ensure the old primary is fenced before writes resume. |
| Primary data corruption / accidental deletion | Restore to a clean target using point-in-time recovery; validate schema, critical records, and audit integrity before routing writes. |
| Standby unavailable | Continue on healthy primary while alerting, if policy permits; do not claim HA protection until redundancy is restored. |
| No writable, verified database | Fail closed for writes and sensitive reads. Do not fall back to local memory, files, or a stale replica. |
| Unknown commit outcome for payment/receipt | Reconcile by idempotency key and durable transaction state before retrying. Never assume a timeout means rollback. |

## Failover safety rules

1. Only one writable primary may accept transactional writes at a time. Fence or revoke the former primary before promoting another target.
2. Failover is controlled by the database HA service or an explicitly authorized operator; application request handlers must not promote databases.
3. Keep credentials, TLS settings, network policy, schema migrations, and extensions compatible on the recovery target.
4. Keep database endpoints in deployment secrets/configuration. Never commit credentials or print connection strings in logs.
5. The app must not bypass tenant/application authorization, idempotency, durable audit, or approval requirements during an outage.
6. Do not acknowledge a payment, receipt, audit event, or workflow mutation until its durable commit is confirmed. If commit outcome is unknown, return a retryable/indeterminate response and reconcile safely.
7. Use a read replica for reads only when the endpoint explicitly tolerates replication lag. Do not route payment state, authorization, audit verification, or read-after-write workflows to a potentially stale replica.
8. Schema changes must be backward-compatible across the failover window; migration and rollback procedures must be documented and rehearsed.

## Recovery objectives

These are proposed objectives to approve and validate—not current guarantees:

- Initial target RPO: 0 for acknowledged financial and audit transactions, using an HA configuration that actually guarantees this within its documented failure model. If the selected replication mode cannot guarantee zero loss, document the exposure and obtain explicit risk acceptance.
- Initial target RTO: 15 minutes for database service restoration, subject to a timed rehearsal.
- Backups: encrypted, access-controlled, separated from the primary failure domain, and protected from routine application credentials.
- Backup frequency and retention: choose based on the approved RPO, legal/audit retention, and storage cost; verify point-in-time recovery if the selected platform supports it.

## Failover and restore runbook

1. Alert and declare the incident; capture timestamps, affected services, and the last known healthy database state.
2. Stop or fence writes to the old primary. Do not promote a standby while split-brain is possible.
3. Check standby health, replication lag, WAL/backup status, schema version, and the database provider's failover recommendation.
4. Promote through the approved HA control plane or restore a recovery target. Do not modify application configuration to point at an unverified endpoint.
5. Run read-only integrity checks, tenant-boundary checks, migration/version checks, and audit-chain verification. Reconcile in-flight payment/receipt operations using durable idempotency keys.
6. Run health/readiness checks and a small authorized smoke test. Resume writes only after the single-writer condition and data integrity are established.
7. Monitor error rate, connection pool saturation, lock waits, payment reconciliation, audit integrity, and tenant-scoped API behavior.
8. Record timeline, RPO/RTO achieved, data-loss assessment, decisions, and follow-up actions. Rebuild redundancy before closing the incident.

## Required rehearsal tests

- Kill primary connectivity and verify bounded failure responses and recovery.
- Promote a standby with the old primary fenced; verify there is only one writer.
- Restore a backup/PITR copy into an isolated target and validate schema plus audit integrity.
- Exercise a timeout with an unknown transaction commit and verify idempotent reconciliation.
- Verify tenants cannot access each other's data after failover.
- Verify credentials and configuration are not exposed in logs.
- Record observed RPO/RTO and evidence; a documented procedure alone is not proof of successful recovery.

## Current implementation status

The API currently requires a configured PostgreSQL connection and fails startup when the database URL is absent or invalid. This is intentional fail-closed behavior, not a complete HA implementation. This document defines the recovery design; it does not claim that a standby, automated promotion, backup schedule, restore rehearsal, or RPO/RTO objective is already configured or verified.

No chargeable cloud database, replica, backup tier, or other resource may be provisioned without explicit authorization.
