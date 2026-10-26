-- EPER ticketing foundation. Apply only through an approved database migration window.
CREATE TABLE IF NOT EXISTS eper_support_tickets (
  id uuid PRIMARY KEY,
  tenant_id varchar(128) NOT NULL,
  application_id varchar(128) NOT NULL,
  created_by varchar(128) NOT NULL,
  type varchar(32) NOT NULL CHECK (type IN ('defect','feedback','feature_request','question')),
  title varchar(160) NOT NULL,
  description varchar(8000) NOT NULL,
  business_impact varchar(2000) NOT NULL,
  evidence_reference varchar(500),
  status varchar(32) NOT NULL DEFAULT 'new' CHECK (status IN ('new','triaged','assigned','in_progress','resolved','closed')),
  severity varchar(32) NOT NULL DEFAULT 'p3' CHECK (severity IN ('p1_candidate','p2','p3','p4')),
  assigned_to varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eper_support_ticket_tenant_app_id_unique UNIQUE (tenant_id, application_id, id)
);
CREATE INDEX IF NOT EXISTS eper_support_tickets_tenant_created_idx
  ON eper_support_tickets (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS eper_support_tickets_tenant_status_idx
  ON eper_support_tickets (tenant_id, status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS eper_support_tickets_tenant_app_idx
  ON eper_support_tickets (tenant_id, application_id, created_at DESC);
