import { randomUUID } from "node:crypto";

export type PaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED";

export interface Payment {
  id: string;
  tenantId: string;
  principalId: string;
  amountPaise: number;
  currency: "INR";
  description: string;
  status: PaymentStatus;
  idempotencyKey: string;
  providerReference: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentGateway {
  createPayment(input: { paymentId: string; amountPaise: number; currency: "INR"; idempotencyKey: string }): {
    provider: string;
    checkoutReference: string;
  };
}

export class SandboxPaymentGateway implements PaymentGateway {
  createPayment(input: { paymentId: string; amountPaise: number; currency: "INR"; idempotencyKey: string }) {
    if (!input.paymentId || input.amountPaise <= 0 || input.currency !== "INR") {
      throw new Error("PAYMENT_GATEWAY_REQUEST_INVALID");
    }
    return {
      provider: "EPER_SANDBOX",
      checkoutReference: `sandbox_${input.paymentId}`,
    };
  }
}

export class PaymentReceiptService {
  private readonly payments = new Map<string, Payment>();
  private readonly idempotency = new Map<string, string>();

  constructor(private readonly gateway: PaymentGateway = new SandboxPaymentGateway()) {}

  initiate(input: {
    tenantId: string;
    principalId: string;
    amountPaise: number;
    currency?: string;
    description: string;
    idempotencyKey: string;
  }): { payment: Payment; provider: string; checkoutReference: string; replayed: boolean } {
    if (!input.tenantId?.trim() || !input.principalId?.trim()) throw new Error("PAYMENT_ACTOR_REQUIRED");
    if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0) throw new Error("PAYMENT_AMOUNT_INVALID");
    if ((input.currency ?? "INR") !== "INR") throw new Error("PAYMENT_CURRENCY_UNSUPPORTED");
    if (!input.description?.trim()) throw new Error("PAYMENT_DESCRIPTION_REQUIRED");
    if (!input.idempotencyKey?.trim() || input.idempotencyKey.length > 128) throw new Error("PAYMENT_IDEMPOTENCY_KEY_REQUIRED");

    const idemKey = `${input.tenantId}:${input.idempotencyKey}`;
    const priorId = this.idempotency.get(idemKey);
    if (priorId) {
      const prior = this.payments.get(priorId)!;
      if (prior.amountPaise !== input.amountPaise || prior.description !== input.description || prior.principalId !== input.principalId) {
        throw new Error("PAYMENT_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST");
      }
      return {
        payment: { ...prior },
        provider: "EPER_SANDBOX",
        checkoutReference: `sandbox_${prior.id}`,
        replayed: true,
      };
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const payment: Payment = {
      id, tenantId: input.tenantId, principalId: input.principalId,
      amountPaise: input.amountPaise, currency: "INR", description: input.description,
      status: "PENDING", idempotencyKey: input.idempotencyKey,
      providerReference: null, createdAt: now, updatedAt: now,
    };
    const gateway = this.gateway.createPayment({
      paymentId: id, amountPaise: input.amountPaise, currency: "INR", idempotencyKey: input.idempotencyKey,
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
    `Amount: ${(payment.amountPaise / 100).toFixed(2)} ${payment.currency}`,
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
