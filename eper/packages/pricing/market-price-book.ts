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
 * Resolves one approved, effective market-specific price. It never performs FX
 * conversion. Commercial prices must come from controlled configuration, not
 * hard-coded application defaults.
 */
function parseEffectiveDate(value: unknown): number {
  if (typeof value !== "string") throw new Error("MARKET_PRICE_EFFECTIVE_DATE_INVALID");
  // Validate the calendar components before Date.parse, which can normalize
  // impossible dates (for example, February 30) into a different instant.
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) throw new Error("MARKET_PRICE_EFFECTIVE_DATE_INVALID");
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const daysInMonth = month >= 1 && month <= 12
    ? new Date(Date.UTC(year, month, 0)).getUTCDate()
    : 0;
  if (day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) {
    throw new Error("MARKET_PRICE_EFFECTIVE_DATE_INVALID");
  }
  if (zone !== "Z") {
    const offset = /[+-](\d{2}):(\d{2})$/.exec(zone);
    if (!offset || Number(offset[1]) > 23 || Number(offset[2]) > 59) {
      throw new Error("MARKET_PRICE_EFFECTIVE_DATE_INVALID");
    }
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error("MARKET_PRICE_EFFECTIVE_DATE_INVALID");
  return timestamp;
}

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
      // Do not hide duplicate active records, even when their currencies match.
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
    if (identifiers.some((value) =>
      typeof value !== "string" || !value.trim() || value.length > 128
    )) {
      throw new Error("MARKET_PRICE_REQUIRED_FIELDS_MISSING");
    }
    if (typeof entry.currency !== "string" || !/^[A-Z]{3}$/.test(entry.currency)) {
      throw new Error("MARKET_PRICE_CONFIGURATION_INVALID");
    }
    if (!(["INR", "USD", "EUR", "GBP", "AED"] as const).includes(
      entry.currency as "INR" | "USD" | "EUR" | "GBP" | "AED"
    )) {
      throw new Error("MARKET_PRICE_CURRENCY_UNSUPPORTED");
    }
    if (!Number.isSafeInteger(entry.amountMinor) || entry.amountMinor <= 0) {
      throw new Error("MARKET_PRICE_AMOUNT_INVALID");
    }
    if (!(["DRAFT", "APPROVED", "RETIRED"] as const).includes(entry.status)) {
      throw new Error("MARKET_PRICE_STATUS_INVALID");
    }
    const effectiveFrom = parseEffectiveDate(entry.effectiveFrom);
    const effectiveTo = entry.effectiveTo == null ? null : parseEffectiveDate(entry.effectiveTo);
    if (effectiveTo != null && effectiveTo <= effectiveFrom) {
      throw new Error("MARKET_PRICE_EFFECTIVE_WINDOW_INVALID");
    }
  }
}
