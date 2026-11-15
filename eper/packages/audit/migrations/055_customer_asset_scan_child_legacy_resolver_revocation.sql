-- Remove obsolete caller-parameterized scanner child resolvers from the runtime role.
-- Migration 054 replaces them with the session_user-derived two-argument context API.
-- Keep the old functions available only to their owner for controlled rollback/admin work.
BEGIN;

REVOKE ALL ON FUNCTION public.eper_resolve_customer_asset_scan_child_input(
  varchar, varchar, uuid, varchar, varchar, bigint, text
) FROM PUBLIC, eper_customer_asset_scan_child_access;

REVOKE ALL ON FUNCTION public.eper_resolve_customer_asset_scan_child_provider_binding(
  varchar, varchar, uuid, varchar, varchar, bigint, text
) FROM PUBLIC, eper_customer_asset_scan_child_access;

-- The child role has one supported entry point: its authenticated database
-- session resolves scope from session_user and accepts only asset + generation.
REVOKE ALL ON FUNCTION public.eper_resolve_customer_asset_scan_child_context(
  uuid, bigint
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eper_resolve_customer_asset_scan_child_context(
  uuid, bigint
) TO eper_customer_asset_scan_child_access;

COMMIT;
