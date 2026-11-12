-- First protected scanner-supervisor operation: generation-fenced lease renewal.
-- The authenticated LOGIN is bound to one exact operator-managed identity. The
-- SECURITY DEFINER owner has only the columns needed for this bounded update.
BEGIN;

GRANT USAGE ON SCHEMA public TO eper_customer_asset_scan_supervisor_definer;

GRANT SELECT ON public.eper_customer_asset_scan_supervisor_identities
  TO eper_customer_asset_scan_supervisor_definer;

GRANT SELECT (
  tenant_id, application_id, upload_session_id, state, lease_owner,
  lease_expires_at, claim_generation
) ON public.eper_customer_asset_scan_jobs
  TO eper_customer_asset_scan_supervisor_definer;
GRANT UPDATE (lease_expires_at, updated_at)
  ON public.eper_customer_asset_scan_jobs
  TO eper_customer_asset_scan_supervisor_definer;

CREATE OR REPLACE FUNCTION public.eper_renew_customer_asset_scan_lease(
  p_tenant_id varchar,
  p_application_id varchar,
  p_upload_session_id uuid,
  p_worker_id varchar,
  p_lease_ms integer,
  p_claim_generation bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = on
AS $function$
BEGIN
  IF p_tenant_id IS NULL OR length(btrim(p_tenant_id)) NOT BETWEEN 1 AND 128
     OR p_application_id IS NULL OR length(btrim(p_application_id)) NOT BETWEEN 1 AND 128
     OR p_worker_id IS NULL OR length(btrim(p_worker_id)) NOT BETWEEN 2 AND 128
     OR p_upload_session_id IS NULL
     OR p_claim_generation IS NULL OR p_claim_generation < 1
     OR p_lease_ms IS NULL OR p_lease_ms < 5000 OR p_lease_ms > 900000 THEN
    RAISE EXCEPTION 'EPER_CUSTOMER_ASSET_SCAN_SUPERVISOR_RENEW_INPUT_INVALID';
  END IF;

  -- session_user is the authenticated LOGIN, even while current_user is the
  -- SECURITY DEFINER owner. Caller-controlled GUCs do not establish authority.
  IF NOT pg_catalog.pg_has_role(
       session_user, 'eper_customer_asset_scan_supervisor_access', 'MEMBER'
     ) OR NOT EXISTS (
       SELECT 1
         FROM public.eper_customer_asset_scan_supervisor_identities AS i
        WHERE i.login_role = session_user::name
          AND i.tenant_id = p_tenant_id
          AND i.application_id = p_application_id
          AND i.worker_id = p_worker_id
          AND i.enabled = true
     ) THEN
    RAISE EXCEPTION 'EPER_CUSTOMER_ASSET_SCAN_SUPERVISOR_IDENTITY_DENIED';
  END IF;

  PERFORM pg_catalog.set_config('eper.tenant_id', p_tenant_id, true);
  PERFORM pg_catalog.set_config('eper.application_id', p_application_id, true);

  UPDATE public.eper_customer_asset_scan_jobs
     SET lease_expires_at = pg_catalog.clock_timestamp()
           + (p_lease_ms::bigint * interval '1 millisecond'),
         updated_at = pg_catalog.clock_timestamp()
   WHERE tenant_id = p_tenant_id
     AND application_id = p_application_id
     AND upload_session_id = p_upload_session_id
     AND state = 'leased'
     AND lease_owner = p_worker_id
     AND lease_expires_at > pg_catalog.clock_timestamp()
     AND claim_generation = p_claim_generation;

  RETURN FOUND;
END
$function$;

GRANT CREATE ON SCHEMA public TO eper_customer_asset_scan_supervisor_definer;
ALTER FUNCTION public.eper_renew_customer_asset_scan_lease(
  varchar, varchar, uuid, varchar, integer, bigint
) OWNER TO eper_customer_asset_scan_supervisor_definer;
REVOKE CREATE ON SCHEMA public FROM eper_customer_asset_scan_supervisor_definer;

REVOKE ALL ON FUNCTION public.eper_renew_customer_asset_scan_lease(
  varchar, varchar, uuid, varchar, integer, bigint
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eper_renew_customer_asset_scan_lease(
  varchar, varchar, uuid, varchar, integer, bigint
) TO eper_customer_asset_scan_supervisor_access;

COMMIT;
