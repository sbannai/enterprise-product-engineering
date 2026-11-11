-- Dedicated non-login privilege group for the campaign scheduler worker.
-- Database operators create LOGIN credentials separately and grant membership.
BEGIN;

DO $roles$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
     WHERE rolname = 'eper_campaign_scheduler_worker_access'
  ) THEN
    CREATE ROLE eper_campaign_scheduler_worker_access
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$roles$;

ALTER ROLE eper_campaign_scheduler_worker_access
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

GRANT USAGE ON SCHEMA public TO eper_campaign_scheduler_worker_access;

-- Worker reads schedules and execution rows to reconcile, claim, fence, and
-- recover durable work. It can create execution rows but cannot create or
-- delete schedules, delete executions, or mutate schedule definitions.
GRANT SELECT ON public.eper_campaign_schedules, public.eper_campaign_executions
  TO eper_campaign_scheduler_worker_access;
GRANT INSERT (
  id, schedule_id, tenant_id, application_id, scheduled_for, idempotency_key, payload
) ON public.eper_campaign_executions TO eper_campaign_scheduler_worker_access;
GRANT UPDATE (next_run_at, status, updated_at)
  ON public.eper_campaign_schedules TO eper_campaign_scheduler_worker_access;
GRANT UPDATE (
  status, attempt_count, claim_generation, locked_at, locked_by, started_at,
  updated_at, dispatch_started_at, result, last_error_code, last_error_detail_code,
  completed_at, available_at
) ON public.eper_campaign_executions TO eper_campaign_scheduler_worker_access;

-- The scheduler records lifecycle and execution audit events atomically.
-- It may append and advance the chain head, never rewrite or delete history.
GRANT INSERT ON public.eper_audit_events TO eper_campaign_scheduler_worker_access;
GRANT SELECT ON public.eper_audit_chain_head TO eper_campaign_scheduler_worker_access;
GRANT UPDATE (last_event_hash, updated_at)
  ON public.eper_audit_chain_head TO eper_campaign_scheduler_worker_access;

COMMENT ON ROLE eper_campaign_scheduler_worker_access IS
  'Non-login least-privilege group for the campaign scheduler worker; operator-managed LOGIN roles receive membership';

COMMIT;
