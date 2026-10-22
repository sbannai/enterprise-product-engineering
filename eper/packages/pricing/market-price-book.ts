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
  /** Optional assertion only; it never triggers currency conversion. */
  currency?: string;
}

export interface MarketPriceQuote extends MarketPriceEntry {}
export interface MarketSummary { marketId: string; currency: string; }
type Clock = () => Date;

const fail = (code: string): never => { throw new Error(code); };

function parseInstant(value: unknown): number {
  if (typeof value !== "string") return fail("MARKET_PRICE_EFFECTIVE_WINDOW_INVALID");

  // Require a complete ISO-8601 timestamp and validate its calendar fields
  // before Date.parse, which normalizes impossible dates in some runtimes.
  const match = /^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})(?:\\.(\\d{1,3}))?(Z|[+-]\\d{2}:\\d{2})$/.exec(value);
  if (!match) return fail("MARKET_PRICE_EFFECTIVE_WINDOW_INVALID");

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
  if (
    day < 1 || day > daysInMonth ||
    hour > 23 || minute > 59 || second > 59
  ) return fail("MARKET_PRICE_EFFECTIVE_WINDOW_INVALID");

  if (zone !== "Z") {
    const offset = /[+-](\\d{2}):(\\d{2})$/.exec(zone);
    if (!offset || Number(offset[1]) > 23 || Number(offset[2]) > 59) {
      return fail("MARKET_PRICE_EFFECTIVE_WINDOW_INVALID");
    }
  }

  const time = Date.parse(value);
  if (!Number.isFinite(time)) return fail("MARKET_PRICE_EFFECTIVE_WINDOW_INVALID");
  return time;
}

/**
 * Resolves explicitly configured approved prices by product and market.
 * It fails closed on missing/ambiguous prices and never performs FX conversion.
 * The supplied entries must come from an authoritative price-book source.
 */
export class MarketPriceBookService {
  private readonly entries: readonly MarketPriceEntry[];
  private readonly clock: Clock;

  constructor(entries: readonly MarketPriceEntry[], clock: Clock = () => new Date()) {
    if (!Array.isArray(entries)) fail("MARKET_PRICE_CONFIGURATION_INVALID");
    this.entries = entries.map((entry) => {
      if (
        !entry ||
        typeof entry.productId !== "string" || !entry.productId.trim() ||
        typeof entry.marketId !== "string" || !entry.marketId.trim() ||
        typeof entry.currency !== "string" || !/^[A-Z]{3}$/.test(entry.currency) ||
        !Number.isSafeInteger(entry.amountMinor) || entry.amountMinor <= 0 ||
        typeof entry.priceBookId !== "string" || !entry.priceBookId.trim() ||
        typeof entry.priceBookVersion !== "string" || !entry.priceBookVersion.trim() ||
        !["DRAFT", "APPROVED", "RETIRED"].includes(entry.status)
      ) {
        fail("MARKET_PRICE_CONFIGURATION_INVALID");
      }
      const start = parseInstant(entry.effectiveFrom);
      const end = entry.effectiveTo === undefined
        ? Number.POSITIVE_INFINITY
        : parseInstant(entry.effectiveTo);
      if (end <= start) fail("MARKET_PRICE_EFFECTIVE_WINDOW_INVALID");
      return { ...entry };
    });
    this.clock = clock;
  }

  quote(request: MarketPriceQuoteRequest): MarketPriceQuote {
    if (
      !request ||
      typeof request.productId !== "string" || !request.productId.trim() ||
      typeof request.marketId !== "string" || !request.marketId.trim()
    ) {
      fail("MARKET_PRICE_REQUEST_INVALID");
    }
    const now = this.now();
    const active = this.entries.filter((entry) =>
      entry.productId === request.productId &&
      entry.marketId === request.marketId &&
      entry.status === "APPROVED" &&
      this.isEffective(entry, now)
    );
    if (active.length === 0) fail("APPROVED_MARKET_PRICE_NOT_FOUND");
    if (active.length !== 1) fail("MARKET_PRICE_CONFIGURATION_AMBIGUOUS");

    const entry = active[0];
    if (request.currency !== undefined && request.currency !== entry.currency) {
      fail("MARKET_CURRENCY_MISMATCH");
    }
    return { ...entry };
  }

  listMarkets(productId: string): MarketSummary[] {
    if (typeof productId !== "string" || !productId.trim()) {
      fail("MARKET_PRICE_REQUEST_INVALID");
    }
    const now = this.now();
    const byMarket = new Map<string, string>();
    for (const entry of this.entries) {
      if (
        entry.productId !== productId ||
        entry.status !== "APPROVED" ||
        !this.isEffective(entry, now)
      ) continue;

      // Never hide duplicate active records, even if their currencies match.
      if (byMarket.has(entry.marketId)) {
        fail("MARKET_PRICE_CONFIGURATION_AMBIGUOUS");
      }
      byMarket.set(entry.marketId, entry.currency);
    }
    return [...byMarket.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([marketId, currency]) => ({ marketId, currency }));
  }

  private now(): Date {
    const value = this.clock();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      fail("MARKET_PRICE_CLOCK_INVALID");
    }
    return value;
  }

  private isEffective(entry: MarketPriceEntry, now: Date): boolean {
    const time = now.getTime();
    const start = Date.parse(entry.effectiveFrom);
    const end = entry.effectiveTo === undefined
      ? Number.POSITIVE_INFINITY
      : Date.parse(entry.effectiveTo);
    return start <= time && time < end;
  }
}
