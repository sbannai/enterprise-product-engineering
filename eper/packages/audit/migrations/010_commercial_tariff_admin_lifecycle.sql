-- Product Admin lifecycle and immutable publication metadata for tariff catalogue versions.
BEGIN;

ALTER TABLE eper_commercial_tariff_plan
  ADD COLUMN IF NOT EXISTS change_reason TEXT NOT NULL DEFAULT 'legacy tariff record',
  ADD COLUMN IF NOT EXISTS approval_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS approval_state TEXT NOT NULL DEFAULT 'not_required'
    CHECK (approval_state IN ('not_required', 'pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_by TEXT;

-- Existing active catalogue rows predate the publication workflow; preserve them as published history.
UPDATE eper_commercial_tariff_plan
SET published_at = COALESCE(published_at, created_at),
    published_by = COALESCE(published_by, created_by)
WHERE tariff_status IN ('active', 'retired');

CREATE INDEX IF NOT EXISTS eper_commercial_tariff_publication_idx
  ON eper_commercial_tariff_plan (tariff_key, tariff_status, effective_from, effective_to);

COMMIT;
