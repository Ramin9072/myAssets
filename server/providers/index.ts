import type { PriceProvider } from './types';
import { createNerkhsanjProvider } from './nerkhsanj';

export const DEFAULT_PRICE_API_BASE_URL = 'https://nerkh.jahankhahan.shop';

export interface ProviderEnv {
  PRICE_API_BASE_URL?: string;
  PRICE_PROVIDER_API_KEY?: string;
}

/** ثبت ارائه‌دهنده‌ها. برای افزودن سرویس جدید، فایل آن را بسازید و اینجا اضافه کنید. */
export function createProviders(env: ProviderEnv = {}): PriceProvider[] {
  return [createNerkhsanjProvider({ baseUrl: env.PRICE_API_BASE_URL?.trim() || DEFAULT_PRICE_API_BASE_URL })];
}
