-- Enforce a one-to-one, tenant/application-scoped relationship between
-- encrypted provider payload envelopes and their durable queue operations.
--
-- The queue's operation_id is UUID while the payload envelope deliberately
-- stores the caller-visible operation identifier as TEXT. Keep that storage
-- contract and expose a generated text key for a type-compatible FK.
-- Both references are deferred because enqueueWithPayload creates the payload
-- and operation in one transaction; neither may be committed independently.
BEGIN;

ALTER TABLE eper_provider_operations
  ADD COLUMN operation_id_text TEXT
    GENERATED ALWAYS AS (operation_id::text) STORED;

ALTER TABLE eper_provider_operations
  ADD CONSTRAINT eper_provider_operations_tenant_application_operation_text_unique
  UNIQUE (tenant_id, application_id, operation_id_text);

-- The queue's operation_id is UUID. Convert the payload-store scope column before
-- adding the composite FK; fail explicitly rather than coercing malformed legacy rows.
DO $
BEGIN
  IF EXISTS (
    SELECT 1
    FROM eper_provider_payloads
    WHERE operation_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}
  FOREIGN KEY (tenant_id, application_id, operation_id)
  REFERENCES eper_provider_operations (tenant_id, application_id, operation_id_text)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE eper_provider_operations
  ADD CONSTRAINT eper_provider_operations_payload_fk
  FOREIGN KEY (tenant_id, application_id, payload_reference)
  REFERENCES eper_provider_payloads (tenant_id, application_id, payload_reference)
  DEFERRABLE INITIALLY DEFERRED;

COMMENT ON COLUMN eper_provider_operations.operation_id_text IS
  'Generated text representation of UUID operation_id, used for type-compatible tenant/application-scoped foreign keys.';

COMMENT ON CONSTRAINT eper_provider_payloads_operation_fk
  ON eper_provider_payloads IS
  'Prevents encrypted payload envelopes from being committed without their tenant/application-scoped provider operation.';

COMMENT ON CONSTRAINT eper_provider_operations_payload_fk
  ON eper_provider_operations IS
  'Requires every non-null provider payload reference to resolve to an envelope in the same tenant and application. Historical null references remain valid.';

COMMIT;

  ) THEN
    RAISE EXCEPTION
      'EPER_PROVIDER_PAYLOAD_OPERATION_ID_NOT_UUID: existing payload rows must be reconciled before migration';
  END IF;
END $;

ALTER TABLE eper_provider_payloads
  ALTER COLUMN operation_id TYPE UUID USING operation_id::uuid;

ALTER TABLE eper_provider_payloads
  ADD CONSTRAINT eper_provider_payloads_operation_fk
  FOREIGN KEY (tenant_id, application_id, operation_id)
  REFERENCES eper_provider_operations (tenant_id, application_id, operation_id_text)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE eper_provider_operations
  ADD CONSTRAINT eper_provider_operations_payload_fk
  FOREIGN KEY (tenant_id, application_id, payload_reference)
  REFERENCES eper_provider_payloads (tenant_id, application_id, payload_reference)
  DEFERRABLE INITIALLY DEFERRED;

COMMENT ON COLUMN eper_provider_operations.operation_id_text IS
  'Generated text representation of UUID operation_id, used for type-compatible tenant/application-scoped foreign keys.';

COMMENT ON CONSTRAINT eper_provider_payloads_operation_fk
  ON eper_provider_payloads IS
  'Prevents encrypted payload envelopes from being committed without their tenant/application-scoped provider operation.';

COMMENT ON CONSTRAINT eper_provider_operations_payload_fk
  ON eper_provider_operations IS
  'Requires every non-null provider payload reference to resolve to an envelope in the same tenant and application. Historical null references remain valid.';

COMMIT;
