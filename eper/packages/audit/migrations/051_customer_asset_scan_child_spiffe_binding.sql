-- Bind the dedicated PostgreSQL LOGIN role to an operator-provisioned SPIFFE identity.
-- The database authenticates the child through its client certificate and maps that
-- certificate to session_user. The SPIFFE ID is provisioning metadata, not a caller-
-- supplied SQL argument: accepting a claimed ID from the process would be spoofable.
BEGIN;

ALTER TABLE public.eper_customer_asset_scan_child_identities
  ADD COLUMN IF NOT EXISTS spiffe_id text;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
     WHERE conname = 'eper_customer_asset_scan_child_spiffe_id_format'
       AND conrelid = 'public.eper_customer_asset_scan_child_identities'::regclass
  ) THEN
    ALTER TABLE public.eper_customer_asset_scan_child_identities
      ADD CONSTRAINT eper_customer_asset_scan_child_spiffe_id_format
      CHECK (
        spiffe_id IS NULL OR (
          length(spiffe_id) BETWEEN 12 AND 512
          AND spiffe_id ~ '^spiffe://[a-z0-9.-]+/[A-Za-z0-9._~!$&''()*+,;=:@%/-]+$'
          AND position('..' in spiffe_id) = 0
        )
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
     WHERE conname = 'eper_customer_asset_scan_child_enabled_requires_spiffe'
       AND conrelid = 'public.eper_customer_asset_scan_child_identities'::regclass
  ) THEN
    ALTER TABLE public.eper_customer_asset_scan_child_identities
      ADD CONSTRAINT eper_customer_asset_scan_child_enabled_requires_spiffe
      CHECK (enabled = false OR spiffe_id IS NOT NULL);
  END IF;
END
$constraint$;

-- Existing identities have no attested workload binding yet. Disable them until
-- an operator provisions the matching SPIFFE workload identity and client cert.
UPDATE public.eper_customer_asset_scan_child_identities
   SET enabled = false, updated_at = clock_timestamp()
 WHERE enabled = true AND spiffe_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS eper_customer_asset_scan_child_spiffe_id_unique
  ON public.eper_customer_asset_scan_child_identities (spiffe_id)
  WHERE spiffe_id IS NOT NULL;

COMMENT ON COLUMN public.eper_customer_asset_scan_child_identities.spiffe_id IS
  'Operator-provisioned SPIFFE identity whose workload certificate is mapped to this PostgreSQL LOGIN role; never accepted as a caller-supplied claim.';

COMMIT;
