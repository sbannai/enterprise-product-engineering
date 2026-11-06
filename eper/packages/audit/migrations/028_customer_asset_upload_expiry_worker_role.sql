-- Dedicated login-group role for the upload-expiry worker.
-- The worker can invoke only the tenant-bound expiry routine and append audit
-- events. It has no direct access to asset/session tables, payments or providers.
BEGIN;

DO $roles$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
     WHERE rolname = 'eper_customer_asset_upload_expiry_worker_access'
  ) THEN
    CREATE ROLE eper_customer_asset_upload_expiry_worker_access
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$roles$;

ALTER ROLE eper_customer_asset_upload_expiry_worker_access
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

GRANT USAGE ON SCHEMA public TO eper_customer_asset_upload_expiry_worker_access;

-- The function's definer role performs the tenant-scoped session transition.
-- The worker itself cannot SELECT or UPDATE upload sessions directly.
GRANT EXECUTE ON FUNCTION public.eper_expire_customer_asset_upload_sessions(varchar, integer)
  TO eper_customer_asset_upload_expiry_worker_access;

-- Minimal privileges needed by appendAuditEventInTransaction and
-- assertAuditStoreReady. Audit history remains append-only.
GRANT INSERT ON public.eper_audit_events
  TO eper_customer_asset_upload_expiry_worker_access;
GRANT SELECT ON public.eper_audit_chain_head
  TO eper_customer_asset_upload_expiry_worker_access;
GRANT UPDATE (last_event_hash, updated_at) ON public.eper_audit_chain_head
  TO eper_customer_asset_upload_expiry_worker_access;

COMMIT;
