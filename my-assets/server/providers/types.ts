import type { BasePriceKey, DollarMarket, PriceUnit } from '../../shared/types';

export interface RawProviderQuote {
  value: number;
  unit: PriceUnit;
}

export interface ProviderResult {
  /** زمان قیمت طبق اعلام ارائه‌دهنده (ISO) یا null */
  observedAt: string | null;
  marketClosed: boolean | null;
  usdMarket: DollarMarket;
  prices: Partial<Record<BasePriceKey, RawProviderQuote>>;
}

export interface FetchContext {
  timeoutMs: number;
  fetchImpl: typeof fetch;
}

/**
 * قرارداد ارائه‌دهنده قیمت. برای تغییر سرویس در آینده فقط یک فایل جدید در server/providers
 * بسازید که این رابط را پیاده کند و در providers/index.ts ثبت کنید؛ منطق محاسبات تغییر نمی‌کند.
 */
export interface PriceProvider {
  id: string;
  name: string;
  sourceUrl: string;
  attribution: string;
  description: string;
  supportedUsdMarkets: DollarMarket[];
  /** واحدی که ارائه‌دهنده طبق مستندات خود برمی‌گرداند */
  declaredUnit: PriceUnit;
  /** کلیدهایی که این ارائه‌دهنده هرگز ندارد، همراه با دلیل (نمایش صریح محدودیت به کاربر) */
  unavailable: Partial<Record<BasePriceKey, string>>;
  fetch(ctx: FetchContext): Promise<ProviderResult>;
}
