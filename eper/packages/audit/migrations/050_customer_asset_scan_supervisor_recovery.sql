-- Atomic, identity-bound exhausted-lease recovery for the scanner supervisor.
-- The caller owns the transaction and appends the canonical Node audit event on
-- the same connection before COMMIT. This function never commits or hashes audit data.
BEGIN;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
                  WHERE rolname = 'eper_customer_asset_scan_audit_writer') THEN
    CREATE ROLE eper_customer_asset_scan_audit_writer
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$roles$;
ALTER ROLE eper_customer_asset_scan_audit_writer
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO eper_customer_asset_scan_audit_writer;
GRANT eper_customer_asset_scan_audit_writer TO eper_customer_asset_scan_supervisor_access
  WITH INHERIT FALSE, SET TRUE;

GRANT SELECT ON public.eper_customer_asset_scan_supervisor_identities
  TO eper_customer_asset_scan_supervisor_definer;

-- The shared-download SELECT policy queries assets and application links.
-- Restrict that policy to the customer asset runtime role; otherwise PostgreSQL
-- OR-combines it for the supervisor and demands unrelated asset/link privileges.
-- The supervisor uses its own tenant+application-scoped session policy below.
DROP POLICY IF EXISTS customer_asset_upload_session_shared_read
  ON public.eper_customer_asset_upload_sessions;
CREATE POLICY customer_asset_upload_session_shared_read
  ON public.eper_customer_asset_upload_sessions
  FOR SELECT
  TO eper_customer_asset_access
  USING (
    tenant_id = current_setting('eper.tenant_id', true)
    AND EXISTS (
      SELECT 1
        FROM public.eper_customer_assets a
        JOIN public.eper_customer_asset_application_links l
          ON l.tenant_id = a.tenant_id
         AND l.asset_id = a.asset_id
       WHERE a.tenant_id = eper_customer_asset_upload_sessions.tenant_id
         AND a.asset_id = eper_customer_asset_upload_sessions.asset_id
         AND a.repository_scope = 'customer_shared'
         AND a.lifecycle_status = 'active'
         AND a.upload_status = 'available'
         AND a.scan_status IN ('clean', 'not_required')
         AND eper_customer_asset_upload_sessions.upload_status = 'completed'
         AND eper_customer_asset_upload_sessions.provider_upload_reference IS NOT NULL
         AND btrim(eper_customer_asset_upload_sessions.provider_upload_reference) <> ''
         AND l.application_id = current_setting('eper.application_id', true)
    )
  );

GRANT SELECT (tenant_id, application_id, upload_session_id, asset_id, upload_status)
  ON public.eper_customer_asset_upload_sessions
  TO eper_customer_asset_scan_supervisor_definer;
-- PostgreSQL requires UPDATE privilege for SELECT FOR UPDATE; this function
-- never updates session columns, and the grant is limited to updated_at.
GRANT UPDATE ON public.eper_customer_asset_upload_sessions
  TO eper_customer_asset_scan_supervisor_definer;
GRANT SELECT (
  tenant_id, asset_id, upload_status, version, repository_scope, owner_application_id
), UPDATE ON public.eper_customer_assets
  TO eper_customer_asset_scan_supervisor_definer;
-- Existing asset RLS policies also consult explicit application links.
-- The definer needs a narrowly scoped read path for those policy predicates;
-- the supervisor LOGIN itself receives no link-table privileges.
GRANT SELECT (tenant_id, application_id, asset_id)
  ON public.eper_customer_asset_application_links
  TO eper_customer_asset_scan_supervisor_definer;
DROP POLICY IF EXISTS customer_asset_scan_supervisor_recovery_link
  ON public.eper_customer_asset_application_links;
CREATE POLICY customer_asset_scan_supervisor_recovery_link
  ON public.eper_customer_asset_application_links FOR SELECT
  TO eper_customer_asset_scan_supervisor_definer
  USING (tenant_id = current_setting('eper.tenant_id', true)
     AND application_id = current_setting('eper.application_id', true));
GRANT SELECT (
  tenant_id, application_id, upload_session_id, asset_id, correlation_id,
  state, attempt_count, max_attempts, lease_owner, lease_expires_at
)
  ON public.eper_customer_asset_scan_jobs
  TO eper_customer_asset_scan_supervisor_definer;
GRANT UPDATE ON public.eper_customer_asset_scan_jobs
  TO eper_customer_asset_scan_supervisor_definer;

