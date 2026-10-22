export interface MarketPriceBookEntry {
  productId: string;
  marketId: string;
  currency: string;
  amountMinor: number;
  priceBookId: string;
  priceBookVersion: string;
  status: string;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface MarketPriceQuoteRequest {
  productId: string;
  marketId: string;
  /** Optional assertion only; never a mechanism for converting a price. */
  currency?: string;
}

export interface MarketPriceQuote {
  productId: string;
  marketId: string;
  currency: string;
  amountMinor: number;
  priceBookId: string;
  priceBookVersion: string;
}

export interface MarketSummary {
  marketId: string;
  currency: string;
}

export type Clock = () => Date;

export class MarketPriceBookService {
  private readonly entries: readonly MarketPriceBookEntry[];
  private readonly clock: Clock;

  constructor(entries: readonly MarketPriceBookEntry[], clock: Clock = () => new Date()) {
    if (!Array.isArray(entries)) {
      throw new Error("MARKET_PRICE_CONFIGURATION_INVALID");
    }
    this.entries = entries.map((entry) => ({ ...entry }));
    this.clock = clock;
    this.validateConfiguration();
  }

  quote(request: MarketPriceQuoteRequest): MarketPriceQuote {
    if (!request || typeof request.productId !== "string" || !request.productId.trim() ||
        typeof request.marketId !== "string" || !request.marketId.trim()) {
      throw new Error("MARKET_PRICE_REQUEST_INVALID");
    }

    const now = this.clock();
    if (!now || !Number.isFinite(now.getTime())) {
      throw new Error("MARKET_PRICE_CLOCK_INVALID");
    }

    const active = this.entries.filter((entry) =>
      entry.productId === request.productId &&
      entry.marketId === request.marketId &&
      entry.status === "APPROVED" &&
      this.isEffective(entry, now)
    );

    if (active.length === 0) {
      throw new Error("APPROVED_MARKET_PRICE_NOT_FOUND");
    }
    if (active.length !== 1) {
      throw new Error("MARKET_PRICE_CONFIGURATION_AMBIGUOUS");
    }

    const entry = active[0];
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
    };
  }

  listMarkets(productId: string): MarketSummary[] {
    if (typeof productId !== "string" || !productId.trim()) {
      throw new Error("MARKET_PRICE_REQUEST_INVALID");
    }

    const now = this.clock();
    if (!now || !Number.isFinite(now.getTime())) {
      throw new Error("MARKET_PRICE_CLOCK_INVALID");
    }

    const byMarket = new Map<string, string>();
    const seenMarkets = new Set<string>();
    for (const entry of this.entries) {
      if (entry.productId !== productId || entry.status !== "APPROVED" || !this.isEffective(entry, now)) {
        continue;
      }

      // Listing a market must not hide duplicate active price records, even when
      // their currency matches. Quotes fail closed for this condition too.
      if (seenMarkets.has(entry.marketId)) {
        throw new Error("MARKET_PRICE_CONFIGURATION_AMBIGUOUS");
      }
      seenMarkets.add(entry.marketId);
      byMarket.set(entry.marketId, entry.currency);
    }

    return [...byMarket.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([marketId, currency]) => ({ marketId, currency }));
  }

  private isEffective(entry: MarketPriceBookEntry, now: Date): boolean {
    const from = Date.parse(entry.effectiveFrom);
    const to = entry.effectiveTo === undefined ? Number.POSITIVE_INFINITY : Date.parse(entry.effectiveTo);
    return Number.isFinite(from) && from <= now.getTime() && to > now.getTime();
  }

  private validateConfiguration(): void {
    for (const entry of this.entries) {
      if (
        !entry ||
        typeof entry.productId !== "string" || !entry.productId.trim() ||
        typeof entry.marketId !== "string" || !entry.marketId.trim() ||
        typeof entry.currency !== "string" || !/^[A-Z]{3}$/.test(entry.currency) ||
        typeof entry.priceBookId !== "string" || !entry.priceBookId.trim() ||
        typeof entry.priceBookVersion !== "string" || !entry.priceBookVersion.trim() ||
        typeof entry.status !== "string" || !entry.status.trim()
      ) {
        throw new Error("MARKET_PRICE_CONFIGURATION_INVALID");
      }

      if (!Number.isSafeInteger(entry.amountMinor) || entry.amountMinor <= 0) {
        throw new Error("MARKET_PRICE_AMOUNT_INVALID");
      }

      if (typeof entry.effectiveFrom !== "string" ||
          (entry.effectiveTo !== undefined && typeof entry.effectiveTo !== "string")) {
        throw new Error("MARKET_PRICE_EFFECTIVE_WINDOW_INVALID");
      }
      const from = Date.parse(entry.effectiveFrom);
      const to = entry.effectiveTo === undefined ? Number.POSITIVE_INFINITY : Date.parse(entry.effectiveTo);
      if (!Number.isFinite(from) || !(to > from)) {
        throw new Error("MARKET_PRICE_EFFECTIVE_WINDOW_INVALID");
      }
    }
  }
}
