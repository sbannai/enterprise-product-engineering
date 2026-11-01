#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must identify a disposable local/test source database}"
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL must identify a separate disposable restore database}"

url_host() {
  local remainder="${1#*://}"
  local authority="${remainder%%/*}"
  local host_port="${authority##*@}"
  if [[ "$host_port" =~ ^\[([0-9a-fA-F:]+)\](:[0-9]+)?$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
  else
    printf '%s' "${host_port%%:*}"
  fi
}

url_database() {
  local remainder="${1#*://}"
  local path="${remainder#*/}"
  path="${path%%\?*}"
  path="${path%%#*}"
  printf '%s' "$path"
}

source_host="$(url_host "$DATABASE_URL")"
target_host="$(url_host "$RESTORE_DATABASE_URL")"
source_name="$(url_database "$DATABASE_URL")"
target_name="$(url_database "$RESTORE_DATABASE_URL")"

case "$source_host" in localhost|127.0.0.1|::1) ;; *) echo "EPER_BACKUP_RESTORE_REFUSES_NON_LOOPBACK_SOURCE" >&2; exit 1 ;; esac
case "$target_host" in localhost|127.0.0.1|::1) ;; *) echo "EPER_BACKUP_RESTORE_REFUSES_NON_LOOPBACK_TARGET" >&2; exit 1 ;; esac
[[ "$source_name" =~ (test|ci|sandbox) ]] || { echo "EPER_BACKUP_RESTORE_SOURCE_MUST_BE_DISPOSABLE" >&2; exit 1; }
[[ "$target_name" =~ (restore|test|sandbox) ]] || { echo "EPER_BACKUP_RESTORE_TARGET_MUST_BE_DISPOSABLE" >&2; exit 1; }
[[ "$target_name" =~ ^[A-Za-z0-9_]+$ && "$source_name" != "$target_name" ]] || { echo "EPER_BACKUP_RESTORE_TARGET_DATABASE_INVALID" >&2; exit 1; }
for tool in pg_dump pg_restore psql; do
  command -v "$tool" >/dev/null 2>&1 || { echo "EPER_BACKUP_RESTORE_TOOL_MISSING:$tool" >&2; exit 1; }
done

backup_file="${BACKUP_FILE:-$(mktemp /tmp/eper-postgres-backup-XXXXXX.dump)}"
cleanup() { rm -f "$backup_file"; }
trap cleanup EXIT

# Add one deterministic, non-sensitive sentinel to the disposable source DB.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS eper_backup_restore_smoke (
  smoke_id TEXT PRIMARY KEY,
  marker TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO eper_backup_restore_smoke (smoke_id, marker)
VALUES ('eper-restore-smoke-v1', 'source-data-preserved')
ON CONFLICT (smoke_id) DO UPDATE SET marker = EXCLUDED.marker;
SQL

pg_dump --format=custom --no-owner --no-acl --file="$backup_file" "$DATABASE_URL"
test -s "$backup_file"
pg_restore --list "$backup_file" >/dev/null

restore_db_name="$target_name"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$restore_db_name\""
pg_restore --exit-on-error --no-owner --no-acl --dbname="$RESTORE_DATABASE_URL" "$backup_file"

source_tables="$(psql "$DATABASE_URL" -Atqc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")"
restored_tables="$(psql "$RESTORE_DATABASE_URL" -Atqc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")"
source_ledgers="$(psql "$DATABASE_URL" -Atqc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%schema_migrations'")"
restored_ledgers="$(psql "$RESTORE_DATABASE_URL" -Atqc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%schema_migrations'")"
sentinel="$(psql "$RESTORE_DATABASE_URL" -Atqc "SELECT count(*) FROM eper_backup_restore_smoke WHERE smoke_id='eper-restore-smoke-v1' AND marker='source-data-preserved'")"

if [[ "$source_tables" -lt 1 || "$source_tables" != "$restored_tables" ]]; then
  echo "EPER_BACKUP_RESTORE_TABLE_COUNT_MISMATCH source=$source_tables restored=$restored_tables" >&2
  exit 1
fi
if [[ "$source_ledgers" != "$restored_ledgers" ]]; then
  echo "EPER_BACKUP_RESTORE_MIGRATION_LEDGER_COUNT_MISMATCH source=$source_ledgers restored=$restored_ledgers" >&2
  exit 1
fi
if [[ "$sentinel" != "1" ]]; then
  echo "EPER_BACKUP_RESTORE_SENTINEL_MISSING" >&2
  exit 1
fi

echo "EPER_POSTGRES_BACKUP_RESTORE_SMOKE=PASS"
echo "Source and restored base-table counts: $source_tables"
echo "Migration ledger table counts: $source_ledgers"
