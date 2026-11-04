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
