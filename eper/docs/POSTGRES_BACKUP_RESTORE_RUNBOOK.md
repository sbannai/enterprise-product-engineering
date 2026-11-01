# EPER PostgreSQL Backup, Restore and Recovery Runbook

**Scope:** Local development and disposable PostgreSQL integration environments.  
**Target engine:** PostgreSQL 16.  
**Production status:** Operational design only; no production backup destination, encryption-key custody, retention schedule, RPO/RTO or restore certification is established by this runbook.  
**Cloud spend:** No cloud resource is required or provisioned.

## 1. Principles

- Treat PostgreSQL as the durable source of truth for EPER transactional state.
- Back up with a consistent PostgreSQL-native logical backup (`pg_dump`) and restore with `pg_restore`.
- Preserve schema, migration ledgers, indexes, constraints, RLS policies, triggers and data.
- Never run a restore into a live/shared database. Restore into a separately named, isolated target and validate before any controlled cutover.
- Never put connection strings, passwords, tokens or backup encryption keys in logs, chat, PR bodies or committed files.
- A successful backup command is not proof of recoverability. A restore drill and post-restore validation are required.

## 2. Local disposable restore drill

Prerequisites: PostgreSQL client tools compatible with the server (`psql`, `pg_dump`, `pg_restore`), and a disposable local PostgreSQL source DB already migrated.

Example:

```bash
export DATABASE_URL='postgres://eper:local-only-password@127.0.0.1:5432/eper_test'
export RESTORE_DATABASE_URL='postgres://eper:local-only-password@127.0.0.1:5432/eper_restore_test'
bash scripts/postgres-backup-restore-smoke.sh
```

The script:
1. Refuses non-loopback hosts and source/target names that do not identify disposable test/CI/sandbox databases.
2. Writes a deterministic, non-sensitive sentinel record to the source database.
3. Creates a custom-format `pg_dump` backup.
4. Creates a separate restore database and restores with `pg_restore`.
5. Compares public base-table counts and migration-ledger table counts.
6. Verifies the sentinel data survived restore.

Expected marker: `EPER_POSTGRES_BACKUP_RESTORE_SMOKE=PASS`.

The script deliberately does not drop the restore database. To repeat the drill, remove only the disposable restore database after verifying its name and that no one else is using it:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c 'DROP DATABASE eper_restore_test'
```

Never copy this destructive command to a shared or production environment.

## 3. Automated CI restore drill

The `EPER Fresh-Clone Developer Setup` workflow runs the restore smoke after migrations and live PostgreSQL tests, using an ephemeral PostgreSQL 16 service. The source database is `eper_test`; the restore target is `eper_restore_test`. Both are destroyed with the CI job.

A passing run proves that the tested commit can create and restore a logical backup of that ephemeral schema/data set. It does not prove off-host durability, encryption at rest, point-in-time recovery, disaster recovery, or production RPO/RTO.

## 4. Production operational controls still required

Before production backup/recovery can be certified, the owner and operations team must define and evidence:

1. **RPO/RTO:** approved maximum data loss and recovery time by environment and business capability.
2. **Backup schedule:** full/incremental or continuous WAL strategy, frequency and consistency requirements.
3. **Encryption:** in-transit and at-rest encryption, key ownership, rotation, escrow/recovery and separation of duties.
4. **Storage:** independent failure domain, access-controlled off-host storage, retention lock/immutability where required, and no single-host-only backup.
5. **Retention:** approved daily/weekly/monthly retention, legal hold and secure deletion policy.
6. **Monitoring:** backup age, last successful backup, size anomalies, WAL/archive lag, restore-test age and failure alerts.
7. **Restore procedure:** restore to isolated infrastructure, verify schema/migrations/RLS/grants/audit chain, run application smoke tests, and obtain release-owner approval before traffic cutover.
8. **Incident command:** named primary/secondary operators, escalation, evidence preservation, customer communications and post-incident review.
9. **Access controls:** least-privilege backup/restore identities; restore must not silently bypass RLS or audit protections.
10. **Evidence:** immutable run logs, source SHA, database identity (no credentials), backup checksum, restore target, verification results and operator sign-off.

## 5. Recovery acceptance

A production recovery exercise is PASS only when:
- A backup from the declared recovery point is restored into an isolated target.
- Required schema, migration versions, RLS policies, constraints, triggers and grants are verified.
- Audit integrity and representative tenant/application isolation tests pass.
- Application health and critical customer journeys pass against the restored target.
- Measured recovery time and recovered data point meet approved RTO/RPO.
- The owner/operations reviewer records the result and any exceptions.

Until these controls are configured and exercised, production backup/restore remains an open operational capability—not a completed product feature.
