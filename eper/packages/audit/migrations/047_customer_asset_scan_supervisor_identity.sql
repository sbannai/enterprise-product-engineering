-- Authenticated identity boundary for the customer-asset scan supervisor.
-- This migration deliberately provisions no LOGIN credentials and grants no
-- business-table mutation rights. Operator-managed mappings bind one dedicated
-- supervisor LOGIN to one exact tenant/application/worker/scanner tuple.
BEGIN;

DO $roles$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
     WHERE rolname = 'eper_customer_asset_scan_supervisor_definer'
  ) THEN
    CREATE ROLE eper_customer_asset_scan_supervisor_definer
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
     WHERE rolname = 'eper_customer_asset_scan_supervisor_access'
  ) THEN
    CREATE ROLE eper_customer_asset_scan_supervisor_access
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$roles$;

ALTER ROLE eper_customer_asset_scan_supervisor_definer
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE eper_customer_asset_scan_supervisor_access
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

GRANT USAGE ON SCHEMA public TO eper_customer_asset_scan_supervisor_definer;
GRANT USAGE ON SCHEMA public TO eper_customer_asset_scan_supervisor_access;

CREATE TABLE IF NOT EXISTS public.eper_customer_asset_scan_supervisor_identities (
  login_role name PRIMARY KEY,
  tenant_id varchar(128) NOT NULL
    CHECK (length(btrim(tenant_id)) BETWEEN 1 AND 128),
  application_id varchar(128) NOT NULL
    CHECK (length(btrim(application_id)) BETWEEN 1 AND 128),
  worker_id varchar(128) NOT NULL
    CHECK (length(btrim(worker_id)) BETWEEN 2 AND 128),
  scanner_service_id varchar(128) NOT NULL
    CHECK (length(btrim(scanner_service_id)) BETWEEN 2 AND 128),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CHECK (pg_catalog.left(worker_id, pg_catalog.length(scanner_service_id) + 1)
    = scanner_service_id || ':')
);

COMMENT ON TABLE public.eper_customer_asset_scan_supervisor_identities IS
  'Operator-managed exact mapping from a dedicated scanner-supervisor LOGIN to one tenant, application, worker and scanner service.';

REVOKE ALL ON public.eper_customer_asset_scan_supervisor_identities FROM PUBLIC;
REVOKE ALL ON public.eper_customer_asset_scan_supervisor_identities
  FROM eper_customer_asset_scan_supervisor_access;
GRANT SELECT ON public.eper_customer_asset_scan_supervisor_identities
  TO eper_customer_asset_scan_supervisor_definer;

COMMIT;
