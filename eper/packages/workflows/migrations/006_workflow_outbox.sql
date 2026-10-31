-- Transactional workflow event outbox and mutable delivery projection.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_workflow_outbox_events (
  tenant_id varchar(128) NOT NULL CHECK (length(btrim(tenant_id)) BETWEEN 1 AND 128),
  application_id varchar(128) NOT NULL CHECK (length(btrim(application_id)) BETWEEN 1 AND 128),
  event_id uuid NOT NULL,
  instance_id uuid NOT NULL,
  transition_id uuid NOT NULL,
  event_type varchar(64) NOT NULL CHECK (event_type IN (
    'workflow.instance.started',
    'workflow.instance.submitted',
    'workflow.instance.approved',
    'workflow.instance.rejected',
    'workflow.instance.cancelled',
    'workflow.instance.completed'
  )),
  event_version bigint NOT NULL CHECK (event_version > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, application_id, event_id),
  UNIQUE (tenant_id, application_id, transition_id, event_type),
  FOREIGN KEY (tenant_id, application_id, instance_id)
    REFERENCES eper_workflow_instances (tenant_id, application_id, instance_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, application_id, instance_id, transition_id)
    REFERENCES eper_workflow_transitions (tenant_id, application_id, instance_id, transition_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS eper_workflow_outbox_events_instance_idx
  ON eper_workflow_outbox_events (tenant_id, application_id, instance_id, event_version);

CREATE TABLE IF NOT EXISTS eper_workflow_outbox_delivery (
  tenant_id varchar(128) NOT NULL,
  application_id varchar(128) NOT NULL,
  event_id uuid NOT NULL,
  delivery_status varchar(16) NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending','processing','delivered','dead_letter')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by varchar(128),
  last_error varchar(2000),
  delivered_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, application_id, event_id),
  FOREIGN KEY (tenant_id, application_id, event_id)
    REFERENCES eper_workflow_outbox_events (tenant_id, application_id, event_id)
    ON DELETE RESTRICT,
  CHECK (
    (delivery_status = 'processing' AND locked_at IS NOT NULL AND locked_by IS NOT NULL)
    OR
    (delivery_status <> 'processing' AND locked_at IS NULL AND locked_by IS NULL)
  ),
  CHECK (
    (delivery_status = 'delivered' AND delivered_at IS NOT NULL)
    OR
    (delivery_status <> 'delivered' AND delivered_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS eper_workflow_outbox_delivery_pending_idx
  ON eper_workflow_outbox_delivery (tenant_id, application_id, available_at, event_id)
  WHERE delivery_status IN ('pending','processing');

DROP TRIGGER IF EXISTS eper_workflow_outbox_events_append_only ON eper_workflow_outbox_events;
CREATE TRIGGER eper_workflow_outbox_events_append_only
  BEFORE UPDATE OR DELETE ON eper_workflow_outbox_events
  FOR EACH ROW EXECUTE FUNCTION eper_reject_workflow_ledger_mutation();

DROP TRIGGER IF EXISTS eper_workflow_outbox_events_no_truncate ON eper_workflow_outbox_events;
CREATE TRIGGER eper_workflow_outbox_events_no_truncate
  BEFORE TRUNCATE ON eper_workflow_outbox_events
  FOR EACH STATEMENT EXECUTE FUNCTION eper_reject_workflow_ledger_mutation();

ALTER TABLE eper_workflow_outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_workflow_outbox_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_application_isolation ON eper_workflow_outbox_events;
CREATE POLICY tenant_application_isolation
  ON eper_workflow_outbox_events
  USING (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  )
  WITH CHECK (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  );

ALTER TABLE eper_workflow_outbox_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_workflow_outbox_delivery FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_application_isolation ON eper_workflow_outbox_delivery;
CREATE POLICY tenant_application_isolation
  ON eper_workflow_outbox_delivery
  USING (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  )
  WITH CHECK (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  );

COMMIT;
