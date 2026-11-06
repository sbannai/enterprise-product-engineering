-- Extend the tenant-bound expiry routine with the original expiry timestamp
-- so the worker can report the oldest processed queue age without reading sessions.
BEGIN;

DROP FUNCTION public.eper_expire_customer_asset_upload_sessions(varchar, integer);

CREATE FUNCTION public.eper_expire_customer_asset_upload_sessions(
  p_tenant_id varchar,
  p_limit integer
)
RETURNS TABLE (
  application_id varchar,
  upload_session_id uuid,
  asset_id uuid,
  expires_at timestamptz
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
         AND s.upload_status IN ('reserved', 'initiated', 'in_progress')
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
       AND s.upload_status IN ('reserved', 'initiated', 'in_progress')
       AND s.expires_at <= pg_catalog.clock_timestamp()
    RETURNING s.application_id, s.upload_session_id, s.asset_id, s.expires_at;
END
$function$;

GRANT CREATE ON SCHEMA public TO eper_customer_asset_upload_expiry_access;
ALTER FUNCTION public.eper_expire_customer_asset_upload_sessions(varchar, integer)
  OWNER TO eper_customer_asset_upload_expiry_access;
REVOKE CREATE ON SCHEMA public FROM eper_customer_asset_upload_expiry_access;

REVOKE ALL ON FUNCTION public.eper_expire_customer_asset_upload_sessions(varchar, integer)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eper_expire_customer_asset_upload_sessions(varchar, integer)
  TO eper_customer_asset_access, eper_customer_asset_upload_expiry_worker_access;

COMMIT;
