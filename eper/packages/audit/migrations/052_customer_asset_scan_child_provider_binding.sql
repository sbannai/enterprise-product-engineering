-- Pin each isolated scanner child identity to exactly one provider connection.
-- The connection ID is operator-provisioned identity metadata, not supplied over IPC.
-- Resolve it only for a currently leased claim owned by the authenticated child LOGIN.
BEGIN;

ALTER TABLE public.eper_customer_asset_scan_child_identities
  ADD COLUMN IF NOT EXISTS provider_connection_id varchar(128);

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
     WHERE conname = 'eper_customer_asset_scan_child_provider_connection_format'
       AND conrelid = 'public.eper_customer_asset_scan_child_identities'::regclass
  ) THEN
    ALTER TABLE public.eper_customer_asset_scan_child_identities
      ADD CONSTRAINT eper_customer_asset_scan_child_provider_connection_format
      CHECK (
        provider_connection_id IS NULL OR
        (length(btrim(provider_connection_id)) BETWEEN 1 AND 128
         AND provider_connection_id !~ '[[:cntrl:]]')
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
     WHERE conname = 'eper_customer_asset_scan_child_enabled_requires_provider_connection'
       AND conrelid = 'public.eper_customer_asset_scan_child_identities'::regclass
  ) THEN
    ALTER TABLE public.eper_customer_asset_scan_child_identities
      ADD CONSTRAINT eper_customer_asset_scan_child_enabled_requires_provider_connection
      CHECK (enabled = false OR provider_connection_id IS NOT NULL);
  END IF;
END
$constraint$;

-- Previously enabled identities have not been pinned to a provider connection.
-- Disable them until an operator provisions the exact connection binding.
UPDATE public.eper_customer_asset_scan_child_identities
   SET enabled = false, updated_at = clock_timestamp()
 WHERE enabled = true AND provider_connection_id IS NULL;

COMMENT ON COLUMN public.eper_customer_asset_scan_child_identities.provider_connection_id IS
  'Operator-provisioned exact provider connection for this scanner child identity; never accepted from job IPC or a customer object reference.';

CREATE OR REPLACE FUNCTION public.eper_resolve_customer_asset_scan_child_provider_binding(
  p_tenant_id varchar,
  p_application_id varchar,
  p_asset_id uuid,
  p_worker_id varchar,
  p_scanner_service_id varchar,
  p_claim_generation bigint,
  p_spiffe_id text
)
RETURNS TABLE (provider_connection_id varchar)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = on
AS $function$
DECLARE
  v_identity public.eper_customer_asset_scan_child_identities%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR length(btrim(p_tenant_id)) < 1 OR length(p_tenant_id) > 128
     OR p_application_id IS NULL OR length(btrim(p_application_id)) < 1 OR length(p_application_id) > 128
     OR p_asset_id IS NULL
     OR p_worker_id IS NULL OR length(btrim(p_worker_id)) < 2 OR length(p_worker_id) > 128
     OR p_scanner_service_id IS NULL OR length(btrim(p_scanner_service_id)) < 2 OR length(p_scanner_service_id) > 128
     OR p_claim_generation IS NULL OR p_claim_generation < 1
     OR p_spiffe_id IS NULL OR length(btrim(p_spiffe_id)) < 12 OR length(p_spiffe_id) > 512
     OR p_spiffe_id !~ '^spiffe://[a-z0-9.-]+/[A-Za-z0-9._~!$&()*+,;=:@%/-]+$'
     OR position('..' in p_spiffe_id) > 0 THEN
    RAISE EXCEPTION 'EPER_CUSTOMER_ASSET_SCAN_CHILD_INPUT_INVALID';
  END IF;

  SELECT i.* INTO v_identity
    FROM public.eper_customer_asset_scan_child_identities AS i
   WHERE i.login_role = session_user::name
     AND i.enabled = true;

  IF NOT FOUND
     OR v_identity.tenant_id <> p_tenant_id
     OR v_identity.application_id <> p_application_id
     OR v_identity.worker_id <> p_worker_id
     OR v_identity.scanner_service_id <> p_scanner_service_id
     OR v_identity.spiffe_id <> p_spiffe_id
     OR v_identity.provider_connection_id IS NULL THEN
    RAISE EXCEPTION 'EPER_CUSTOMER_ASSET_SCAN_CHILD_IDENTITY_DENIED';
  END IF;

  PERFORM pg_catalog.set_config('eper.tenant_id', p_tenant_id, true);
  PERFORM pg_catalog.set_config('eper.application_id', p_application_id, true);

  IF NOT EXISTS (
    SELECT 1
      FROM public.eper_customer_asset_scan_jobs AS j
     WHERE j.tenant_id = p_tenant_id
       AND j.application_id = p_application_id
       AND j.asset_id = p_asset_id
       AND j.state = 'leased'
       AND j.lease_owner = p_worker_id
       AND j.lease_expires_at > pg_catalog.clock_timestamp()
       AND j.claim_generation = p_claim_generation
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT v_identity.provider_connection_id;
END
$function$;

ALTER FUNCTION public.eper_resolve_customer_asset_scan_child_provider_binding(
  varchar, varchar, uuid, varchar, varchar, bigint, text
) OWNER TO eper_customer_asset_scan_child_definer;
REVOKE ALL ON FUNCTION public.eper_resolve_customer_asset_scan_child_provider_binding(
  varchar, varchar, uuid, varchar, varchar, bigint, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eper_resolve_customer_asset_scan_child_provider_binding(
  varchar, varchar, uuid, varchar, varchar, bigint, text
) TO eper_customer_asset_scan_child_access;

COMMIT;
