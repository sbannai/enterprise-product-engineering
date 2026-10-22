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

export interface MarketPriceQuote extends MarketPriceEntry {}

type Clock = () => Date;

/**
 * Resolves explicitly configured, approved market prices.
 * It intentionally does not convert prices using foreign-exchange rates.
 * Callers are responsible for supplying authoritative price-book entries.
 */
export class MarketPriceBookService {
  private readonly entries: readonly MarketPriceEntry[];
  private readonly clock: Clock;

  constructor(entries: readonly MarketPriceEntry[], clock: Clock = () => new Date()) {
    this.entries = entries.map((entry) => ({ ...entry }));
    this.clock = clock;

    for (const entry of this.entries) {
      if (!entry.productId || !entry.marketId || !entry.currency || !entry.priceBookId || !entry.priceBookVersion) {
        throw new Error("MARKET_PRICE_CONFIGURATION_INVALID");
      }
      if (!Number.isSafeInteger(entry.amountMinor) || entry.amountMinor <= 0) {
        throw new Error("MARKET_PRICE_AMOUNT_INVALID");
      }
      const start = Date.parse(entry.effectiveFrom);
      const end = entry.effectiveTo === undefined ? Number.POSITIVE_INFINITY : Date.parse(entry.effectiveTo);
      if (!Number.isFinite(start) || (entry.effectiveTo !== undefined && !Number.isFinite(end)) || end <= start) {
        throw new Error("MARKET_PRICE_EFFECTIVE_WINDOW_INVALID");
      }
    }
  }

  quote(request: MarketPriceQuoteRequest): MarketPriceQuote {
    if (!request.productId || !request.marketId) {
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
    return { ...entry };
  }

  listMarkets(productId: string): Array<{ marketId: string; currency: string }> {
    const now = this.clock().getTime();
    const byMarket = new Map<string, Set<string>>();

    for (const entry of this.entries) {
      if (
        entry.productId !== productId ||
        entry.status !== "APPROVED" ||
        Date.parse(entry.effectiveFrom) > now ||
        (entry.effectiveTo !== undefined && now >= Date.parse(entry.effectiveTo))
      ) {
        continue;
      }
      const currencies = byMarket.get(entry.marketId) ?? new Set<string>();
      currencies.add(entry.currency);
      byMarket.set(entry.marketId, currencies);
    }

    const result: Array<{ marketId: string; currency: string }> = [];
    for (const [marketId, currencies] of byMarket) {
      if (currencies.size !== 1) {
        throw new Error("MARKET_PRICE_CONFIGURATION_AMBIGUOUS");
      }
      result.push({ marketId, currency: [...currencies][0] });
    }
    return result.sort((a, b) => a.marketId.localeCompare(b.marketId));
  }
}
