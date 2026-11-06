-- Dedicated runtime privileges for the customer-asset upload-expiry worker.
-- A database operator provisions a LOGIN role and grants membership in this
-- NOLOGIN group. The worker never reuses the payment/API runtime role.
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

-- The security-definer function owns the narrowly scoped tenant-only expiry
-- operation. The worker role can invoke it but cannot query or mutate sessions.
GRANT EXECUTE ON FUNCTION public.eper_expire_customer_asset_upload_sessions(varchar, integer)
  TO eper_customer_asset_upload_expiry_worker_access;

-- Audit append only: no event reads, updates or deletes. The global chain writer
-- needs to lock/read the singleton and advance only its hash and timestamp.
GRANT INSERT ON public.eper_audit_events
  TO eper_customer_asset_upload_expiry_worker_access;
GRANT SELECT ON public.eper_audit_chain_head
  TO eper_customer_asset_upload_expiry_worker_access;
GRANT UPDATE (last_event_hash, updated_at) ON public.eper_audit_chain_head
  TO eper_customer_asset_upload_expiry_worker_access;

COMMIT;
