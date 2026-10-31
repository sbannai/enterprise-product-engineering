-- Separate internal-only support notes from customer-visible ticket replies.
ALTER TABLE eper_support_ticket_replies
  ADD COLUMN IF NOT EXISTS visibility varchar(24) NOT NULL DEFAULT 'customer_visible';

ALTER TABLE eper_support_ticket_replies
  ADD CONSTRAINT eper_support_ticket_replies_visibility_check
  CHECK (visibility IN ('customer_visible','internal'));

CREATE INDEX IF NOT EXISTS eper_support_ticket_replies_customer_thread_idx
  ON eper_support_ticket_replies (tenant_id, ticket_id, created_at ASC, id ASC)
  WHERE visibility = 'customer_visible';
