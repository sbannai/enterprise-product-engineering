-- Commercial catalogue entries for optional application-scoped capabilities.
-- No customer is entitled by catalogue publication alone; activation requires the
-- existing application add-on approval/payment flow and an explicit entitlement.
BEGIN;

INSERT INTO eper_module_catalog
  (module_key, display_name, description, status, dependencies, version, updated_by)
VALUES
  ('peripheral_management', 'Peripheral Management',
   'Optional application-scoped registration, configuration and operation of approved peripherals.',
   'draft', '[]'::jsonb, 1, 'system:migration'),
  ('remote_desktop_sharing', 'Remote Desktop Sharing',
   'Optional application-scoped, consent-bound remote assistance sessions. Separate from video conferencing.',
   'draft', '[]'::jsonb, 1, 'system:migration')
ON CONFLICT (module_key) DO NOTHING;

-- An application add-on entitlement must reference an application assigned to the tenant.
-- The existing primary key (tenant_id, application_id, addon_key) remains the uniqueness boundary.
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'eper_application_addon_tenant_application_fk'
      AND conrelid = 'eper_application_addon_entitlement'::regclass
  ) THEN
    ALTER TABLE eper_application_addon_entitlement
      ADD CONSTRAINT eper_application_addon_tenant_application_fk
      FOREIGN KEY (tenant_id, application_id)
      REFERENCES eper_tenant_application_assignment (tenant_id, application_id)
      ON UPDATE RESTRICT ON DELETE RESTRICT;
  END IF;
END
$migration$;

-- Match application-scoped capability data access to the established transaction-local context.
ALTER TABLE eper_application_addon_entitlement ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_application_addon_entitlement FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eper_application_addon_entitlement_scope
  ON eper_application_addon_entitlement;
CREATE POLICY eper_application_addon_entitlement_scope
  ON eper_application_addon_entitlement
  USING (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  )
  WITH CHECK (
    tenant_id = current_setting('eper.tenant_id', true)
    AND application_id = current_setting('eper.application_id', true)
  );

COMMIT;
