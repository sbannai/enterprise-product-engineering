export type MarketPriceStatus = "DRAFT" | "APPROVED" | string;
export interface MarketPriceEntry {
  productId: string; marketId: string; currency: string; amountMinor: number;
  priceBookId: string; priceBookVersion: string; status: MarketPriceStatus;
  effectiveFrom: string; effectiveTo?: string;
}
export interface MarketPriceQuoteRequest { productId: string; marketId: string; currency?: string; }
export interface MarketPriceQuote extends MarketPriceEntry {}
type Clock = () => Date;
const fail = (code: string): never => { throw new Error(code); };
function instant(value: string, code: string): number {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) fail(code);
  return time;
}
/** Resolves explicitly configured market prices; it never performs FX conversion. */
export class MarketPriceBookService {
  private readonly entries: readonly MarketPriceEntry[];
  private readonly clock: Clock;
  constructor(entries: readonly MarketPriceEntry[], clock: Clock = () => new Date()) {
    if (!Array.isArray(entries)) fail("MARKET_PRICE_CONFIGURATION_INVALID");
    this.entries = entries.map((entry) => {
      if (!entry || typeof entry.productId !== "string" || !entry.productId.trim() ||
        typeof entry.marketId !== "string" || !entry.marketId.trim() ||
        typeof entry.currency !== "string" || !/^[A-Z]{3}$/.test(entry.currency) ||
        !Number.isSafeInteger(entry.amountMinor) || entry.amountMinor <= 0 ||
        typeof entry.priceBookId !== "string" || !entry.priceBookId.trim() ||
        typeof entry.priceBookVersion !== "string" || !entry.priceBookVersion.trim() ||
        typeof entry.status !== "string") fail("MARKET_PRICE_AMOUNT_INVALID");
      const start = instant(entry.effectiveFrom, "MARKET_PRICE_EFFECTIVE_WINDOW_INVALID");
      if (entry.effectiveTo !== undefined) {
        const end = instant(entry.effectiveTo, "MARKET_PRICE_EFFECTIVE_WINDOW_INVALID");
        if (end <= start) fail("MARKET_PRICE_EFFECTIVE_WINDOW_INVALID");
      }
      return { ...entry };
    });
    this.clock = clock;
  }
  quote(request: MarketPriceQuoteRequest): MarketPriceQuote {
    if (!request || typeof request.productId !== "string" || !request.productId.trim() ||
      typeof request.marketId !== "string" || !request.marketId.trim()) fail("MARKET_PRICE_REQUEST_INVALID");
    const now = this.clock().getTime();
    if (!Number.isFinite(now)) fail("MARKET_PRICE_CLOCK_INVALID");
    const matching = this.entries.filter((entry) => {
      if (entry.productId !== request.productId || entry.marketId !== request.marketId || entry.status !== "APPROVED") return false;
      const start = Date.parse(entry.effectiveFrom);
      const end = entry.effectiveTo === undefined ? Number.POSITIVE_INFINITY : Date.parse(entry.effectiveTo);
      return start <= now && now < end;
    });
    if (matching.length === 0) fail("APPROVED_MARKET_PRICE_NOT_FOUND");
    if (matching.length > 1) fail("MARKET_PRICE_CONFIGURATION_AMBIGUOUS");
    const selected = matching[0];
    if (request.currency !== undefined && request.currency !== selected.currency) fail("MARKET_CURRENCY_MISMATCH");
    return { ...selected };
  }
  listMarkets(productId: string): Array<{ marketId: string; currency: string }> {
    if (typeof productId !== "string" || !productId.trim()) fail("MARKET_PRICE_REQUEST_INVALID");
    const now = this.clock().getTime();
    if (!Number.isFinite(now)) fail("MARKET_PRICE_CLOCK_INVALID");
    const markets = new Map<string, string>();
    for (const entry of this.entries) {
      const start = Date.parse(entry.effectiveFrom);
      const end = entry.effectiveTo === undefined ? Number.POSITIVE_INFINITY : Date.parse(entry.effectiveTo);
      if (entry.productId === productId && entry.status === "APPROVED" && start <= now && now < end) {
        const prior = markets.get(entry.marketId);
        if (prior !== undefined && prior !== entry.currency) fail("MARKET_PRICE_CONFIGURATION_AMBIGUOUS");
        markets.set(entry.marketId, entry.currency);
      }
    }
    return [...markets.entries()].map(([marketId, currency]) => ({ marketId, currency }))
      .sort((a, b) => a.marketId.localeCompare(b.marketId));
  }
}