-- Tenant-bound queue-age metric for the dedicated upload-expiry worker.
-- Returns only an age in milliseconds; no session or asset identifiers leave SQL.
BEGIN;

CREATE OR REPLACE FUNCTION public.eper_customer_asset_upload_expiry_queue_age_ms(
  p_tenant_id varchar
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  oldest_expired_at timestamptz;
BEGIN
  IF p_tenant_id IS NULL OR length(btrim(p_tenant_id)) < 1
     OR length(p_tenant_id) > 128 THEN
    RAISE EXCEPTION 'EPER_CUSTOMER_ASSET_EXPIRY_TENANT_INVALID';
  END IF;
  IF pg_catalog.current_setting('eper.tenant_id', true) IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'EPER_CUSTOMER_ASSET_EXPIRY_TENANT_CONTEXT_MISMATCH';
  END IF;
  PERFORM pg_catalog.set_config('eper.application_id', '', true);

  SELECT min(s.expires_at)
    INTO oldest_expired_at
    FROM public.eper_customer_asset_upload_sessions AS s
   WHERE s.tenant_id = p_tenant_id
     AND s.upload_status IN ('reserved', 'initiated', 'in_progress')
     AND s.expires_at <= pg_catalog.clock_timestamp();

  IF oldest_expired_at IS NULL THEN RETURN 0; END IF;
  RETURN greatest(0, floor(extract(epoch FROM (pg_catalog.clock_timestamp() - oldest_expired_at)) * 1000))::bigint;
END
$function$;

ALTER FUNCTION public.eper_customer_asset_upload_expiry_queue_age_ms(varchar)
  OWNER TO eper_customer_asset_upload_expiry_access;
REVOKE ALL ON FUNCTION public.eper_customer_asset_upload_expiry_queue_age_ms(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eper_customer_asset_upload_expiry_queue_age_ms(varchar)
  TO eper_customer_asset_upload_expiry_worker_access;

COMMIT;
