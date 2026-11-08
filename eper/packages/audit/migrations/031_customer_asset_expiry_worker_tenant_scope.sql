-- Bind expiry authority to the authenticated worker LOGIN, not caller-settable GUCs.
-- The registry is operator-managed; the worker and function group cannot modify it.
BEGIN;

CREATE TABLE IF NOT EXISTS public.eper_customer_asset_upload_expiry_worker_tenant_scope (
  login_role name NOT NULL,
  tenant_id varchar(128) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (login_role, tenant_id),
  CONSTRAINT eper_customer_asset_expiry_scope_tenant_nonempty
    CHECK (length(btrim(tenant_id)) BETWEEN 1 AND 128)
);

REVOKE ALL ON public.eper_customer_asset_upload_expiry_worker_tenant_scope FROM PUBLIC;
REVOKE ALL ON public.eper_customer_asset_upload_expiry_worker_tenant_scope
  FROM eper_customer_asset_upload_expiry_worker_access;
GRANT SELECT ON public.eper_customer_asset_upload_expiry_worker_tenant_scope
  TO eper_customer_asset_upload_expiry_access;

CREATE OR REPLACE FUNCTION public.eper_expire_customer_asset_upload_sessions(
  p_tenant_id varchar,
  p_limit integer,
  p_asset_id uuid DEFAULT NULL
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

  -- session_user remains the authenticated LOGIN inside SECURITY DEFINER.
  -- Neither tenant nor application GUCs grant authority.
  -- Apply the protected registry to authenticated members of the dedicated
  -- worker group only. Application/API roles retain the tenant-context contract;
  -- worker LOGINs cannot bypass the registry by setting a tenant GUC.
  IF pg_catalog.pg_has_role(
       session_user,
       'eper_customer_asset_upload_expiry_worker_access',
       'MEMBER'
     )
     AND NOT EXISTS (
       SELECT 1
         FROM public.eper_customer_asset_upload_expiry_worker_tenant_scope AS scope
        WHERE scope.login_role = session_user
          AND scope.tenant_id = p_tenant_id
          AND scope.enabled = true
     ) THEN
    RAISE EXCEPTION 'EPER_CUSTOMER_ASSET_EXPIRY_WORKER_SCOPE_DENIED';
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
         AND (p_asset_id IS NULL OR s.asset_id = p_asset_id)
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
       AND (p_asset_id IS NULL OR s.asset_id = p_asset_id)
       AND s.expires_at <= pg_catalog.clock_timestamp()
    RETURNING s.application_id, s.upload_session_id, s.asset_id, s.expires_at;
END
$function$;

REVOKE ALL ON FUNCTION public.eper_expire_customer_asset_upload_sessions(varchar, integer, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eper_expire_customer_asset_upload_sessions(varchar, integer, uuid)
  TO eper_customer_asset_access, eper_customer_asset_upload_expiry_worker_access;

COMMIT;
