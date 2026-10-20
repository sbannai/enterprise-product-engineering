import { randomUUID } from "node:crypto";

export type PaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED";

export interface Payment {
  id: string;
  tenantId: string;
  principalId: string;
  amountMinor: number;
  /** Legacy INR alias retained for existing callers. */
  amountPaise?: number;
  currency: string;
  marketId?: string;
  productId?: string;
  priceBookId?: string;
  priceBookVersion?: string;
  description: string;
  status: PaymentStatus;
  idempotencyKey: string;
  providerReference: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentGateway {
  createPayment(input: { paymentId: string; amountMinor: number; currency: string; idempotencyKey: string }): {
    provider: string;
    checkoutReference: string;
  };
}

export class SandboxPaymentGateway implements PaymentGateway {
  createPayment(input: { paymentId: string; amountMinor: number; currency: string; idempotencyKey: string }) {
    if (!input.paymentId || !Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0 ||
        !["INR", "USD", "EUR", "GBP", "AED"].includes(input.currency)) {
      throw new Error("PAYMENT_GATEWAY_REQUEST_INVALID");
    }
    return {
      provider: "EPER_SANDBOX",
      checkoutReference: `sandbox_${input.paymentId}`,
    };
  }
}

export class PaymentReceiptService {
  // This sandbox adapter is deliberately bounded; production must use durable storage.
  static readonly MAX_IN_MEMORY_PAYMENTS = 10_000;
  private readonly payments = new Map<string, Payment>();
  private readonly idempotency = new Map<string, string>();

  constructor(private readonly gateway: PaymentGateway = new SandboxPaymentGateway()) {}

