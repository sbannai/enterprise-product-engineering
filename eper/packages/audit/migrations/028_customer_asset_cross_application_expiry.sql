-- Tenant-wide upload-expiry reconciliation for explicitly shared assets.
-- The function owner is NOLOGIN/NOBYPASSRLS and can update only expiry fields
-- after validating the caller's already-bound tenant context.
BEGIN;

DO $roles$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
     WHERE rolname = 'eper_customer_asset_upload_expiry_access'
  ) THEN
    CREATE ROLE eper_customer_asset_upload_expiry_access
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$roles$;

ALTER ROLE eper_customer_asset_upload_expiry_access
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

GRANT USAGE ON SCHEMA public TO eper_customer_asset_upload_expiry_access;
GRANT SELECT ON public.eper_customer_asset_upload_sessions
  TO eper_customer_asset_upload_expiry_access;
GRANT UPDATE (upload_status, updated_at) ON public.eper_customer_asset_upload_sessions
  TO eper_customer_asset_upload_expiry_access;

DROP POLICY IF EXISTS customer_asset_upload_expiry_tenant_scope
  ON public.eper_customer_asset_upload_sessions;
CREATE POLICY customer_asset_upload_expiry_tenant_scope
  ON public.eper_customer_asset_upload_sessions
  FOR ALL TO eper_customer_asset_upload_expiry_access
  USING (tenant_id = current_setting('eper.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('eper.tenant_id', true));

CREATE OR REPLACE FUNCTION public.eper_expire_customer_asset_upload_sessions(
  p_tenant_id varchar,
  p_limit integer
)
RETURNS TABLE (
  application_id varchar,
  upload_session_id uuid,
  asset_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF p_tenant_id IS NULL OR length(btrim(p_tenant_id)) < 1
     OR length(p_tenant_id) > 128 THEN
    RAISE EXCEPTION 'EPER_CUSTOMER_ASSET_EXPIRY_TENANT_INVALID';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'EPER_CUSTOMER_ASSET_EXPIRY_LIMIT_INVALID';
  END IF;
  IF pg_catalog.current_setting('eper.tenant_id', true) IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'EPER_CUSTOMER_ASSET_EXPIRY_TENANT_CONTEXT_MISMATCH';
  END IF;
  PERFORM pg_catalog.set_config('eper.application_id', '', true);

  RETURN QUERY
    WITH candidates AS (
      SELECT s.tenant_id, s.application_id, s.upload_session_id
        FROM public.eper_customer_asset_upload_sessions AS s
       WHERE s.tenant_id = p_tenant_id
         AND s.upload_status IN ('initiated', 'in_progress')
         AND s.expires_at <= pg_catalog.clock_timestamp()
       ORDER BY s.expires_at, s.application_id, s.upload_session_id
       LIMIT p_limit
       FOR UPDATE SKIP LOCKED
    )
    UPDATE public.eper_customer_asset_upload_sessions AS s
       SET upload_status = 'expired',
           updated_at = pg_catalog.clock_timestamp()
      FROM candidates AS c
     WHERE s.tenant_id = c.tenant_id
       AND s.application_id = c.application_id
       AND s.upload_session_id = c.upload_session_id
       AND s.upload_status IN ('initiated', 'in_progress')
       AND s.expires_at <= pg_catalog.clock_timestamp()
    RETURNING s.application_id, s.upload_session_id, s.asset_id;
END
$function$;

GRANT CREATE ON SCHEMA public TO eper_customer_asset_upload_expiry_access;
ALTER FUNCTION public.eper_expire_customer_asset_upload_sessions(varchar, integer)
  OWNER TO eper_customer_asset_upload_expiry_access;
REVOKE CREATE ON SCHEMA public FROM eper_customer_asset_upload_expiry_access;

REVOKE ALL ON FUNCTION public.eper_expire_customer_asset_upload_sessions(varchar, integer)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eper_expire_customer_asset_upload_sessions(varchar, integer)
  TO eper_customer_asset_access;

COMMIT;
