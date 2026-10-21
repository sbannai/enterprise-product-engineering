import { createHash } from "node:crypto";
import { resolveTrustedTransactionSnapshot, type TrustedTransactionSnapshot } from "./transaction-receipt-contract.js";
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
export interface ReservePaymentOrderInput {
  tenantId: string;
  invoiceReference: string;
  idempotencyKey: string;
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
  /** Supplied by the business-approved receipt numbering policy; never generated here. */
  receiptNumber: string;
  /** Optional until the approved transaction source is wired into the capture route. When present, stored atomically with receipt issuance. */
  transactionSnapshot?: TrustedTransactionSnapshot;
}
export type PersistResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "idempotency_conflict" | "order_creation_in_progress" | "order_creation_reconciliation_required" | "not_found" | "payment_mismatch" | "duplicate_event" | "event_conflict" | "receipt_document_conflict" };

export interface StoredPaymentOrder {
  /** Internal database key; use transactionPublicId in external APIs. */
  id: string;
  transactionPublicId: string;
  tenantId: string;
  invoiceReference: string;
  providerOrderId: string;
  providerPaymentId: string | null;
  amountMinor: number;
  currency: "INR";
  status: "creating" | "created" | "authorized" | "captured" | "failed" | "refunded";
  createdAt: string;
}
export interface StoredPaymentReceipt {
  /** Stable public UUID used as the downloadable receipt identifier. */
  receiptPublicId: string;
  orderId: string;
  receiptNumber: string;
  documentSha256: string | null;
  documentPdf: Buffer | null;
  issuedAt: string;
  transactionSnapshot?: TrustedTransactionSnapshot | null;
}

export class PostgresPaymentStore {
  constructor(private readonly pool: SqlPool) {}