DROP POLICY IF EXISTS customer_asset_scan_supervisor_recovery_session
  ON public.eper_customer_asset_upload_sessions;
CREATE POLICY customer_asset_scan_supervisor_recovery_session
  ON public.eper_customer_asset_upload_sessions FOR SELECT
  TO eper_customer_asset_scan_supervisor_definer
  USING (tenant_id = current_setting('eper.tenant_id', true)
     AND application_id = current_setting('eper.application_id', true));
DROP POLICY IF EXISTS customer_asset_scan_supervisor_recovery_session_lock
  ON public.eper_customer_asset_upload_sessions;
CREATE POLICY customer_asset_scan_supervisor_recovery_session_lock
  ON public.eper_customer_asset_upload_sessions FOR UPDATE
  TO eper_customer_asset_scan_supervisor_definer
  USING (tenant_id = current_setting('eper.tenant_id', true)
     AND application_id = current_setting('eper.application_id', true))
  WITH CHECK (tenant_id = current_setting('eper.tenant_id', true)
     AND application_id = current_setting('eper.application_id', true));

DROP POLICY IF EXISTS customer_asset_scan_supervisor_recovery_asset
  ON public.eper_customer_assets;
CREATE POLICY customer_asset_scan_supervisor_recovery_asset
  ON public.eper_customer_assets FOR SELECT
  TO eper_customer_asset_scan_supervisor_definer
  USING (tenant_id = current_setting('eper.tenant_id', true));