  initiate(input: {
    tenantId: string;
    principalId: string;
    amountPaise?: number;
    amountMinor?: number;
    currency?: string;
    marketId?: string;
    productId?: string;
    priceBookId?: string;
    priceBookVersion?: string;
    description: string;
    idempotencyKey: string;
  }): { payment: Payment; provider: string; checkoutReference: string; replayed: boolean } {
    if (!input.tenantId?.trim() || !input.principalId?.trim()) throw new Error("PAYMENT_ACTOR_REQUIRED");
    if (input.tenantId.length > 128 || input.principalId.length > 128) throw new Error("PAYMENT_ACTOR_INVALID");
    const currency = input.currency ?? "INR";
    const amountMinor = input.amountMinor ?? input.amountPaise;
    if (typeof amountMinor !== "number" || !Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("PAYMENT_AMOUNT_INVALID");
    if (!["INR", "USD", "EUR", "GBP", "AED"].includes(currency)) throw new Error("PAYMENT_CURRENCY_UNSUPPORTED");
    if (input.amountPaise !== undefined && currency !== "INR") throw new Error("PAYMENT_CURRENCY_UNSUPPORTED");
    if (!input.description?.trim()) throw new Error("PAYMENT_DESCRIPTION_REQUIRED");
    if (input.description.length > 500) throw new Error("PAYMENT_DESCRIPTION_INVALID");
    if (!input.idempotencyKey?.trim() || input.idempotencyKey.length > 128) throw new Error("PAYMENT_IDEMPOTENCY_KEY_REQUIRED");
    for (const [field, value] of Object.entries({
      marketId: input.marketId, productId: input.productId, priceBookId: input.priceBookId, priceBookVersion: input.priceBookVersion,
    })) {
      if (value !== undefined && (typeof value !== "string" || value.length > 128)) {
        throw new Error("PAYMENT_METADATA_INVALID:" + field);
      }
    }

    const idemKey = `${input.tenantId}:${input.idempotencyKey}`;
    const priorId = this.idempotency.get(idemKey);
    if (priorId) {
      const prior = this.payments.get(priorId)!;
      if (prior.amountMinor !== amountMinor || prior.currency !== currency || prior.description !== input.description ||
          prior.principalId !== input.principalId || prior.marketId !== input.marketId || prior.productId !== input.productId ||
          prior.priceBookId !== input.priceBookId || prior.priceBookVersion !== input.priceBookVersion) {
        throw new Error("PAYMENT_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST");
      }
      return {
        payment: { ...prior },
        provider: "EPER_SANDBOX",
        checkoutReference: `sandbox_${prior.id}`,
        replayed: true,
      };
    }

    if (this.payments.size >= PaymentReceiptService.MAX_IN_MEMORY_PAYMENTS) {
      throw new Error("PAYMENT_STORE_CAPACITY_REACHED");
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const payment: Payment = {
      id, tenantId: input.tenantId, principalId: input.principalId,
      amountMinor: amountMinor!, ...(currency === "INR" ? { amountPaise: amountMinor! } : {}), currency,
      ...(input.marketId ? { marketId: input.marketId } : {}),
      ...(input.productId ? { productId: input.productId } : {}),
      ...(input.priceBookId ? { priceBookId: input.priceBookId } : {}),
      ...(input.priceBookVersion ? { priceBookVersion: input.priceBookVersion } : {}),
      description: input.description, status: "PENDING", idempotencyKey: input.idempotencyKey,
      providerReference: null, createdAt: now, updatedAt: now,
    };
    const gateway = this.gateway.createPayment({
      paymentId: id, amountMinor: amountMinor!, currency, idempotencyKey: input.idempotencyKey,
    });
    this.payments.set(id, payment);
    this.idempotency.set(idemKey, id);
    return { payment: { ...payment }, provider: gateway.provider, checkoutReference: gateway.checkoutReference, replayed: false };
  }

  get(tenantId: string, paymentId: string): Payment | undefined {
    const payment = this.payments.get(paymentId);
    return payment?.tenantId === tenantId ? { ...payment } : undefined;
  }

  applyGatewayResult(input: {
    tenantId: string;
    paymentId: string;
    outcome: "SUCCEEDED" | "FAILED";
    providerReference: string;
  }): Payment {
    if (!input.providerReference?.trim()) throw new Error("PAYMENT_PROVIDER_REFERENCE_REQUIRED");
    if (input.providerReference.length > 256) throw new Error("PAYMENT_PROVIDER_REFERENCE_INVALID");
    const payment = this.payments.get(input.paymentId);
    if (!payment || payment.tenantId !== input.tenantId) throw new Error("PAYMENT_NOT_FOUND");
    if (payment.status === input.outcome) {
      if (payment.providerReference !== input.providerReference) throw new Error("PAYMENT_CALLBACK_CONFLICT");
      return { ...payment };
    }
    if (payment.status !== "PENDING") throw new Error("PAYMENT_TERMINAL_STATE_CONFLICT");
    payment.status = input.outcome;
    payment.providerReference = input.providerReference;
    payment.updatedAt = new Date().toISOString();
    this.payments.set(payment.id, payment);
    return { ...payment };
  }

  getReceipt(tenantId: string, paymentId: string): { filename: string; contentType: "application/pdf"; bytes: Buffer } {
    const payment = this.payments.get(paymentId);
    if (!payment || payment.tenantId !== tenantId) throw new Error("PAYMENT_NOT_FOUND");
    if (payment.status !== "SUCCEEDED" || !payment.providerReference) throw new Error("RECEIPT_NOT_AVAILABLE");
    return {
      filename: `receipt-${payment.id}.pdf`,
      contentType: "application/pdf",
      bytes: createReceiptPdf(payment),
    };
  }
}

function pdfEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[\r\n]/g, " ");
}

/** Minimal one-page PDF receipt; no external dependency or paid service required. */
export function createReceiptPdf(payment: Payment): Buffer {
  const lines = [
    "EPER PAYMENT RECEIPT",
    `Receipt / Payment ID: ${payment.id}`,
    `Tenant: ${payment.tenantId}`,
    `Payer: ${payment.principalId}`,
    `Description: ${payment.description}`,
    `Amount: ${(payment.amountMinor / 100).toFixed(2)} ${payment.currency}`,
    ...(payment.marketId ? [`Market: ${payment.marketId}`] : []),
    ...(payment.priceBookId ? [`Price book: ${payment.priceBookId} / ${payment.priceBookVersion ?? ""}`] : []),
    `Status: ${payment.status}`,
    `Provider reference: ${payment.providerReference ?? ""}`,
    `Paid / updated at: ${payment.updatedAt}`,
  ];
  const commands = lines.map((line, index) => `BT /F1 ${index === 0 ? 16 : 10} Tf 50 ${790 - index * 32} Td (${pdfEscape(line)}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(commands, "ascii")} >>\nstream\n${commands}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}
