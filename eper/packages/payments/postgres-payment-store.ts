/**
 * PostgreSQL persistence primitives for EPER payments.
 *
 * Uses a structural pg-compatible interface so the package does not silently
 * pull in a database driver. The application must inject a real Pool and run
 * the migration before enabling production payment routes.
 */
export interface SqlResult<Row = Record<string, unknown>> {
  rows: Row[];
  rowCount: number | null;
}
export interface SqlClient {
  query<Row = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<SqlResult<Row>>;
  release(): void;
}
export interface SqlPool {
  connect(): Promise<SqlClient>;
}
export interface PersistPaymentOrderInput {
  tenantId: string;
  invoiceReference: string;
  idempotencyKey: string;
  providerOrderId: string;
  amountMinor: number;
  currency: "INR";
  invoiceSourceId: string;
  invoiceSourceVersion: string;
  invoiceApprovedAt: string;
}
export interface CapturedPaymentInput {
  providerEventId: string;
  eventType: string;
  payloadSha256: string;
  providerOrderId: string;
  providerPaymentId: string;
  amountMinor: number;
  currency: "INR";
  tenantId: string;
}
export type PersistResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "idempotency_conflict" | "not_found" | "payment_mismatch" | "duplicate_event" };

export class PostgresPaymentStore {
  constructor(private readonly pool: SqlPool) {}

  /**
   * Inserts a verified server-created provider order. Idempotency is scoped
   * to tenant + key; a retry must compare the stored order's invoice/amount.
   */
  async insertOrder(input: PersistPaymentOrderInput): Promise<PersistResult<{ id: string; providerOrderId: string }>> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query<{ id: string | number; provider_order_id: string }>(
        `INSERT INTO eper_payment_orders
          (tenant_id, invoice_reference, idempotency_key, provider, provider_order_id,
           amount_minor, currency, invoice_source_id, invoice_source_version,
           invoice_approved_at, status)
         VALUES ($1, $2, $3, 'razorpay', $4, $5, $6, $7, $8, $9, 'created')
         ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
         RETURNING id, provider_order_id`,
        [input.tenantId, input.invoiceReference, input.idempotencyKey, input.providerOrderId,
          input.amountMinor, input.currency, input.invoiceSourceId, input.invoiceSourceVersion,
          input.invoiceApprovedAt],
      );
      if (inserted.rows[0]) {
        await client.query("COMMIT");
        return { ok: true, value: { id: String(inserted.rows[0].id), providerOrderId: inserted.rows[0].provider_order_id } };
      }
      const existing = await client.query<{
        id: string | number; provider_order_id: string; invoice_reference: string;
        amount_minor: string | number; currency: string;
      }>(
        `SELECT id, provider_order_id, invoice_reference, amount_minor, currency
           FROM eper_payment_orders
          WHERE tenant_id = $1 AND idempotency_key = $2
          FOR UPDATE`,
        [input.tenantId, input.idempotencyKey],
      );
      const row = existing.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "idempotency_conflict" };
      }
      const sameRequest = row.invoice_reference === input.invoiceReference &&
        Number(row.amount_minor) === input.amountMinor && row.currency === input.currency;
      await client.query("COMMIT");
      return sameRequest
        ? { ok: true, value: { id: String(row.id), providerOrderId: row.provider_order_id } }
        : { ok: false, reason: "idempotency_conflict" };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Atomically deduplicates a provider event, validates the captured payment,
   * marks the order paid, and issues exactly one receipt record.
   */
  async capturePayment(input: CapturedPaymentInput): Promise<PersistResult<{ receiptNumber: string }>> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const event = await client.query(
        `INSERT INTO eper_payment_webhook_events
          (provider, provider_event_id, event_type, payload_sha256)
         VALUES ('razorpay', $1, $2, $3)
         ON CONFLICT (provider, provider_event_id) DO NOTHING
         RETURNING provider_event_id`,
        [input.providerEventId, input.eventType, input.payloadSha256],
      );
      if (!event.rows.length) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "duplicate_event" };
      }
      const orderResult = await client.query<{
        id: string | number; tenant_id: string; amount_minor: string | number;
        currency: string; status: string;
      }>(
        `SELECT id, tenant_id, amount_minor, currency, status
           FROM eper_payment_orders WHERE provider_order_id = $1 FOR UPDATE`,
        [input.providerOrderId],
      );
      const order = orderResult.rows[0];
      if (!order) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "not_found" };
      }
      if (order.tenant_id !== input.tenantId || Number(order.amount_minor) !== input.amountMinor ||
          order.currency !== input.currency || !["created", "authorized"].includes(order.status)) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "payment_mismatch" };
      }
      const year = new Date().getUTCFullYear();
      const receiptNumber = `EPER-${year}-${cryptoRandomToken()}`;
      await client.query(
        `UPDATE eper_payment_orders
            SET status = 'captured', updated_at = NOW()
          WHERE id = $1`,
        [order.id],
      );
      await client.query(
        `INSERT INTO eper_payment_receipts
          (tenant_id, payment_order_id, receipt_number, document_sha256)
         VALUES ($1, $2, $3, $4)`,
        [order.tenant_id, order.id, receiptNumber, input.payloadSha256],
      );
      await client.query(
        `UPDATE eper_payment_webhook_events
            SET processed_at = NOW()
          WHERE provider = 'razorpay' AND provider_event_id = $1`,
        [input.providerEventId],
      );
      await client.query("COMMIT");
      return { ok: true, value: { receiptNumber } };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

function cryptoRandomToken(): string {
  // UUID hex without dashes; receipt numbering policy still requires business approval.
  return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
}
