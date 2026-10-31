-- Audited duplicate/canonical disposition for evidence-qualified P1 counting.
ALTER TABLE eper_support_tickets
  ADD COLUMN IF NOT EXISTS duplicate_disposition varchar(24) NOT NULL DEFAULT 'needs_review',
  ADD COLUMN IF NOT EXISTS canonical_ticket_id uuid,
  ADD COLUMN IF NOT EXISTS duplicate_rationale varchar(1000),
  ADD COLUMN IF NOT EXISTS duplicate_disposition_by varchar(128),
  ADD COLUMN IF NOT EXISTS duplicate_disposition_at timestamptz;

ALTER TABLE eper_support_tickets
  ADD CONSTRAINT eper_support_tickets_duplicate_disposition_check
  CHECK (
    duplicate_disposition IN ('needs_review','distinct','duplicate')
    AND (
      (duplicate_disposition = 'duplicate' AND canonical_ticket_id IS NOT NULL
        AND canonical_ticket_id <> id
        AND duplicate_rationale IS NOT NULL AND length(trim(duplicate_rationale)) BETWEEN 20 AND 1000
        AND duplicate_disposition_by IS NOT NULL AND duplicate_disposition_at IS NOT NULL)
      OR (duplicate_disposition = 'distinct' AND canonical_ticket_id IS NULL
        AND duplicate_rationale IS NOT NULL AND length(trim(duplicate_rationale)) BETWEEN 20 AND 1000
        AND duplicate_disposition_by IS NOT NULL AND duplicate_disposition_at IS NOT NULL)
      OR (duplicate_disposition = 'needs_review' AND canonical_ticket_id IS NULL)
    )
  );

ALTER TABLE eper_support_tickets
  ADD CONSTRAINT eper_support_tickets_canonical_ticket_fk
  FOREIGN KEY (tenant_id, application_id, canonical_ticket_id)
  REFERENCES eper_support_tickets (tenant_id, application_id, id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS eper_support_tickets_distinct_confirmed_p1_idx
  ON eper_support_tickets (tenant_id, created_at DESC)
  WHERE type = 'defect' AND severity = 'p1_confirmed'
    AND duplicate_disposition = 'distinct' AND evidence_reference IS NOT NULL;
