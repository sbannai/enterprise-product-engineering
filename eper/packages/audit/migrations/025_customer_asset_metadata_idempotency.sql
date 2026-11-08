-- Idempotent customer asset metadata creation.
-- An operation is bound to one tenant/application/actor and immutable request fingerprint.
BEGIN;
CREATE TABLE IF NOT EXISTS eper_customer_asset_metadata_operations (
 tenant_id varchar(128) NOT NULL,
 application_id varchar(128) NOT NULL CHECK (length(btrim(application_id)) BETWEEN 1 AND 128),
 actor_id varchar(128) NOT NULL CHECK (length(btrim(actor_id)) BETWEEN 1 AND 128),
 client_operation_id varchar(64) NOT NULL CHECK (client_operation_id ~ '^[A-Fa-f0-9]{32,64}$'),
 request_fingerprint char(64) NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
 asset_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (tenant_id, application_id, actor_id, client_operation_id),
 UNIQUE (tenant_id, asset_id),
 FOREIGN KEY (tenant_id, asset_id) REFERENCES eper_customer_assets (tenant_id, asset_id) ON DELETE RESTRICT
);
ALTER TABLE eper_customer_asset_metadata_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_customer_asset_metadata_operations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_asset_metadata_operation_isolation ON eper_customer_asset_metadata_operations;
CREATE POLICY customer_asset_metadata_operation_isolation ON eper_customer_asset_metadata_operations
 USING (tenant_id = current_setting('eper.tenant_id', true) AND application_id = current_setting('eper.application_id', true))
 WITH CHECK (tenant_id = current_setting('eper.tenant_id', true) AND application_id = current_setting('eper.application_id', true));
GRANT SELECT, INSERT ON eper_customer_asset_metadata_operations TO eper_customer_asset_access;
COMMIT;
