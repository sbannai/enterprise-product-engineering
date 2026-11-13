-- Tenant/application-scoped vendor dependency policy, notice evidence and installed inventory.
-- This is metadata only: it never downloads, installs or executes vendor packages.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_dependency_policy (
  tenant_id TEXT NOT NULL CHECK (length(btrim(tenant_id)) BETWEEN 1 AND 128),
  application_id TEXT NOT NULL CHECK (length(btrim(application_id)) BETWEEN 1 AND 128),
  dependency_id TEXT NOT NULL CHECK (length(btrim(dependency_id)) BETWEEN 1 AND 160),
  vendor TEXT NOT NULL CHECK (length(btrim(vendor)) BETWEEN 1 AND 160),
  component_kind TEXT NOT NULL CHECK (component_kind IN (
    'plugin','dll','sdk','driver','firmware','gateway_agent','peripheral_adapter','runtime','other'
  )),
  supported_versions JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(supported_versions) = 'object'),
  required_minimum_version TEXT,
  support_state TEXT NOT NULL CHECK (support_state IN ('supported','deprecated','unsupported','unknown')),
  mandatory_update BOOLEAN NOT NULL DEFAULT false,
  effective_at TIMESTAMPTZ,
  downgrade_policy TEXT NOT NULL CHECK (downgrade_policy IN ('allowed','vendor_prohibited')),
  compatible_operating_systems JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(compatible_operating_systems) = 'array'),
  compatible_runtimes JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(compatible_runtimes) = 'array'),
  compatible_device_models JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(compatible_device_models) = 'array'),
  policy_status TEXT NOT NULL DEFAULT 'active' CHECK (policy_status IN ('draft','active','retired')),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by TEXT NOT NULL CHECK (length(btrim(created_by)) BETWEEN 1 AND 128),
  updated_by TEXT NOT NULL CHECK (length(btrim(updated_by)) BETWEEN 1 AND 128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, application_id, dependency_id),
  FOREIGN KEY (tenant_id, application_id)
    REFERENCES eper_tenant_application_assignment (tenant_id, application_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CHECK (
    (mandatory_update = false AND (required_minimum_version IS NULL OR length(btrim(required_minimum_version)) > 0))
    OR
    (mandatory_update = true AND required_minimum_version IS NOT NULL
      AND length(btrim(required_minimum_version)) BETWEEN 5 AND 128
      AND effective_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS eper_dependency_policy_enforcement_idx
  ON eper_dependency_policy (tenant_id, application_id, policy_status, mandatory_update, effective_at);

CREATE TABLE IF NOT EXISTS eper_dependency_notice_evidence (
  tenant_id TEXT NOT NULL,
  application_id TEXT NOT NULL,
  dependency_id TEXT NOT NULL,
  notice_id UUID NOT NULL,
  verification_state TEXT NOT NULL CHECK (verification_state IN ('verified','unverified','not_provided')),
  source TEXT,
  reference TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  recorded_by TEXT NOT NULL CHECK (length(btrim(recorded_by)) BETWEEN 1 AND 128),
  effective_at TIMESTAMPTZ,
  required_minimum_version TEXT,
  evidence_digest TEXT,
  notes TEXT,
  PRIMARY KEY (tenant_id, application_id, dependency_id, notice_id),
  FOREIGN KEY (tenant_id, application_id, dependency_id)
    REFERENCES eper_dependency_policy (tenant_id, application_id, dependency_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CHECK (
    verification_state <> 'verified'
    OR (
      source IS NOT NULL AND length(btrim(source)) BETWEEN 1 AND 512
      AND reference IS NOT NULL AND length(btrim(reference)) BETWEEN 1 AND 1024
    )
  ),
  CHECK (evidence_digest IS NULL OR evidence_digest ~ '^[a-f0-9]{64}$')
);

CREATE TABLE IF NOT EXISTS eper_dependency_installation (
  tenant_id TEXT NOT NULL,
  application_id TEXT NOT NULL,
  dependency_id TEXT NOT NULL,
  installation_id UUID NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('application','workstation','device','user','gateway')),
  scope_id TEXT NOT NULL CHECK (length(btrim(scope_id)) BETWEEN 1 AND 160),
  installed_version TEXT NOT NULL CHECK (length(btrim(installed_version)) BETWEEN 1 AND 128),
  operating_system TEXT NOT NULL CHECK (length(btrim(operating_system)) BETWEEN 1 AND 160),
  runtime TEXT NOT NULL CHECK (length(btrim(runtime)) BETWEEN 1 AND 160),
  device_model TEXT,
  installation_status TEXT NOT NULL DEFAULT 'observed' CHECK (installation_status IN ('observed','upgrade_pending','blocked','retired')),
  last_verified_at TIMESTAMPTZ,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, application_id, dependency_id, installation_id),
  FOREIGN KEY (tenant_id, application_id, dependency_id)
    REFERENCES eper_dependency_policy (tenant_id, application_id, dependency_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS eper_dependency_installation_scope_idx
  ON eper_dependency_installation (tenant_id, application_id, scope_type, scope_id, installation_status);

-- Notice evidence is append-only: corrections are new evidence records, not edits.
CREATE OR REPLACE FUNCTION eper_reject_dependency_notice_mutation()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  RAISE EXCEPTION 'EPER_DEPENDENCY_NOTICE_EVIDENCE_IMMUTABLE'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$function$;

DROP TRIGGER IF EXISTS eper_dependency_notice_no_update ON eper_dependency_notice_evidence;
CREATE TRIGGER eper_dependency_notice_no_update
BEFORE UPDATE OR DELETE ON eper_dependency_notice_evidence
FOR EACH ROW EXECUTE FUNCTION eper_reject_dependency_notice_mutation();

ALTER TABLE eper_dependency_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_dependency_policy FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eper_dependency_policy_scope ON eper_dependency_policy;
CREATE POLICY eper_dependency_policy_scope ON eper_dependency_policy
  USING (tenant_id = current_setting('eper.tenant_id', true)
     AND application_id = current_setting('eper.application_id', true))
  WITH CHECK (tenant_id = current_setting('eper.tenant_id', true)
     AND application_id = current_setting('eper.application_id', true));

ALTER TABLE eper_dependency_notice_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_dependency_notice_evidence FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eper_dependency_notice_scope ON eper_dependency_notice_evidence;
CREATE POLICY eper_dependency_notice_scope ON eper_dependency_notice_evidence
  USING (tenant_id = current_setting('eper.tenant_id', true)
     AND application_id = current_setting('eper.application_id', true))
  WITH CHECK (tenant_id = current_setting('eper.tenant_id', true)
     AND application_id = current_setting('eper.application_id', true));

ALTER TABLE eper_dependency_installation ENABLE ROW LEVEL SECURITY;
ALTER TABLE eper_dependency_installation FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eper_dependency_installation_scope ON eper_dependency_installation;
CREATE POLICY eper_dependency_installation_scope ON eper_dependency_installation
  USING (tenant_id = current_setting('eper.tenant_id', true)
     AND application_id = current_setting('eper.application_id', true))
  WITH CHECK (tenant_id = current_setting('eper.tenant_id', true)
     AND application_id = current_setting('eper.application_id', true));

COMMIT;
