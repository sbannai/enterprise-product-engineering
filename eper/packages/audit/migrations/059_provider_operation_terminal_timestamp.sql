-- Record the first transition of a provider operation into a terminal state.
-- Historical terminal rows are intentionally not backfilled.
BEGIN;

ALTER TABLE eper_provider_operations
  ADD COLUMN IF NOT EXISTS terminal_at TIMESTAMPTZ;

COMMENT ON COLUMN eper_provider_operations.terminal_at IS
  'Timestamp of the first transition into a terminal operation status; NULL for unresolved or historical rows without transition evidence.';

CREATE OR REPLACE FUNCTION eper_capture_provider_operation_terminal_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $terminal_at$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Once recorded, the original terminal timestamp is immutable.
    IF OLD.terminal_at IS NOT NULL THEN
      NEW.terminal_at := OLD.terminal_at;
    ELSIF OLD.operation_status NOT IN ('SUCCEEDED', 'FAILED', 'NEEDS_ATTENTION', 'CANCELLED')
      AND NEW.operation_status IN ('SUCCEEDED', 'FAILED', 'NEEDS_ATTENTION', 'CANCELLED') THEN
      NEW.terminal_at := NOW();
    ELSE
      -- Do not fabricate timestamps for historical terminal rows or active rows.
      NEW.terminal_at := OLD.terminal_at;
    END IF;
  ELSIF NEW.operation_status IN ('SUCCEEDED', 'FAILED', 'NEEDS_ATTENTION', 'CANCELLED') THEN
    NEW.terminal_at := NOW();
  ELSE
    NEW.terminal_at := NULL;
  END IF;

  RETURN NEW;
END
$terminal_at$;

DROP TRIGGER IF EXISTS eper_provider_operation_terminal_at
  ON eper_provider_operations;

CREATE TRIGGER eper_provider_operation_terminal_at
  BEFORE INSERT OR UPDATE OF operation_status, terminal_at
  ON eper_provider_operations
  FOR EACH ROW
  EXECUTE FUNCTION eper_capture_provider_operation_terminal_at();

COMMIT;