  /** Minimal live connectivity probe for readiness; does not read or mutate payment data. */
  async checkConnectivity(): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<{ ok: number }>("SELECT 1 AS ok");
      return result.rows[0]?.ok === 1;
    } finally {
      client.release();
    }
  }

  /** Tenant-scoped lookup used by API verification and receipt routes. */
  async findOrder(tenantId: string, providerOrderId: string): Promise<StoredPaymentOrder | null> {
    if (!tenantId.trim() || !providerOrderId.trim()) throw new Error("INVALID_PAYMENT_LOOKUP");
    const client = await this.pool.connect();
    try {
      const result = await client.query<{
        id: string | number; transaction_public_id: string; tenant_id: string; invoice_reference: string;
        provider_order_id: string; provider_payment_id: string | null;
        amount_minor: string | number; currency: string; status: StoredPaymentOrder["status"];
        created_at: Date | string;
      }>(
        `SELECT id, transaction_public_id, tenant_id, invoice_reference, provider_order_id, provider_payment_id,
                amount_minor, currency, status, created_at
           FROM eper_payment_orders
          WHERE tenant_id = $1 AND provider_order_id = $2`,
        [tenantId, providerOrderId],
      );
      const row = result.rows[0];
      if (!row) return null;
      if (row.currency !== "INR" || !["created", "authorized", "captured", "failed", "refunded"].includes(row.status)) {
        throw new Error("PAYMENT_ORDER_PERSISTENCE_INVALID");
      }
      return {
        id: String(row.id), transactionPublicId: row.transaction_public_id, tenantId: row.tenant_id, invoiceReference: row.invoice_reference,
        providerOrderId: row.provider_order_id, providerPaymentId: row.provider_payment_id,
        amountMinor: Number(row.amount_minor), currency: "INR", status: row.status,
        createdAt: new Date(row.created_at).toISOString(),
      };
    } finally {
      client.release();
    }
  }

  /** Lookup by the immutable public transaction UUID exposed by the API. */
  async findOrderByTransactionPublicId(tenantId: string, transactionPublicId: string): Promise<StoredPaymentOrder | null> {
    if (!tenantId.trim() || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(transactionPublicId)) throw new Error("INVALID_PAYMENT_LOOKUP");
    const client = await this.pool.connect();
    try {
      const result = await client.query<{
        id: string | number; transaction_public_id: string; tenant_id: string; invoice_reference: string;
        provider_order_id: string; provider_payment_id: string | null; amount_minor: string | number;
        currency: string; status: StoredPaymentOrder["status"]; created_at: Date | string;
      }>(
        `SELECT id, transaction_public_id, tenant_id, invoice_reference, provider_order_id, provider_payment_id,
                amount_minor, currency, status, created_at
           FROM eper_payment_orders
          WHERE tenant_id = $1 AND transaction_public_id = $2`,
        [tenantId, transactionPublicId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        id: String(row.id), transactionPublicId: row.transaction_public_id, tenantId: row.tenant_id,
        invoiceReference: row.invoice_reference, providerOrderId: row.provider_order_id,
        providerPaymentId: row.provider_payment_id, amountMinor: Number(row.amount_minor),
        currency: "INR", status: row.status, createdAt: new Date(row.created_at).toISOString(),
      };
    } finally { client.release(); }
  }

  /** Internal-key lookup used only after resolving an authenticated receipt record. */
  async findOrderByInternalId(tenantId: string, orderId: string): Promise<StoredPaymentOrder | null> {
    if (!tenantId.trim() || !/^\d+$/.test(orderId)) throw new Error("INVALID_PAYMENT_LOOKUP");
    const client = await this.pool.connect();
    try {
      const result = await client.query<{
        id: string | number; transaction_public_id: string; tenant_id: string; invoice_reference: string;
        provider_order_id: string; provider_payment_id: string | null; amount_minor: string | number;
        currency: string; status: StoredPaymentOrder["status"]; created_at: Date | string;
      }>(
        `SELECT id, transaction_public_id, tenant_id, invoice_reference, provider_order_id, provider_payment_id,
                amount_minor, currency, status, created_at
           FROM eper_payment_orders WHERE tenant_id = $1 AND id = $2`,
        [tenantId, orderId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        id: String(row.id), transactionPublicId: row.transaction_public_id, tenantId: row.tenant_id,
        invoiceReference: row.invoice_reference, providerOrderId: row.provider_order_id,
        providerPaymentId: row.provider_payment_id, amountMinor: Number(row.amount_minor),
        currency: "INR", status: row.status, createdAt: new Date(row.created_at).toISOString(),
      };
    } finally { client.release(); }
  }

  /** Provider order IDs are globally unique in the schema; webhook tenant is resolved from this row. */
  async findOrderByProviderOrderId(providerOrderId: string): Promise<StoredPaymentOrder | null> {
    if (!providerOrderId.trim()) throw new Error("INVALID_PAYMENT_LOOKUP");
    const client = await this.pool.connect();
    try {
      const result = await client.query<{
        id: string | number; transaction_public_id: string; tenant_id: string; invoice_reference: string;
        provider_order_id: string; provider_payment_id: string | null; amount_minor: string | number;
        currency: string; status: StoredPaymentOrder["status"]; created_at: Date | string;
      }>(
        `SELECT id, transaction_public_id, tenant_id, invoice_reference, provider_order_id, provider_payment_id,
                amount_minor, currency, status, created_at
           FROM eper_payment_orders WHERE provider_order_id = $1`,
        [providerOrderId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        id: String(row.id), transactionPublicId: row.transaction_public_id, tenantId: row.tenant_id,
        invoiceReference: row.invoice_reference, providerOrderId: row.provider_order_id,
        providerPaymentId: row.provider_payment_id, amountMinor: Number(row.amount_minor),
        currency: "INR", status: row.status, createdAt: new Date(row.created_at).toISOString(),
      };
    } finally { client.release(); }
  }

  /** Find a receipt by its public UUID for the dedicated download route. */
  async findReceiptByPublicId(tenantId: string, receiptPublicId: string): Promise<StoredPaymentReceipt | null> {
    if (!tenantId.trim() || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(receiptPublicId)) throw new Error("INVALID_RECEIPT_LOOKUP");
    const client = await this.pool.connect();
    try {
      const result = await client.query<{
        order_id: string | number; receipt_public_id: string; receipt_number: string;
        document_sha256: string | null; document_pdf: Buffer | null; issued_at: Date | string;
        transaction_snapshot: TrustedTransactionSnapshot | null;
      }>(
        `SELECT r.payment_order_id AS order_id, r.receipt_public_id, r.receipt_number,
                r.document_sha256, r.document_pdf, r.issued_at, r.transaction_snapshot
           FROM eper_payment_receipts r
           JOIN eper_payment_orders o ON o.id = r.payment_order_id
          WHERE r.tenant_id = $1 AND r.receipt_public_id = $2 AND o.status = 'captured'`,
        [tenantId, receiptPublicId],
      );
      const row = result.rows[0];
      return row ? {
        receiptPublicId: row.receipt_public_id, orderId: String(row.order_id),
        receiptNumber: row.receipt_number, documentSha256: row.document_sha256,
        documentPdf: row.document_pdf, issuedAt: new Date(row.issued_at).toISOString(),
      } : null;
    } finally { client.release(); }
  }

  /** Atomically persist a provider-verified capture (without fabricating a webhook event ID). */
  async captureVerifiedPayment(input: {
    tenantId: string; providerOrderId: string; providerPaymentId: string;
    amountMinor: number; currency: "INR"; receiptNumber: string;
  }): Promise<PersistResult<{ receiptPublicId: string; receiptNumber: string; transactionPublicId: string }>> {
    if (!input.tenantId.trim() || !input.providerOrderId.trim() || !input.providerPaymentId.trim() ||
        !Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0 ||
        !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,79}$/.test(input.receiptNumber)) {
      throw new Error("INVALID_VERIFIED_CAPTURE_INPUT");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{
        id: string | number; transaction_public_id: string; tenant_id: string;
        amount_minor: string | number; currency: string; status: string; provider_payment_id: string | null;
      }>(
        `SELECT id, transaction_public_id, tenant_id, amount_minor, currency, status, provider_payment_id
           FROM eper_payment_orders WHERE tenant_id = $1 AND provider_order_id = $2 FOR UPDATE`,
        [input.tenantId, input.providerOrderId],
      );
      const order = result.rows[0];
      if (!order || Number(order.amount_minor) !== input.amountMinor || order.currency !== input.currency ||
          !["created", "authorized", "captured"].includes(order.status) ||
          (order.status === "captured" && order.provider_payment_id !== input.providerPaymentId)) {
        await client.query("ROLLBACK");
        return { ok: false, reason: order ? "payment_mismatch" : "not_found" };
      }
      if (order.status !== "captured") {
        await client.query(
          `UPDATE eper_payment_orders SET status = 'captured', provider_payment_id = $2, updated_at = NOW()
            WHERE id = $1`,
          [order.id, input.providerPaymentId],
        );
        await client.query(
          `INSERT INTO eper_payment_receipts (tenant_id, payment_order_id, receipt_number)
           VALUES ($1, $2, $3)`,
          [input.tenantId, order.id, input.receiptNumber],
        );
      }
      const receipt = await client.query<{ receipt_public_id: string; receipt_number: string }>(
        `SELECT receipt_public_id, receipt_number FROM eper_payment_receipts WHERE payment_order_id = $1`,
        [order.id],
      );
      if (!receipt.rows[0]) throw new Error("RECEIPT_PERSISTENCE_MISSING");
      await client.query("COMMIT");
      return { ok: true, value: {
        receiptPublicId: receipt.rows[0].receipt_public_id,
        receiptNumber: receipt.rows[0].receipt_number,
        transactionPublicId: order.transaction_public_id,
      } };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  /** Tenant-scoped receipt lookup; callers must still authorize the requesting principal. */
  async findReceipt(tenantId: string, orderId: string): Promise<StoredPaymentReceipt | null> {
    if (!tenantId.trim() || !/^\d+$/.test(orderId)) throw new Error("INVALID_RECEIPT_LOOKUP");
    const client = await this.pool.connect();
    try {
      const result = await client.query<{
        order_id: string | number; receipt_public_id: string; receipt_number: string; document_sha256: string | null;
        document_pdf: Buffer | null; issued_at: Date | string;
      }>(
        `SELECT r.payment_order_id AS order_id, r.receipt_public_id, r.receipt_number, r.document_sha256, r.document_pdf, r.issued_at
           FROM eper_payment_receipts r
           JOIN eper_payment_orders o ON o.id = r.payment_order_id
          WHERE r.tenant_id = $1 AND r.payment_order_id = $2`,
        [tenantId, orderId],
      );
      const row = result.rows[0];
      return row ? {
        receiptPublicId: row.receipt_public_id, orderId: String(row.order_id), receiptNumber: row.receipt_number,
        documentSha256: row.document_sha256, documentPdf: row.document_pdf, issuedAt: new Date(row.issued_at).toISOString(),
        transactionSnapshot: row.transaction_snapshot,
      } : null;
    } finally {
      client.release();
    }
  }

  /**
   * Store exact PDF bytes once. Subsequent requests must use the persisted bytes;
   * regenerating a different PDF for an already issued receipt is rejected.
   */
  async persistReceiptDocument(
    tenantId: string,
    orderId: string,
    documentPdf: Buffer,
  ): Promise<PersistResult<{ documentSha256: string }>> {
    if (!tenantId.trim() || !/^\d+$/.test(orderId) || !Buffer.isBuffer(documentPdf) ||
        documentPdf.length < 8 || documentPdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error("INVALID_RECEIPT_DOCUMENT_INPUT");
    }
    const documentSha256 = createHash("sha256").update(documentPdf).digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{ document_sha256: string | null; document_pdf: Buffer | null }>(
        `SELECT document_sha256, document_pdf
           FROM eper_payment_receipts
          WHERE tenant_id = $1 AND payment_order_id = $2
          FOR UPDATE`,
        [tenantId, orderId],
      );
      const row = result.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "not_found" };
      }
      if (row.document_sha256 || row.document_pdf) {
        const same = row.document_sha256?.toLowerCase() === documentSha256 &&
          Buffer.isBuffer(row.document_pdf) && row.document_pdf.equals(documentPdf);
        if (!same) {
          await client.query("ROLLBACK");
          return { ok: false, reason: "receipt_document_conflict" };
        }
      } else {
        await client.query(
          `UPDATE eper_payment_receipts
              SET document_sha256 = $3, document_pdf = $4
            WHERE tenant_id = $1 AND payment_order_id = $2`,
          [tenantId, orderId, documentSha256, documentPdf],
        );
      }
      await client.query("COMMIT");
      return { ok: true, value: { documentSha256 } };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reserve a tenant-scoped idempotency key before calling Razorpay.
   * A retry never starts another remote order while the reservation is active.
   */
  async reserveOrder(input: ReservePaymentOrderInput): Promise<PersistResult<{ id: string; transactionPublicId: string; providerOrderId: string | null }>> {
    if (
      !input.tenantId.trim() || !input.invoiceReference.trim() || !input.idempotencyKey.trim() ||
      !input.invoiceSourceId.trim() || !input.invoiceSourceVersion.trim() ||
      !Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0 ||
      input.currency !== "INR" || !Number.isFinite(Date.parse(input.invoiceApprovedAt))
    ) throw new Error("INVALID_PAYMENT_ORDER_RESERVATION_INPUT");

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query<{ id: string | number; transaction_public_id: string }>(
        `INSERT INTO eper_payment_orders
          (tenant_id, invoice_reference, idempotency_key, provider, provider_order_id,
           amount_minor, currency, invoice_source_id, invoice_source_version,
           invoice_approved_at, status, creation_lease_until, creation_attempts)
         VALUES ($1, $2, $3, 'razorpay', NULL, $4, $5, $6, $7, $8,
                 'creating', NOW() + INTERVAL '2 minutes', 1)
         ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
         RETURNING id, transaction_public_id`,
        [input.tenantId, input.invoiceReference, input.idempotencyKey, input.amountMinor,
          input.currency, input.invoiceSourceId, input.invoiceSourceVersion, input.invoiceApprovedAt],
      );
      if (inserted.rows[0]) {
        await client.query("COMMIT");
        return { ok: true, value: { id: String(inserted.rows[0].id), transactionPublicId: inserted.rows[0].transaction_public_id, providerOrderId: null } };
      }
      const existing = await client.query<{
        id: string | number; transaction_public_id: string; provider_order_id: string | null; invoice_reference: string;
        amount_minor: string | number; currency: string; invoice_source_id: string;
        invoice_source_version: string; invoice_approved_at: Date | string; status: StoredPaymentOrder["status"]; creation_lease_until: Date | string | null;
      }>(
        `SELECT id, transaction_public_id, provider_order_id, invoice_reference, amount_minor, currency,
                invoice_source_id, invoice_source_version, invoice_approved_at, status, creation_lease_until
           FROM eper_payment_orders
          WHERE tenant_id = $1 AND idempotency_key = $2
          FOR UPDATE`,
        [input.tenantId, input.idempotencyKey],
      );
      const row = existing.rows[0];
      if (!row || row.invoice_reference !== input.invoiceReference ||
          Number(row.amount_minor) !== input.amountMinor || row.currency !== input.currency ||
          row.invoice_source_id !== input.invoiceSourceId ||
          row.invoice_source_version !== input.invoiceSourceVersion ||
          new Date(row.invoice_approved_at).toISOString() !== new Date(input.invoiceApprovedAt).toISOString()) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "idempotency_conflict" };
      }
      if (row.status === "creating") {
        // An expired lease is not permission to call Razorpay again: the previous
        // process may have created a remote order before crashing. Require explicit
        // provider-side reconciliation rather than risking duplicate payable orders.
        const leaseExpired = row.creation_lease_until !== null &&
          new Date(row.creation_lease_until).getTime() <= Date.now();
        await client.query("ROLLBACK");
        return { ok: false, reason: leaseExpired
          ? "order_creation_reconciliation_required"
          : "order_creation_in_progress" };
      }
      if (!row.provider_order_id) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "idempotency_conflict" };
      }
      await client.query("COMMIT");
      return { ok: true, value: { id: String(row.id), transactionPublicId: row.transaction_public_id, providerOrderId: row.provider_order_id } };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** Attach the provider order to the reserved row; safe to repeat with the same ID. */
  async completeOrderCreation(tenantId: string, idempotencyKey: string, providerOrderId: string): Promise<PersistResult<{ id: string; transactionPublicId: string; providerOrderId: string }>> {
    if (!tenantId.trim() || !idempotencyKey.trim() || !providerOrderId.trim()) {
      throw new Error("INVALID_PAYMENT_ORDER_COMPLETION_INPUT");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{ id: string | number; transaction_public_id: string; provider_order_id: string | null; status: string }>(
        `SELECT id, transaction_public_id, provider_order_id, status FROM eper_payment_orders
          WHERE tenant_id = $1 AND idempotency_key = $2 FOR UPDATE`,
        [tenantId, idempotencyKey],
      );
      const row = result.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "not_found" };
      }
      if (row.provider_order_id === providerOrderId && row.status === "created") {
        await client.query("COMMIT");
        return { ok: true, value: { id: String(row.id), transactionPublicId: row.transaction_public_id, providerOrderId } };
      }
      if (row.status !== "creating" || row.provider_order_id !== null) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "idempotency_conflict" };
      }
      await client.query(
        `UPDATE eper_payment_orders
            SET provider_order_id = $3, status = 'created',
                creation_lease_until = NULL, last_creation_error = NULL, updated_at = NOW()
          WHERE id = $1 AND tenant_id = $2`,
        [row.id, tenantId, providerOrderId],
      );
      await client.query("COMMIT");
      return { ok: true, value: { id: String(row.id), transactionPublicId: row.transaction_public_id, providerOrderId } };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Inserts a verified server-created provider order. Idempotency is scoped
   * to tenant + key; a retry must compare the stored order's invoice/amount.
   */
  async insertOrder(input: PersistPaymentOrderInput): Promise<PersistResult<{ id: string; providerOrderId: string }>> {
    if (
      !input.tenantId.trim() ||
      !input.invoiceReference.trim() ||
      !input.idempotencyKey.trim() ||
      !input.providerOrderId.trim() ||
      !input.invoiceSourceId.trim() ||
      !input.invoiceSourceVersion.trim() ||
      !Number.isSafeInteger(input.amountMinor) ||
      input.amountMinor <= 0 ||
      input.currency !== "INR" ||
      !Number.isFinite(Date.parse(input.invoiceApprovedAt))
    ) {
      throw new Error("INVALID_PAYMENT_ORDER_INPUT");
    }
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
      const sameRequest = row.provider_order_id === input.providerOrderId &&
        row.invoice_reference === input.invoiceReference &&
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
  async capturePayment(input: CapturedPaymentInput): Promise<PersistResult<{ receiptPublicId: string; receiptNumber: string }>> {
    if (
      input.eventType !== "payment.captured" ||
      !input.providerEventId.trim() ||
      !input.providerOrderId.trim() ||
      !input.providerPaymentId.trim() ||
      !input.tenantId.trim() ||
      !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,79}$/.test(input.receiptNumber) ||
      !Number.isSafeInteger(input.amountMinor) ||
      input.amountMinor <= 0 ||
      !/^[a-f0-9]{64}$/i.test(input.payloadSha256)
    ) {
      throw new Error("INVALID_CAPTURE_INPUT");
    }
    const transactionSnapshot = input.transactionSnapshot;
    if (transactionSnapshot) {
      const validation = await resolveTrustedTransactionSnapshot(
        { findTransaction: async () => transactionSnapshot },
        { tenantId: input.tenantId, reference: transactionSnapshot.reference },
      );
      if (!validation.ok) throw new Error("INVALID_TRANSACTION_SNAPSHOT:" + validation.error);
    }
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
        const priorEvent = await client.query<{ event_type: string; payload_sha256: string }>(
          `SELECT event_type, payload_sha256
             FROM eper_payment_webhook_events
            WHERE provider = 'razorpay' AND provider_event_id = $1`,
          [input.providerEventId],
        );
        const prior = priorEvent.rows[0];
        await client.query("ROLLBACK");
        if (!prior || prior.event_type !== input.eventType ||
            prior.payload_sha256.toLowerCase() !== input.payloadSha256.toLowerCase()) {
          return { ok: false, reason: "event_conflict" };
        }
        return { ok: false, reason: "duplicate_event" };
      }
      const orderResult = await client.query<{
        id: string | number; tenant_id: string; invoice_reference: string;
        amount_minor: string | number; currency: string; status: string; provider_payment_id: string | null;
      }>(
        `SELECT id, tenant_id, invoice_reference, amount_minor, currency, status, provider_payment_id
           FROM eper_payment_orders WHERE provider_order_id = $1 FOR UPDATE`,
        [input.providerOrderId],
      );
      const order = orderResult.rows[0];
      if (!order) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "not_found" };
      }
      if (order.tenant_id !== input.tenantId || Number(order.amount_minor) !== input.amountMinor ||
          order.currency !== input.currency ||
          (input.transactionSnapshot !== undefined && (
            input.transactionSnapshot.tenantId !== input.tenantId ||
            input.transactionSnapshot.reference !== order.invoice_reference ||
            input.transactionSnapshot.amountDueMinor !== input.amountMinor ||
            input.transactionSnapshot.currency !== input.currency
          ))) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "payment_mismatch" };
      }
      if (order.status === "captured") {
        if (order.provider_payment_id !== input.providerPaymentId) {
          await client.query("ROLLBACK");
          return { ok: false, reason: "payment_mismatch" };
        }
        const existingReceipt = await client.query<{ receipt_public_id: string; receipt_number: string }>(
          `SELECT receipt_public_id, receipt_number FROM eper_payment_receipts WHERE payment_order_id = $1`,
          [order.id],
        );
        if (!existingReceipt.rows[0]) throw new Error("RECEIPT_PERSISTENCE_MISSING");
        await client.query(
          `UPDATE eper_payment_webhook_events SET processed_at = NOW()
            WHERE provider = 'razorpay' AND provider_event_id = $1`,
          [input.providerEventId],
        );
        await client.query("COMMIT");
        return { ok: true, value: {
          receiptPublicId: existingReceipt.rows[0].receipt_public_id,
          receiptNumber: existingReceipt.rows[0].receipt_number,
        } };
      }
      if (!["created", "authorized"].includes(order.status)) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "payment_mismatch" };
      }
      await client.query(
        `UPDATE eper_payment_orders
            SET status = 'captured', provider_payment_id = $2, updated_at = NOW()
          WHERE id = $1`,
        [order.id, input.providerPaymentId],
      );
      const receiptNumber = input.receiptNumber;
      // Receipt PDF generation happens in a later layer; the event hash is not a PDF hash.
      await client.query(
        `INSERT INTO eper_payment_receipts (tenant_id, payment_order_id, receipt_number, transaction_snapshot)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [order.tenant_id, order.id, receiptNumber, input.transactionSnapshot ? JSON.stringify(input.transactionSnapshot) : null],
      );
      const receiptPublicId = String((await client.query<{ receipt_public_id: string }>(
        `SELECT receipt_public_id FROM eper_payment_receipts WHERE payment_order_id = $1`,
        [order.id],
      )).rows[0]?.receipt_public_id ?? "");
      if (!receiptPublicId) throw new Error("RECEIPT_PUBLIC_ID_MISSING");
      await client.query(
        `UPDATE eper_payment_webhook_events SET processed_at = NOW()
          WHERE provider = 'razorpay' AND provider_event_id = $1`,
        [input.providerEventId],
      );
      await client.query("COMMIT");
      return { ok: true, value: { receiptPublicId, receiptNumber } };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

