-- Durable, tenant-scoped ticket conversation thread. Apply only through the approved migration workflow.
CREATE TABLE IF NOT EXISTS eper_support_ticket_replies (
  id uuid PRIMARY KEY,
  tenant_id varchar(128) NOT NULL,
  application_id varchar(128) NOT NULL,
  ticket_id uuid NOT NULL,
  author_id varchar(128) NOT NULL,
  author_role varchar(32) NOT NULL CHECK (author_role IN ('customer','support')),
  body varchar(8000) NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 8000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eper_support_ticket_reply_ticket_fk
    FOREIGN KEY (tenant_id, application_id, ticket_id)
    REFERENCES eper_support_tickets (tenant_id, application_id, id)
    ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS eper_support_ticket_replies_thread_idx
  ON eper_support_ticket_replies (tenant_id, ticket_id, created_at ASC, id ASC);
