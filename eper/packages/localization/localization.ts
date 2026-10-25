export const SUPPORTED_LOCALES = ["en-IN", "te-IN", "hi-IN"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const SUPPORTED_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export interface LocalizationPreference {
  locale: SupportedLocale;
  currency: SupportedCurrency;
  timeZone: string;
}

export interface LocalizationOptions {
  locales: Array<{ code: SupportedLocale; language: string; nativeName: string; defaultCurrency: SupportedCurrency }>;
  currencies: Array<{ code: SupportedCurrency; displayName: string }>;
}

const DEFAULT_PREFERENCE: LocalizationPreference = {
  locale: "en-IN",
  currency: "INR",
  timeZone: "Asia/Kolkata",
};

const LOCALES: LocalizationOptions["locales"] = [
  { code: "en-IN", language: "English", nativeName: "English", defaultCurrency: "INR" },
  { code: "te-IN", language: "Telugu", nativeName: "తెలుగు", defaultCurrency: "INR" },
  { code: "hi-IN", language: "Hindi", nativeName: "हिन्दी", defaultCurrency: "INR" },
];

const CURRENCIES: LocalizationOptions["currencies"] = [
  { code: "INR", displayName: "Indian Rupee" },
  { code: "USD", displayName: "US Dollar" },
  { code: "EUR", displayName: "Euro" },
  { code: "GBP", displayName: "Pound Sterling" },
  { code: "AED", displayName: "UAE Dirham" },
];

const MESSAGES = {
  "en-IN": {
    paymentPending: "Payment pending",
    paymentSucceeded: "Payment successful",
    paymentFailed: "Payment failed",
    receiptUnavailable: "Receipt is available after successful payment",
    amount: "Amount",
    downloadReceipt: "Download receipt",
  },
  "te-IN": {
    paymentPending: "చెల్లింపు పెండింగ్‌లో ఉంది",
    paymentSucceeded: "చెల్లింపు విజయవంతమైంది",
    paymentFailed: "చెల్లింపు విఫలమైంది",
    receiptUnavailable: "చెల్లింపు విజయవంతమైన తర్వాత రసీదు అందుబాటులో ఉంటుంది",
    amount: "మొత్తం",
    downloadReceipt: "రసీదును డౌన్‌లోడ్ చేయండి",
  },
  "hi-IN": {
    paymentPending: "भुगतान लंबित है",
    paymentSucceeded: "भुगतान सफल हुआ",
    paymentFailed: "भुगतान विफल हुआ",
    receiptUnavailable: "सफल भुगतान के बाद रसीद उपलब्ध होगी",
    amount: "राशि",
    downloadReceipt: "रसीद डाउनलोड करें",
  },
} as const;

export class LocalizationService {
  static readonly MAX_IN_MEMORY_PREFERENCES = 10_000;
  private readonly preferences = new Map<string, LocalizationPreference>();

  options(): LocalizationOptions {
    return {
      locales: LOCALES.map((item) => ({ ...item })),
      currencies: CURRENCIES.map((item) => ({ ...item })),
    };
  }

  getPreference(tenantId: string, principalId: string): LocalizationPreference {
    this.assertActor(tenantId, principalId);
    return { ...(this.preferences.get(this.key(tenantId, principalId)) ?? DEFAULT_PREFERENCE) };
  }

  setPreference(
    tenantId: string,
    principalId: string,
    input: Partial<LocalizationPreference>,
  ): LocalizationPreference {
    this.assertActor(tenantId, principalId);
    const current = this.getPreference(tenantId, principalId);
    const locale = input.locale ?? current.locale;
    const currency = input.currency ?? current.currency;
    const timeZone = input.timeZone ?? current.timeZone;

    if (!(SUPPORTED_LOCALES as readonly string[]).includes(locale)) throw new Error("LOCALE_UNSUPPORTED");
    if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(currency)) throw new Error("CURRENCY_UNSUPPORTED");
    try {
      new Intl.DateTimeFormat(locale, { timeZone }).format(new Date(0));
    } catch {
      throw new Error("TIME_ZONE_INVALID");
    }

    const next = { locale, currency, timeZone };
    const preferenceKey = this.key(tenantId, principalId);
    if (!this.preferences.has(preferenceKey) && this.preferences.size >= LocalizationService.MAX_IN_MEMORY_PREFERENCES) {
      throw new Error("LOCALIZATION_STORE_CAPACITY_REACHED");
    }
    this.preferences.set(preferenceKey, next);
    return { ...next };
  }

  translate(locale: SupportedLocale, key: keyof (typeof MESSAGES)["en-IN"]): string {
    if (!(SUPPORTED_LOCALES as readonly string[]).includes(locale)) throw new Error("LOCALE_UNSUPPORTED");
    return MESSAGES[locale][key];
  }

  formatMoney(amount: number, currency: SupportedCurrency, locale: SupportedLocale): string {
    if (!Number.isFinite(amount)) throw new Error("MONEY_AMOUNT_INVALID");
    if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(currency)) throw new Error("CURRENCY_UNSUPPORTED");
    if (!(SUPPORTED_LOCALES as readonly string[]).includes(locale)) throw new Error("LOCALE_UNSUPPORTED");
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "symbol",
    }).format(amount);
  }

  formatDate(value: Date | string | number, locale: SupportedLocale, timeZone: string): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error("DATE_INVALID");
    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone,
      }).format(date);
    } catch {
      throw new Error("TIME_ZONE_INVALID");
    }
  }

  private key(tenantId: string, principalId: string): string {
    return `${tenantId}\u0000${principalId}`;
  }

  private assertActor(tenantId: string, principalId: string): void {
    if (!tenantId?.trim() || !principalId?.trim()) throw new Error("LOCALIZATION_ACTOR_REQUIRED");
  }
}

/**
 * Currency conversion is deliberately separate from formatting. A caller must
 * supply a sourced, dated FX rate; this service never invents or caches rates.
 * Rates mean: target major units for one source major unit.
 */
export interface FxRate {
  source: string;
  asOf: string;
  rate: number;
  from: SupportedCurrency;
  to: SupportedCurrency;
}

export function convertMoney(amount: number, rate: FxRate): number {
  if (!Number.isFinite(amount)) throw new Error("MONEY_AMOUNT_INVALID");
  if (!rate.source?.trim() || !rate.asOf?.trim() || !Number.isFinite(Date.parse(rate.asOf))) {
    throw new Error("FX_RATE_SOURCE_AND_TIMESTAMP_REQUIRED");
  }
  if (!Number.isFinite(rate.rate) || rate.rate <= 0) throw new Error("FX_RATE_INVALID");
  if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(rate.from) ||
      !(SUPPORTED_CURRENCIES as readonly string[]).includes(rate.to)) throw new Error("CURRENCY_UNSUPPORTED");
  if (rate.from === rate.to && rate.rate !== 1) throw new Error("FX_SAME_CURRENCY_RATE_MUST_BE_ONE");
  return Math.round((amount * rate.rate + Number.EPSILON) * 100) / 100;
}
