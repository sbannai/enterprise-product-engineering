-- Wake notifications are hints only; the durable execution table remains authoritative.
-- PostgreSQL delivers NOTIFY only after the inserting transaction commits.
CREATE OR REPLACE FUNCTION eper_notify_campaign_execution_wake()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_notify('eper_campaign_execution_wake', NEW.id::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS eper_campaign_execution_wake_insert
  ON eper_campaign_executions;

CREATE TRIGGER eper_campaign_execution_wake_insert
AFTER INSERT ON eper_campaign_executions
FOR EACH ROW
EXECUTE FUNCTION eper_notify_campaign_execution_wake();

COMMENT ON FUNCTION eper_notify_campaign_execution_wake() IS
  'Emits a post-commit wake hint for campaign workers; queue rows remain the source of truth.';
