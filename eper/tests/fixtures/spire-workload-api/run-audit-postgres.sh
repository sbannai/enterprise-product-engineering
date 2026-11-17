#!/usr/bin/env bash
set -Eeuo pipefail
set +x

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$ROOT/compose.yaml"
PROJECT="eper-spire-459-local"
: "${SPIRE_FIXTURE_DIR:?run.sh must export the disposable fixture directory}"

compose() {
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" "$@"
}

echo "Starting disposable PostgreSQL for the authoritative EPER audit migration chain"
compose up -d audit-postgres

READY=0
for _ in $(seq 1 45); do
  if compose exec -T audit-postgres pg_isready -U postgres -d eper_scanner_fixture >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 2
done
if [[ "$READY" -ne 1 ]]; then
  echo "FAIL: disposable PostgreSQL did not become ready" >&2
  compose logs --no-color audit-postgres >&2 || true
  exit 1
fi

echo "Running focused verifier-bound credential issuer contract tests"
compose run --build --rm --entrypoint node audit-migrations \
  --test tests/customer-asset-scan-child-database-credential-issuer.test.mjs

DATABASE_URL="postgres://postgres:eper_fixture_only_password@audit-postgres:5432/eper_scanner_fixture?sslmode=verify-full&sslrootcert=/fixture/ca.crt"

run_migrations() {
  compose run --build --rm \
    -e "EPER_AUDIT_DATABASE_URL=$DATABASE_URL" \
    --entrypoint node audit-migrations scripts/migrate-audit.mjs
}

echo "Applying the complete ordered audit migration chain"
run_migrations

EXPECTED_COUNT="$(find "$ROOT/../../../../eper/packages/audit/migrations" -maxdepth 1 -type f -regextype posix-extended -regex '.*/[0-9]{3}_[a-z0-9_]+\.sql' | wc -l | tr -d ' ')"
ACTUAL_COUNT="$(compose exec -T audit-postgres psql -U postgres -d eper_scanner_fixture -Atc 'SELECT count(*) FROM eper_audit_schema_migrations')"
if [[ "$ACTUAL_COUNT" != "$EXPECTED_COUNT" ]]; then
  echo "FAIL: migration ledger count $ACTUAL_COUNT does not match checked-in migration count $EXPECTED_COUNT" >&2
  exit 1
fi
echo "PASS: migration ledger contains all $ACTUAL_COUNT checked-in audit migrations"

CONTEXT_FUNCTION="$(compose exec -T audit-postgres psql -U postgres -d eper_scanner_fixture -Atc "SELECT to_regprocedure('public.eper_resolve_customer_asset_scan_child_context(uuid,bigint)') IS NOT NULL")"
CHILD_EXECUTE="$(compose exec -T audit-postgres psql -U postgres -d eper_scanner_fixture -Atc "SELECT has_function_privilege('eper_customer_asset_scan_child_access', 'public.eper_resolve_customer_asset_scan_child_context(uuid,bigint)', 'EXECUTE')")"
CHILD_DIRECT_READ="$(compose exec -T audit-postgres psql -U postgres -d eper_scanner_fixture -Atc "SELECT has_table_privilege('eper_customer_asset_scan_child_access', 'public.eper_customer_assets', 'SELECT')")"

if [[ "$CONTEXT_FUNCTION" != "t" || "$CHILD_EXECUTE" != "t" || "$CHILD_DIRECT_READ" != "f" ]]; then
  echo "FAIL: scanner child SQL boundary is not in the expected post-migration state" >&2
  echo "context_function=$CONTEXT_FUNCTION child_execute=$CHILD_EXECUTE child_direct_asset_read=$CHILD_DIRECT_READ" >&2
  exit 1
fi
echo "PASS: authenticated (uuid,bigint) context resolver exists and is executable"
echo "PASS: scanner child role has no direct SELECT privilege on customer asset table"

echo "Re-running migration runner to verify checksum ledger idempotence"
run_migrations
FINAL_COUNT="$(compose exec -T audit-postgres psql -U postgres -d eper_scanner_fixture -Atc 'SELECT count(*) FROM eper_audit_schema_migrations')"
if [[ "$FINAL_COUNT" != "$EXPECTED_COUNT" ]]; then
  echo "FAIL: migration ledger changed after idempotent second run" >&2
  exit 1
fi
echo "PASS: second migration run preserved the $FINAL_COUNT-row checksum ledger"

echo "Provisioning one disposable LOGIN bound to the fixture SPIFFE identity"
compose exec -T audit-postgres psql -v ON_ERROR_STOP=1 -U postgres -d eper_scanner_fixture <<'SQL'
DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'eper_fixture_scanner') THEN
    CREATE ROLE eper_fixture_scanner LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$role$;
GRANT eper_customer_asset_scan_child_access TO eper_fixture_scanner;
INSERT INTO public.eper_customer_asset_scan_child_identities
  (login_role, tenant_id, application_id, worker_id, scanner_service_id,
   enabled, spiffe_id, provider_connection_id)
VALUES
  ('eper_fixture_scanner', 'fixture-tenant', 'fixture-application',
   'fixture-scanner:worker-01', 'fixture-scanner', true,
   'spiffe://example.org/ns/scanner/sa/customer-asset-scan-child',
   'fixture-provider-connection')
ON CONFLICT (login_role) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  application_id = EXCLUDED.application_id,
  worker_id = EXCLUDED.worker_id,
  scanner_service_id = EXCLUDED.scanner_service_id,
  enabled = EXCLUDED.enabled,
  spiffe_id = EXCLUDED.spiffe_id,
  provider_connection_id = EXCLUDED.provider_connection_id,
  updated_at = clock_timestamp();
SQL

echo "Authenticating the dedicated LOGIN with a dynamically issued SVID-bound client certificate"
compose run --build --rm \
  -e PGHOST=audit-postgres \
  -e PGPORT=5432 \
  -e PGDATABASE=eper_scanner_fixture \
  -e PGUSER=eper_fixture_scanner \
  scanner-signer-socket-probe
echo "PASS: dynamic signer-issued certificate authenticated the dedicated PostgreSQL LOGIN"
echo "PASS: mTLS LOGIN invoked the session_user-bound resolver with EXECUTE-only access"
