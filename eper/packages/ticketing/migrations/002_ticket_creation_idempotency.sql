-- Durable retry protection for customer ticket submissions.
-- Legacy tickets remain valid; only requests carrying an idempotency key participate.
ALTER TABLE eper_support_tickets
  ADD COLUMN IF NOT EXISTS idempotency_key varchar(128),
  ADD COLUMN IF NOT EXISTS request_hash varchar(64);

CREATE UNIQUE INDEX IF NOT EXISTS eper_support_tickets_idempotency_unique
  ON eper_support_tickets (tenant_id, application_id, created_by, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
