export type MarketPriceStatus = "DRAFT" | "APPROVED" | "RETIRED";

export interface MarketPriceEntry {
  productId: string;
  marketId: string;
  currency: string;
  amountMinor: number;
  priceBookId: string;
  priceBookVersion: string;
  status: MarketPriceStatus;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface MarketPriceQuoteRequest {
  productId: string;
  marketId: string;
  currency?: string;
}

export interface MarketPriceQuote {
  productId: string;
  marketId: string;
  currency: string;
  amountMinor: number;
  priceBookId: string;
  priceBookVersion: string;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface MarketOption {
  marketId: string;
  currency: string;
}

/**
 * Resolves explicitly configured market prices. It deliberately does not
 * convert prices using FX: each market must have its own approved price.
 * This in-memory implementation is a domain service, not a persistence layer.
 */
export class MarketPriceBookService {
  private readonly entries: readonly MarketPriceEntry[];
  private readonly clock: () => Date;

  constructor(entries: readonly MarketPriceEntry[], clock: () => Date = () => new Date()) {
    this.clock = clock;
    this.entries = entries.map((entry) => ({ ...entry }));

    for (const entry of this.entries) {
      if (!Number.isSafeInteger(entry.amountMinor) || entry.amountMinor <= 0) {
        throw new Error("MARKET_PRICE_AMOUNT_INVALID");
      }
      if (!entry.productId?.trim() || !entry.marketId?.trim() || !entry.currency?.trim() ||
          !entry.priceBookId?.trim() || !entry.priceBookVersion?.trim()) {
        throw new Error("MARKET_PRICE_CONFIGURATION_INVALID");
      }
      const from = Date.parse(entry.effectiveFrom);
      const to = entry.effectiveTo === undefined ? Number.POSITIVE_INFINITY : Date.parse(entry.effectiveTo);
      if (!Number.isFinite(from) || (entry.effectiveTo !== undefined && !Number.isFinite(to)) || to <= from) {
        throw new Error("MARKET_PRICE_EFFECTIVE_WINDOW_INVALID");
      }
      if (!["DRAFT", "APPROVED", "RETIRED"].includes(entry.status)) {
        throw new Error("MARKET_PRICE_STATUS_INVALID");
      }
    }
  }

  quote(request: MarketPriceQuoteRequest): MarketPriceQuote {
    if (!request?.productId?.trim() || !request?.marketId?.trim()) {
      throw new Error("MARKET_PRICE_REQUEST_INVALID");
    }

    const now = this.clock().getTime();
    const candidates = this.entries.filter((entry) =>
      entry.productId === request.productId &&
      entry.marketId === request.marketId &&
      entry.status === "APPROVED" &&
      Date.parse(entry.effectiveFrom) <= now &&
      (entry.effectiveTo === undefined || now < Date.parse(entry.effectiveTo))
    );

    if (candidates.length === 0) {
      throw new Error("APPROVED_MARKET_PRICE_NOT_FOUND");
    }
    if (candidates.length > 1) {
      throw new Error("MARKET_PRICE_CONFIGURATION_AMBIGUOUS");
    }

    const entry = candidates[0];
    if (request.currency !== undefined && request.currency !== entry.currency) {
      throw new Error("MARKET_CURRENCY_MISMATCH");
    }

    return {
      productId: entry.productId,
      marketId: entry.marketId,
      currency: entry.currency,
      amountMinor: entry.amountMinor,
      priceBookId: entry.priceBookId,
      priceBookVersion: entry.priceBookVersion,
      effectiveFrom: entry.effectiveFrom,
      ...(entry.effectiveTo === undefined ? {} : { effectiveTo: entry.effectiveTo }),
    };
  }

  listMarkets(productId: string): MarketOption[] {
    if (!productId?.trim()) throw new Error("MARKET_PRICE_REQUEST_INVALID");
    const now = this.clock().getTime();
    const byMarket = new Map<string, MarketOption>();
    for (const entry of this.entries) {
      if (
        entry.productId === productId &&
        entry.status === "APPROVED" &&
        Date.parse(entry.effectiveFrom) <= now &&
        (entry.effectiveTo === undefined || now < Date.parse(entry.effectiveTo))
      ) {
        const existing = byMarket.get(entry.marketId);
        if (existing && existing.currency !== entry.currency) {
          throw new Error("MARKET_PRICE_CONFIGURATION_AMBIGUOUS");
        }
        byMarket.set(entry.marketId, { marketId: entry.marketId, currency: entry.currency });
      }
    }
    return [...byMarket.values()].sort((a, b) => a.marketId.localeCompare(b.marketId));
  }
}
