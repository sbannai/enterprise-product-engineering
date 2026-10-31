-- Explicit, evidence-backed P1 confirmation. Apply only through the approved migration workflow.
ALTER TABLE eper_support_tickets
  DROP CONSTRAINT IF EXISTS eper_support_tickets_severity_check;

ALTER TABLE eper_support_tickets
  ADD CONSTRAINT eper_support_tickets_severity_check
    CHECK (severity IN ('p1_candidate','p1_confirmed','p2','p3','p4')),
  ADD COLUMN IF NOT EXISTS p1_rationale varchar(1000),
  ADD COLUMN IF NOT EXISTS p1_confirmed_by varchar(128),
  ADD COLUMN IF NOT EXISTS p1_confirmed_at timestamptz;

ALTER TABLE eper_support_tickets
  ADD CONSTRAINT eper_support_tickets_p1_confirmation_evidence_check
  CHECK (
    severity <> 'p1_confirmed' OR
    (p1_rationale IS NOT NULL AND length(trim(p1_rationale)) BETWEEN 20 AND 1000
      AND p1_confirmed_by IS NOT NULL AND p1_confirmed_at IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS eper_support_tickets_confirmed_p1_idx
  ON eper_support_tickets (tenant_id, created_at DESC)
  WHERE severity = 'p1_confirmed';
