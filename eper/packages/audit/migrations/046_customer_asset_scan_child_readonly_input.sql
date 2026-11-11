-- Authenticated, read-only scan-input resolution for isolated scanner child processes.
-- The opaque provider reference is returned only inside the child process, never via IPC.
-- No LOGIN role or credentials are created here; operators provision a LOGIN role and
-- an exact identity mapping after reviewing the runtime deployment boundary.
BEGIN;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'eper_customer_asset_scan_child_definer') THEN
    CREATE ROLE eper_customer_asset_scan_child_definer
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'eper_customer_asset_scan_child_access') THEN
    CREATE ROLE eper_customer_asset_scan_child_access
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$roles$;

ALTER ROLE eper_customer_asset_scan_child_definer
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE eper_customer_asset_scan_child_access
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

CREATE TABLE IF NOT EXISTS public.eper_customer_asset_scan_child_identities (
  login_role name PRIMARY KEY,
  tenant_id varchar(128) NOT NULL CHECK (length(btrim(tenant_id)) BETWEEN 1 AND 128),
  application_id varchar(128) NOT NULL CHECK (length(btrim(application_id)) BETWEEN 1 AND 128),
  worker_id varchar(128) NOT NULL CHECK (length(btrim(worker_id)) BETWEEN 2 AND 128),
  scanner_service_id varchar(128) NOT NULL CHECK (length(btrim(scanner_service_id)) BETWEEN 2 AND 128),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (worker_id LIKE scanner_service_id || ':%')
);

COMMENT ON TABLE public.eper_customer_asset_scan_child_identities IS
  'Operator-provisioned exact mapping from a dedicated scanner-child LOGIN role to one tenant, application, worker and scanner service.';

REVOKE ALL ON public.eper_customer_asset_scan_child_identities FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO eper_customer_asset_scan_child_definer;
GRANT SELECT ON public.eper_customer_asset_scan_child_identities
  TO eper_customer_asset_scan_child_definer;

-- The definer has SELECT only on the columns needed to resolve a source.
GRANT SELECT (tenant_id, asset_id, repository_scope, owner_application_id,
  mime_type, size_bytes, checksum_sha256, storage_adapter_key,
  storage_object_reference, upload_status, scan_status, lifecycle_status)
  ON public.eper_customer_assets TO eper_customer_asset_scan_child_definer;
GRANT SELECT (tenant_id, application_id, upload_session_id, asset_id,
  provider_upload_reference, upload_status)
  ON public.eper_customer_asset_upload_sessions TO eper_customer_asset_scan_child_definer;
GRANT SELECT (tenant_id, application_id, upload_session_id, asset_id,
  state, attempt_count, lease_owner, lease_expires_at, claim_generation)
  ON public.eper_customer_asset_scan_jobs TO eper_customer_asset_scan_child_definer;

-- Explicitly scope the definer's reads. FORCE RLS remains enabled; this role is
-- neither table owner nor BYPASSRLS and receives no write grants.
DROP POLICY IF EXISTS customer_asset_scan_child_asset_read ON public.eper_customer_assets;
CREATE POLICY customer_asset_scan_child_asset_read
  ON public.eper_customer_assets FOR SELECT
  TO eper_customer_asset_scan_child_definer
  USING (
    tenant_id = current_setting('eper.tenant_id', true)
    AND lifecycle_status = 'active'
    AND (
      (repository_scope = 'application_restricted'
        AND owner_application_id = current_setting('eper.application_id', true))
      OR
      (repository_scope = 'customer_shared' AND EXISTS (
        SELECT 1 FROM public.eper_customer_asset_application_links l
         WHERE l.tenant_id = eper_customer_assets.tenant_id
           AND l.asset_id = eper_customer_assets.asset_id
           AND l.application_id = current_setting('eper.application_id', true)
      ))
    )
  );

DROP POLICY IF EXISTS customer_asset_scan_child_session_read ON public.eper_customer_asset_upload_sessions;
CREATE POLICY customer_asset_scan_child_session_read
  ON public.eper_customer_asset_upload_sessions FOR SELECT
  TO eper_customer_asset_scan_child_definer
  USING (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  );

DROP POLICY IF EXISTS customer_asset_scan_child_job_read ON public.eper_customer_asset_scan_jobs;
CREATE POLICY customer_asset_scan_child_job_read
  ON public.eper_customer_asset_scan_jobs FOR SELECT
  TO eper_customer_asset_scan_child_definer
  USING (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  );

CREATE OR REPLACE FUNCTION public.eper_resolve_customer_asset_scan_child_input(
  p_tenant_id varchar,
  p_application_id varchar,
  p_asset_id uuid,
  p_worker_id varchar,
  p_scanner_service_id varchar,
  p_claim_generation bigint
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
     OR p_claim_generation IS NULL OR p_claim_generation < 1 THEN
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
     OR v_identity.scanner_service_id <> p_scanner_service_id THEN
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

GRANT CREATE ON SCHEMA public TO eper_customer_asset_scan_child_definer;
ALTER FUNCTION public.eper_resolve_customer_asset_scan_child_input(varchar, varchar, uuid, varchar, varchar, bigint)
  OWNER TO eper_customer_asset_scan_child_definer;
REVOKE CREATE ON SCHEMA public FROM eper_customer_asset_scan_child_definer;

REVOKE ALL ON FUNCTION public.eper_resolve_customer_asset_scan_child_input(varchar, varchar, uuid, varchar, varchar, bigint)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eper_resolve_customer_asset_scan_child_input(varchar, varchar, uuid, varchar, varchar, bigint)
  TO eper_customer_asset_scan_child_access;

-- LOGIN roles are provisioned separately by an operator and granted membership
-- in eper_customer_asset_scan_child_access. Identity rows are inserted by an
-- administrator only after the exact role/tenant/application/worker mapping is approved.
REVOKE ALL ON public.eper_customer_assets FROM eper_customer_asset_scan_child_access;
REVOKE ALL ON public.eper_customer_asset_upload_sessions FROM eper_customer_asset_scan_child_access;
REVOKE ALL ON public.eper_customer_asset_scan_jobs FROM eper_customer_asset_scan_child_access;
REVOKE ALL ON public.eper_audit_events FROM eper_customer_asset_scan_child_access;
REVOKE ALL ON public.eper_audit_chain_head FROM eper_customer_asset_scan_child_access;

COMMIT;
