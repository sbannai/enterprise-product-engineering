-- Tighten row-level isolation and make audit rows append-only for ordinary application paths.
BEGIN;
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'authoritative_records', 'authorization_policies', 'audit_evidence',
    'workflow_exceptions', 'governed_reports', 'transactional_outbox'
  ] LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION eper_reject_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AUDIT_EVIDENCE_APPEND_ONLY' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS audit_evidence_no_mutation ON audit_evidence;
CREATE TRIGGER audit_evidence_no_mutation
BEFORE UPDATE OR DELETE ON audit_evidence
FOR EACH ROW EXECUTE FUNCTION eper_reject_audit_mutation();

INSERT INTO eper_schema_migrations(version) VALUES ('002_rls_force_audit_append_only')
ON CONFLICT (version) DO NOTHING;
COMMIT;
