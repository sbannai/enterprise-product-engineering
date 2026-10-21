-- EPER payment persistence baseline (PostgreSQL).
-- Schema only: production payment routes remain fail-closed until a real Pool,
-- the authoritative invoice source, and integration tests are wired.
BEGIN;

CREATE TABLE IF NOT EXISTS eper_payment_orders (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  invoice_reference TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider = 'razorpay'),
  provider_order_id TEXT UNIQUE,
  provider_payment_id TEXT UNIQUE,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL CHECK (currency = 'INR'),
  invoice_source_id TEXT NOT NULL,
  invoice_source_version TEXT NOT NULL,
  invoice_approved_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('created', 'authorized', 'captured', 'failed', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS eper_payment_orders_tenant_invoice_idx
  ON eper_payment_orders (tenant_id, invoice_reference);

CREATE TABLE IF NOT EXISTS eper_payment_webhook_events (
  provider TEXT NOT NULL CHECK (provider = 'razorpay'),
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_sha256 CHAR(64) NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  processing_error TEXT,
  PRIMARY KEY (provider, provider_event_id)
);

CREATE TABLE IF NOT EXISTS eper_payment_receipts (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  payment_order_id BIGINT NOT NULL REFERENCES eper_payment_orders(id),
  receipt_number TEXT NOT NULL,
  document_sha256 CHAR(64),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, receipt_number),
  UNIQUE (payment_order_id)
);

COMMIT;
