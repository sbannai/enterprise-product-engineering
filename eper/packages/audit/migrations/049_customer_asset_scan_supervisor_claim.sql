-- Protected, generation-fenced claim operation for the scanner supervisor.
-- Exhausted-lease recovery remains a separate transaction/operation.
BEGIN;

GRANT SELECT (
  tenant_id, application_id, upload_session_id, asset_id, correlation_id,
  attempt_count, max_attempts, available_at, created_at, state, lease_expires_at
) ON public.eper_customer_asset_scan_jobs
  TO eper_customer_asset_scan_supervisor_definer;
GRANT UPDATE (
  state, lease_owner, lease_expires_at, attempt_count, claim_generation, updated_at
) ON public.eper_customer_asset_scan_jobs
  TO eper_customer_asset_scan_supervisor_definer;

CREATE OR REPLACE FUNCTION public.eper_claim_customer_asset_scan_jobs(
  p_tenant_id varchar,
  p_application_id varchar,
  p_worker_id varchar,
  p_scanner_service_id varchar,
  p_limit integer,
  p_lease_ms integer
)
RETURNS TABLE (
  upload_session_id uuid,
  asset_id uuid,
  correlation_id varchar,
  attempt_count integer,
  lease_expires_at timestamptz,
  claim_generation bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = on
AS $function$
BEGIN
  IF p_tenant_id IS NULL OR length(btrim(p_tenant_id)) NOT BETWEEN 1 AND 128
     OR p_application_id IS NULL OR length(btrim(p_application_id)) NOT BETWEEN 1 AND 128
     OR p_worker_id IS NULL OR length(btrim(p_worker_id)) NOT BETWEEN 2 AND 128
     OR p_scanner_service_id IS NULL OR length(btrim(p_scanner_service_id)) NOT BETWEEN 2 AND 128
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 50
     OR p_lease_ms IS NULL OR p_lease_ms < 5000 OR p_lease_ms > 900000
     OR pg_catalog.left(p_worker_id, pg_catalog.length(p_scanner_service_id) + 1)
          <> p_scanner_service_id || ':' THEN
    RAISE EXCEPTION 'EPER_CUSTOMER_ASSET_SCAN_SUPERVISOR_CLAIM_INPUT_INVALID';
  END IF;

  IF NOT pg_catalog.pg_has_role(
       session_user, 'eper_customer_asset_scan_supervisor_access', 'MEMBER'
     ) OR NOT EXISTS (
       SELECT 1
         FROM public.eper_customer_asset_scan_supervisor_identities AS i
        WHERE i.login_role = session_user::name
          AND i.tenant_id = p_tenant_id
          AND i.application_id = p_application_id
          AND i.worker_id = p_worker_id
          AND i.scanner_service_id = p_scanner_service_id
          AND i.enabled = true
     ) THEN
    RAISE EXCEPTION 'EPER_CUSTOMER_ASSET_SCAN_SUPERVISOR_IDENTITY_DENIED';
  END IF;

  PERFORM pg_catalog.set_config('eper.tenant_id', p_tenant_id, true);
  PERFORM pg_catalog.set_config('eper.application_id', p_application_id, true);

  RETURN QUERY
  WITH candidates AS (
    SELECT j.tenant_id, j.upload_session_id
      FROM public.eper_customer_asset_scan_jobs AS j
     WHERE j.tenant_id = p_tenant_id
       AND j.application_id = p_application_id
       AND j.attempt_count < j.max_attempts
       AND j.available_at <= pg_catalog.clock_timestamp()
       AND (
         j.state = 'pending'
         OR (j.state = 'leased' AND j.lease_expires_at <= pg_catalog.clock_timestamp())
       )
     ORDER BY j.available_at, j.created_at
     FOR UPDATE SKIP LOCKED
     LIMIT p_limit
  )
  UPDATE public.eper_customer_asset_scan_jobs AS j
     SET state = 'leased',
         lease_owner = p_worker_id,
         lease_expires_at = pg_catalog.clock_timestamp()
           + (p_lease_ms::bigint * interval '1 millisecond'),
         attempt_count = j.attempt_count + 1,
         claim_generation = j.claim_generation + 1,
         updated_at = pg_catalog.clock_timestamp()
    FROM candidates AS c
   WHERE j.tenant_id = c.tenant_id
     AND j.upload_session_id = c.upload_session_id
  RETURNING j.upload_session_id, j.asset_id, j.correlation_id,
            j.attempt_count, j.lease_expires_at, j.claim_generation;
END
$function$;

GRANT CREATE ON SCHEMA public TO eper_customer_asset_scan_supervisor_definer;
ALTER FUNCTION public.eper_claim_customer_asset_scan_jobs(
  varchar, varchar, varchar, varchar, integer, integer
) OWNER TO eper_customer_asset_scan_supervisor_definer;
REVOKE CREATE ON SCHEMA public FROM eper_customer_asset_scan_supervisor_definer;

REVOKE ALL ON FUNCTION public.eper_claim_customer_asset_scan_jobs(
  varchar, varchar, varchar, varchar, integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eper_claim_customer_asset_scan_jobs(
  varchar, varchar, varchar, varchar, integer, integer
) TO eper_customer_asset_scan_supervisor_access;

COMMIT;
