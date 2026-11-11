-- Dedicated non-login privilege group for the customer asset upload-expiry process.
-- The process can invoke the tenant-bound definer routine and append audit only.
BEGIN;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
                  WHERE rolname = 'eper_customer_asset_upload_expiry_worker_access') THEN
    CREATE ROLE eper_customer_asset_upload_expiry_worker_access
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$roles$;

ALTER ROLE eper_customer_asset_upload_expiry_worker_access
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO eper_customer_asset_upload_expiry_worker_access;

-- The expiry function is owned by the separate NOLOGIN definer role. The
-- worker login cannot directly inspect or mutate customer asset/session rows.
GRANT EXECUTE ON FUNCTION public.eper_expire_customer_asset_upload_sessions(varchar, integer, uuid)
  TO eper_customer_asset_upload_expiry_worker_access;
GRANT INSERT ON public.eper_audit_events
  TO eper_customer_asset_upload_expiry_worker_access;
GRANT SELECT ON public.eper_audit_chain_head
  TO eper_customer_asset_upload_expiry_worker_access;
GRANT UPDATE (last_event_hash, updated_at) ON public.eper_audit_chain_head
  TO eper_customer_asset_upload_expiry_worker_access;

COMMIT;
