-- Bind immutable application peripheral configuration snapshots to published
-- platform catalogue schemas. Existing snapshots remain valid and unbound.
BEGIN;

ALTER TABLE eper_application_peripheral_configuration
  ADD COLUMN catalogue_type_key TEXT,
  ADD COLUMN catalogue_schema_version INTEGER;

ALTER TABLE eper_application_peripheral_configuration
  ADD CONSTRAINT eper_application_peripheral_configuration_catalogue_pair_check
  CHECK (
    (catalogue_type_key IS NULL) = (catalogue_schema_version IS NULL)
  );

ALTER TABLE eper_application_peripheral_configuration
  ADD CONSTRAINT eper_application_peripheral_configuration_catalogue_schema_fk
  FOREIGN KEY (catalogue_type_key, catalogue_schema_version)
  REFERENCES eper_peripheral_type_schema_versions (type_key, schema_version)
  ON UPDATE RESTRICT
  ON DELETE RESTRICT;

CREATE INDEX eper_application_peripheral_configuration_catalogue_idx
  ON eper_application_peripheral_configuration
    (catalogue_type_key, catalogue_schema_version)
  WHERE catalogue_type_key IS NOT NULL;

-- Separate read-only role for tenant-facing configuration validation.
DO $roles$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'eper_peripheral_type_catalogue_read_access'
  ) THEN
    CREATE ROLE eper_peripheral_type_catalogue_read_access
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$roles$;

ALTER ROLE eper_peripheral_type_catalogue_read_access
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS;

GRANT USAGE ON SCHEMA public
  TO eper_peripheral_type_catalogue_read_access;

GRANT SELECT ON eper_peripheral_type_schema_versions,
                eper_peripheral_type_schema_lifecycle
  TO eper_peripheral_type_catalogue_read_access;

-- PostgreSQL requires at least one permissive policy to grant SELECT.
-- Scope that grant to this reader role and published schemas only.
CREATE POLICY eper_peripheral_type_schema_published_consumer_read_grant
  ON eper_peripheral_type_schema_versions
  AS PERMISSIVE
  FOR SELECT
  TO eper_peripheral_type_catalogue_read_access
  USING (
    EXISTS (
      SELECT 1
      FROM eper_peripheral_type_schema_lifecycle lifecycle
      WHERE lifecycle.type_key = eper_peripheral_type_schema_versions.type_key
        AND lifecycle.schema_version = eper_peripheral_type_schema_versions.schema_version
        AND lifecycle.lifecycle_status = 'PUBLISHED'
    )
  );

-- Restrictive policies are ANDed with permissive policies, preventing the
-- platform-admin PUBLIC policy from widening this reader role's visibility.
CREATE POLICY eper_peripheral_type_schema_published_consumer_read
  ON eper_peripheral_type_schema_versions
  AS RESTRICTIVE
  FOR SELECT
  TO eper_peripheral_type_catalogue_read_access
  USING (
    EXISTS (
      SELECT 1
      FROM eper_peripheral_type_schema_lifecycle lifecycle
      WHERE lifecycle.type_key = eper_peripheral_type_schema_versions.type_key
        AND lifecycle.schema_version = eper_peripheral_type_schema_versions.schema_version
        AND lifecycle.lifecycle_status = 'PUBLISHED'
    )
  );

CREATE POLICY eper_peripheral_type_lifecycle_published_consumer_read
  ON eper_peripheral_type_schema_lifecycle
  AS RESTRICTIVE
  FOR SELECT
  TO eper_peripheral_type_catalogue_read_access
  USING (lifecycle_status = 'PUBLISHED');

COMMIT;