CREATE POLICY customer_asset_scan_supervisor_recovery_asset_update
  ON public.eper_customer_assets FOR UPDATE
  TO eper_customer_asset_scan_supervisor_definer
  USING (tenant_id = current_setting('eper.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('eper.tenant_id', true));

DROP POLICY IF EXISTS customer_asset_scan_supervisor_recovery_job
  ON public.eper_customer_asset_scan_jobs;
CREATE POLICY customer_asset_scan_supervisor_recovery_job
  ON public.eper_customer_asset_scan_jobs FOR SELECT
  TO eper_customer_asset_scan_supervisor_definer
  USING (tenant_id = current_setting('eper.tenant_id', true)
     AND application_id = current_setting('eper.application_id', true));
CREATE POLICY customer_asset_scan_supervisor_recovery_job_update
  ON public.eper_customer_asset_scan_jobs FOR UPDATE
  TO eper_customer_asset_scan_supervisor_definer
  USING (tenant_id = current_setting('eper.tenant_id', true)
     AND application_id = current_setting('eper.application_id', true))
  WITH CHECK (tenant_id = current_setting('eper.tenant_id', true)
     AND application_id = current_setting('eper.application_id', true));

CREATE OR REPLACE FUNCTION public.eper_recover_exhausted_customer_asset_scan_jobs(
  p_tenant_id varchar,
  p_application_id varchar,
  p_scanner_service_id varchar,
  p_limit integer
)
RETURNS TABLE (
  upload_session_id uuid,
  asset_id uuid,
  correlation_id varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = on
AS $function$
DECLARE
  v_identity public.eper_customer_asset_scan_supervisor_identities%ROWTYPE;
  v_candidate record;
  v_session record;
  v_asset record;
  v_job record;
BEGIN
  IF p_tenant_id IS NULL OR length(btrim(p_tenant_id)) NOT BETWEEN 1 AND 128
     OR p_application_id IS NULL OR length(btrim(p_application_id)) NOT BETWEEN 1 AND 128
     OR p_scanner_service_id IS NULL OR length(btrim(p_scanner_service_id)) NOT BETWEEN 2 AND 128
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'EPER_CUSTOMER_ASSET_SCAN_SUPERVISOR_RECOVERY_INPUT_INVALID';
  END IF;

  SELECT i.* INTO v_identity
    FROM public.eper_customer_asset_scan_supervisor_identities i
   WHERE i.login_role = session_user::name AND i.enabled = true;

  IF NOT FOUND OR v_identity.tenant_id <> p_tenant_id
     OR v_identity.application_id <> p_application_id
     OR v_identity.scanner_service_id <> p_scanner_service_id
     OR NOT pg_catalog.pg_has_role(
       session_user, 'eper_customer_asset_scan_supervisor_access', 'MEMBER'
     ) THEN
    RAISE EXCEPTION 'EPER_CUSTOMER_ASSET_SCAN_SUPERVISOR_IDENTITY_DENIED';
  END IF;

  PERFORM pg_catalog.set_config('eper.tenant_id', p_tenant_id, true);
  PERFORM pg_catalog.set_config('eper.application_id', p_application_id, true);

  FOR v_candidate IN
    SELECT j.upload_session_id, j.asset_id
      FROM public.eper_customer_asset_scan_jobs j
     WHERE j.tenant_id = p_tenant_id
       AND j.application_id = p_application_id
       AND j.state = 'leased'
       AND j.lease_owner = v_identity.worker_id
       AND j.lease_expires_at <= pg_catalog.clock_timestamp()
       AND j.attempt_count >= j.max_attempts
     ORDER BY j.lease_expires_at, j.upload_session_id
     LIMIT p_limit
  LOOP
    SELECT s.asset_id, s.upload_status INTO v_session
      FROM public.eper_customer_asset_upload_sessions s
     WHERE s.tenant_id = p_tenant_id
       AND s.application_id = p_application_id
       AND s.upload_session_id = v_candidate.upload_session_id
     FOR UPDATE SKIP LOCKED;
    IF NOT FOUND OR v_session.upload_status <> 'completed'
       OR v_session.asset_id <> v_candidate.asset_id THEN
      CONTINUE;
    END IF;

    SELECT a.upload_status INTO v_asset
      FROM public.eper_customer_assets a
     WHERE a.tenant_id = p_tenant_id AND a.asset_id = v_candidate.asset_id
     FOR UPDATE SKIP LOCKED;
    IF NOT FOUND OR v_asset.upload_status <> 'scanning' THEN
      CONTINUE;
    END IF;

    SELECT j.correlation_id INTO v_job
      FROM public.eper_customer_asset_scan_jobs j
     WHERE j.tenant_id = p_tenant_id
       AND j.application_id = p_application_id
       AND j.upload_session_id = v_candidate.upload_session_id
       AND j.state = 'leased'
       AND j.lease_owner = v_identity.worker_id
       AND j.lease_expires_at <= pg_catalog.clock_timestamp()
       AND j.attempt_count >= j.max_attempts
     FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    UPDATE public.eper_customer_asset_scan_jobs AS scan_job
       SET state = 'dead_letter', lease_owner = NULL, lease_expires_at = NULL,
           last_error_code = 'ATTEMPTS_EXHAUSTED',
           updated_at = pg_catalog.clock_timestamp()
     WHERE scan_job.tenant_id = p_tenant_id
       AND scan_job.application_id = p_application_id
       AND scan_job.upload_session_id = v_candidate.upload_session_id;

    UPDATE public.eper_customer_assets AS asset
       SET upload_status = 'failed', scan_status = 'error',
           lifecycle_status = 'quarantined', updated_by = p_scanner_service_id,
           updated_at = pg_catalog.clock_timestamp(), version = asset.version + 1
     WHERE asset.tenant_id = p_tenant_id AND asset.asset_id = v_candidate.asset_id
       AND asset.upload_status = 'scanning';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'EPER_CUSTOMER_ASSET_EXHAUSTED_JOB_ASSET_STATE_CONFLICT';
    END IF;

    upload_session_id := v_candidate.upload_session_id;
    asset_id := v_candidate.asset_id;
    correlation_id := v_job.correlation_id;
    RETURN NEXT;
  END LOOP;
END
$function$;

GRANT CREATE ON SCHEMA public TO eper_customer_asset_scan_supervisor_definer;
ALTER FUNCTION public.eper_recover_exhausted_customer_asset_scan_jobs(varchar, varchar, varchar, integer)
  OWNER TO eper_customer_asset_scan_supervisor_definer;
REVOKE CREATE ON SCHEMA public FROM eper_customer_asset_scan_supervisor_definer;
REVOKE ALL ON FUNCTION public.eper_recover_exhausted_customer_asset_scan_jobs(varchar, varchar, varchar, integer)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eper_recover_exhausted_customer_asset_scan_jobs(varchar, varchar, varchar, integer)
  TO eper_customer_asset_scan_supervisor_access;

-- Reuse the canonical Node audit writer with narrowly scoped append-only privileges.
GRANT INSERT ON public.eper_audit_events TO eper_customer_asset_scan_audit_writer;
GRANT SELECT ON public.eper_audit_chain_head TO eper_customer_asset_scan_audit_writer;
GRANT UPDATE (last_event_hash, updated_at) ON public.eper_audit_chain_head
  TO eper_customer_asset_scan_audit_writer;

COMMIT;
