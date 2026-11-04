-- Permit the versioned keyring codec to persist v2 envelopes.
-- Existing v1 rows and ciphertext are not rewritten.
BEGIN;

ALTER TABLE eper_provider_payloads
  DROP CONSTRAINT IF EXISTS eper_provider_payloads_envelope_version_check;

ALTER TABLE eper_provider_payloads
  ADD CONSTRAINT eper_provider_payloads_envelope_version_check
  CHECK (envelope_version IN (1, 2));

COMMIT;
