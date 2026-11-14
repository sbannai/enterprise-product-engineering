-- Bind the dedicated PostgreSQL LOGIN role to an operator-provisioned SPIFFE identity.
-- PostgreSQL authenticates the dedicated LOGIN role; the child independently fetches
-- its current-process SVID from the local SPIFFE Workload API. The scoped resolver
-- requires both the authenticated session_user mapping and that verified SVID value.
BEGIN;

ALTER TABLE public.eper_customer_asset_scan_child_identities
  ADD COLUMN IF NOT EXISTS spiffe_id text;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
     WHERE conname = 'eper_customer_asset_scan_child_spiffe_id_format'
       AND conrelid = 'public.eper_customer_asset_scan_child_identities'::regclass
  ) THEN
    ALTER TABLE public.eper_customer_asset_scan_child_identities
      ADD CONSTRAINT eper_customer_asset_scan_child_spiffe_id_format
      CHECK (
        spiffe_id IS NULL OR (
          length(spiffe_id) BETWEEN 12 AND 512
          AND spiffe_id ~ '^spiffe://[a-z0-9.-]+/[A-Za-z0-9._~!$&''()*+,;=:@%/-]+$'
          AND position('..' in spiffe_id) = 0
        )
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
     WHERE conname = 'eper_customer_asset_scan_child_enabled_requires_spiffe'
       AND conrelid = 'public.eper_customer_asset_scan_child_identities'::regclass
  ) THEN
    ALTER TABLE public.eper_customer_asset_scan_child_identities
      ADD CONSTRAINT eper_customer_asset_scan_child_enabled_requires_spiffe
      CHECK (enabled = false OR spiffe_id IS NOT NULL);
  END IF;
END
$constraint$;

-- Existing identities have no attested workload binding yet. Disable them until
-- an operator provisions the matching SPIFFE workload identity and client cert.
UPDATE public.eper_customer_asset_scan_child_identities
   SET enabled = false, updated_at = clock_timestamp()
 WHERE enabled = true AND spiffe_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS eper_customer_asset_scan_child_spiffe_id_unique
  ON public.eper_customer_asset_scan_child_identities (spiffe_id)
  WHERE spiffe_id IS NOT NULL;

COMMENT ON COLUMN public.eper_customer_asset_scan_child_identities.spiffe_id IS
  'Operator-provisioned SPIFFE identity whose workload certificate is mapped to this PostgreSQL LOGIN role; never accepted as a caller-supplied claim.';


-- Require the child to present the SPIFFE ID it fetched from its local Workload API.
-- The session_user lookup remains mandatory, so an identity string alone cannot
-- authorize a different login, tenant, application, worker, or scanner.
CREATE OR REPLACE FUNCTION public.eper_resolve_customer_asset_scan_child_input(
  p_tenant_id varchar,
  p_application_id varchar,
  p_asset_id uuid,
  p_worker_id varchar,
  p_scanner_service_id varchar,
  p_claim_generation bigint,
  p_spiffe_id text
)
RETURNS TABLE (
  asset_id uuid,
  storage_adapter_key varchar,
  storage_object_reference varchar,
  provider_upload_reference varchar,
  checksum_sha256 char(64),
  size_bytes bigint,
  mime_type varchar,
  attempt integer
)
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
     OR v_identity.spiffe_id <> p_spiffe_id THEN
    RAISE EXCEPTION 'EPER_CUSTOMER_ASSET_SCAN_CHILD_IDENTITY_DENIED';
  END IF;

  PERFORM pg_catalog.set_config('eper.tenant_id', p_tenant_id, true);
  PERFORM pg_catalog.set_config('eper.application_id', p_application_id, true);

  RETURN QUERY
    SELECT a.asset_id, a.storage_adapter_key, a.storage_object_reference,
           s.provider_upload_reference, a.checksum_sha256, a.size_bytes,
           a.mime_type, j.attempt_count
      FROM public.eper_customer_asset_scan_jobs AS j
      JOIN public.eper_customer_asset_upload_sessions AS s
        ON s.tenant_id = j.tenant_id
       AND s.application_id = j.application_id
       AND s.upload_session_id = j.upload_session_id
       AND s.asset_id = j.asset_id
      JOIN public.eper_customer_assets AS a
        ON a.tenant_id = j.tenant_id
       AND a.asset_id = j.asset_id
     WHERE j.tenant_id = p_tenant_id
       AND j.application_id = p_application_id
       AND j.asset_id = p_asset_id
       AND j.state = 'leased'
       AND j.lease_owner = p_worker_id
       AND j.lease_expires_at > pg_catalog.clock_timestamp()
       AND j.claim_generation = p_claim_generation
       AND s.upload_status = 'completed'
       AND s.provider_upload_reference IS NOT NULL
       AND pg_catalog.btrim(s.provider_upload_reference) <> ''
       AND a.upload_status = 'scanning'
       AND a.scan_status = 'pending'
       AND a.lifecycle_status = 'active'
       AND a.checksum_sha256 IS NOT NULL;
END
$function$;

ALTER FUNCTION public.eper_resolve_customer_asset_scan_child_input(varchar, varchar, uuid, varchar, varchar, bigint, text)
  OWNER TO eper_customer_asset_scan_child_definer;
REVOKE ALL ON FUNCTION public.eper_resolve_customer_asset_scan_child_input(varchar, varchar, uuid, varchar, varchar, bigint)
  FROM PUBLIC, eper_customer_asset_scan_child_access;
REVOKE ALL ON FUNCTION public.eper_resolve_customer_asset_scan_child_input(varchar, varchar, uuid, varchar, varchar, bigint, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eper_resolve_customer_asset_scan_child_input(varchar, varchar, uuid, varchar, varchar, bigint, text)
  TO eper_customer_asset_scan_child_access;

COMMIT;
