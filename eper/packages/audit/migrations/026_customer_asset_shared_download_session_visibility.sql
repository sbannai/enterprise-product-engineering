-- Permit a linked customer application to read only the completed upload
-- session for a customer-shared asset. The original ALL policy continues to
-- restrict INSERT/UPDATE to the application that created the upload session.
BEGIN;

DROP POLICY IF EXISTS customer_asset_upload_session_shared_read
  ON eper_customer_asset_upload_sessions;

CREATE POLICY customer_asset_upload_session_shared_read
  ON eper_customer_asset_upload_sessions
  FOR SELECT
  USING (
    tenant_id = current_setting('eper.tenant_id', true)
    AND EXISTS (
      SELECT 1
        FROM eper_customer_assets a
        JOIN eper_customer_asset_application_links l
          ON l.tenant_id = a.tenant_id
         AND l.asset_id = a.asset_id
       WHERE a.tenant_id = eper_customer_asset_upload_sessions.tenant_id
         AND a.asset_id = eper_customer_asset_upload_sessions.asset_id
         AND a.repository_scope = 'customer_shared'
         AND a.lifecycle_status = 'active'
         AND a.upload_status = 'available'
         AND a.scan_status IN ('clean', 'not_required')
         AND eper_customer_asset_upload_sessions.upload_status = 'completed'
         AND eper_customer_asset_upload_sessions.provider_upload_reference IS NOT NULL
         AND btrim(eper_customer_asset_upload_sessions.provider_upload_reference) <> ''
         AND l.application_id = current_setting('eper.application_id', true)
    )
  );

COMMIT;
