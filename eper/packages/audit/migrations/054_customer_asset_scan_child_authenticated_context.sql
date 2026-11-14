-- Resolve scanner authorization scope from the authenticated PostgreSQL LOGIN mapping.
-- The child supplies only the asset/claim identifiers and its independently verified
-- SVID. Tenant, application, worker, scanner and provider connection are derived from
-- session_user; none are accepted as authorization parameters from IPC or the caller.
BEGIN;

CREATE OR REPLACE FUNCTION public.eper_resolve_customer_asset_scan_child_context(
  p_asset_id uuid,
  p_claim_generation bigint
)
RETURNS TABLE (
  tenant_id varchar,
  application_id varchar,
  worker_id varchar,
  scanner_service_id varchar,
  spiffe_id text,
  provider_connection_id varchar,
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
  IF p_asset_id IS NULL OR p_claim_generation IS NULL OR p_claim_generation < 1 THEN
    RAISE EXCEPTION 'EPER_CUSTOMER_ASSET_SCAN_CHILD_INPUT_INVALID';
  END IF;

  SELECT i.* INTO v_identity
    FROM public.eper_customer_asset_scan_child_identities AS i
   WHERE i.login_role = session_user::name
     AND i.enabled = true;

  IF NOT FOUND
     OR v_identity.spiffe_id IS NULL
     OR v_identity.provider_connection_id IS NULL THEN
    RAISE EXCEPTION 'EPER_CUSTOMER_ASSET_SCAN_CHILD_IDENTITY_DENIED';
  END IF;

  PERFORM pg_catalog.set_config('eper.tenant_id', v_identity.tenant_id, true);
  PERFORM pg_catalog.set_config('eper.application_id', v_identity.application_id, true);

  RETURN QUERY
    SELECT v_identity.tenant_id, v_identity.application_id,
           v_identity.worker_id, v_identity.scanner_service_id,
           v_identity.spiffe_id, v_identity.provider_connection_id,
           a.asset_id, a.storage_adapter_key, a.storage_object_reference,
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
     WHERE j.tenant_id = v_identity.tenant_id
       AND j.application_id = v_identity.application_id
       AND j.asset_id = p_asset_id
       AND j.state = 'leased'
       AND j.lease_owner = v_identity.worker_id
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

GRANT CREATE ON SCHEMA public TO eper_customer_asset_scan_child_definer;
ALTER FUNCTION public.eper_resolve_customer_asset_scan_child_context(uuid, bigint)
  OWNER TO eper_customer_asset_scan_child_definer;
REVOKE CREATE ON SCHEMA public FROM eper_customer_asset_scan_child_definer;

REVOKE ALL ON FUNCTION public.eper_resolve_customer_asset_scan_child_context(uuid, bigint)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eper_resolve_customer_asset_scan_child_context(uuid, bigint)
  TO eper_customer_asset_scan_child_access;

COMMIT;
