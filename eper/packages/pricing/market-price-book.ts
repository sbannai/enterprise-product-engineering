export type PriceBookStatus = "DRAFT" | "APPROVED" | "RETIRED";

export interface MarketPriceEntry {
  productId: string;
  marketId: string;
  currency: string;
  amountMinor: number;
  priceBookId: string;
  priceBookVersion: string;
  status: PriceBookStatus;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

export interface MarketPriceQuote {
  productId: string;
  marketId: string;
  currency: string;
  amountMinor: number;
  priceBookId: string;
  priceBookVersion: string;
  quotedAt: string;
}

/**
 * Resolves an approved local-market price. It deliberately does not perform FX
 * conversion: each market/currency/product combination must have its own
 * approved price-book entry. Supply entries from a controlled configuration
 * source; do not place commercial prices in code.
 */
export class MarketPriceBookService {
  constructor(
    private readonly entries: readonly MarketPriceEntry[],
    private readonly now: () => Date = () => new Date(),
  ) {
    if (!Array.isArray(entries)) throw new Error("MARKET_PRICE_CONFIGURATION_INVALID");
    for (const entry of entries) this.validateEntry(entry);
  }

  listMarkets(productId: string): Array<{ marketId: string; currency: string }> {
    if (typeof productId !== "string" || !productId.trim()) {
      throw new Error("PRICE_PRODUCT_REQUIRED");
    }
    const at = this.readClock().getTime();
    const unique = new Map<string, { marketId: string; currency: string }>();
    for (const entry of this.entries) {
      if (entry.productId !== productId || !this.isEffective(entry, at)) continue;
      if (unique.has(entry.marketId)) {
        throw new Error("MARKET_PRICE_CONFIGURATION_AMBIGUOUS");
      }
      unique.set(entry.marketId, { marketId: entry.marketId, currency: entry.currency });
    }
    return [...unique.values()].sort((a, b) => a.marketId.localeCompare(b.marketId));
  }

  quote(input: { productId: string; marketId: string; currency?: string }): MarketPriceQuote {
    if (!input || typeof input.productId !== "string" || !input.productId.trim()) {
      throw new Error("PRICE_PRODUCT_REQUIRED");
    }
    if (typeof input.marketId !== "string" || !input.marketId.trim()) {
      throw new Error("PRICE_MARKET_REQUIRED");
    }
    const quotedAt = this.readClock();
    const at = quotedAt.getTime();
    const candidates = this.entries.filter((entry) =>
      entry.productId === input.productId &&
      entry.marketId === input.marketId &&
      this.isEffective(entry, at),
    );
    if (candidates.length === 0) throw new Error("APPROVED_MARKET_PRICE_NOT_FOUND");
    if (candidates.length !== 1) throw new Error("MARKET_PRICE_CONFIGURATION_AMBIGUOUS");
    const entry = candidates[0];
    if (input.currency !== undefined && input.currency !== entry.currency) {
      throw new Error("MARKET_CURRENCY_MISMATCH");
    }
    return {
      productId: entry.productId,
      marketId: entry.marketId,
      currency: entry.currency,
      amountMinor: entry.amountMinor,
      priceBookId: entry.priceBookId,
      priceBookVersion: entry.priceBookVersion,
      quotedAt: quotedAt.toISOString(),
    };
  }

  private readClock(): Date {
    const value = this.now();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      throw new Error("MARKET_PRICE_CLOCK_INVALID");
    }
    return value;
  }

  private isEffective(entry: MarketPriceEntry, at: number): boolean {
    return entry.status === "APPROVED" &&
      Date.parse(entry.effectiveFrom) <= at &&
      (entry.effectiveTo == null || Date.parse(entry.effectiveTo) > at);
  }

  private validateEntry(entry: MarketPriceEntry): void {
    if (!entry || typeof entry !== "object") {
      throw new Error("MARKET_PRICE_REQUIRED_FIELDS_MISSING");
    }
    const identifiers = [entry.productId, entry.marketId, entry.priceBookId, entry.priceBookVersion];
    if (identifiers.some((value) => typeof value !== "string" || !value.trim() || value.length > 128)) {
      throw new Error("MARKET_PRICE_REQUIRED_FIELDS_MISSING");
    }
    if (typeof entry.currency !== "string" || !/^[A-Z]{3}$/.test(entry.currency)) {
      throw new Error("MARKET_PRICE_CONFIGURATION_INVALID");
    }
    if (!(["INR", "USD", "EUR", "GBP", "AED"] as const).includes(entry.currency as "INR" | "USD" | "EUR" | "GBP" | "AED")) {
      throw new Error("MARKET_PRICE_CURRENCY_UNSUPPORTED");
    }
    if (!Number.isSafeInteger(entry.amountMinor) || entry.amountMinor <= 0) {
      throw new Error("MARKET_PRICE_AMOUNT_INVALID");
    }
    if (!(["DRAFT", "APPROVED", "RETIRED"] as const).includes(entry.status)) {
      throw new Error("MARKET_PRICE_STATUS_INVALID");
    }
    if (typeof entry.effectiveFrom !== "string" ||
        (entry.effectiveTo != null && typeof entry.effectiveTo !== "string") ||
        !Number.isFinite(Date.parse(entry.effectiveFrom)) ||
        (entry.effectiveTo != null && !Number.isFinite(Date.parse(entry.effectiveTo)))) {
      throw new Error("MARKET_PRICE_EFFECTIVE_DATE_INVALID");
    }
    if (entry.effectiveTo != null && Date.parse(entry.effectiveTo) <= Date.parse(entry.effectiveFrom)) {
      throw new Error("MARKET_PRICE_EFFECTIVE_WINDOW_INVALID");
    }
  }
}
