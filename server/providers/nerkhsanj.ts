import jalaaliLib from 'jalaali-js';
import { PriceError } from '../errors';
import type { BasePriceKey } from '../../shared/types';
import { fetchJson } from './http';
import type { PriceProvider, ProviderResult, RawProviderQuote } from './types';

const jalaali = jalaaliLib as unknown as {
  isValidJalaaliDate(y: number, m: number, d: number): boolean;
  toGregorian(y: number, m: number, d: number): { gy: number; gm: number; gd: number };
};

/**
 * نگاشت کلیدهای پاسخ «نرخ‌سنج» (live.json → rates) به کلیدهای برنامه.
 * توجه: مستندات سرویس برای کلید `bahar` فقط عبارت «Bahar Azadi gold coin» را می‌آورد و طرح (قدیم/جدید)
 * را مشخص نمی‌کند؛ این نگاشت یک فرض قابل‌تغییر است (در README و محدودیت‌ها ذکر شده).
 */
export const NERKHSANJ_KEY_MAP: Partial<Record<BasePriceKey, string>> = {
  coinFull: 'bahar',
  coinHalf: 'half',
  coinQuarter: 'quarter',
  usd: 'dollar',
  gold18: 'gold',
  gold24: 'gold24',
};

const PRE86_REASON = 'این سرویس قیمت مستقل برای طرح «قبل از ۱۳۸۶» ارائه نمی‌دهد؛ قیمت طرح معمولی جایگزین آن نمی‌شود.';

const TEHRAN_OFFSET_MIN = 210; // UTC+03:30 (ایران از ۱۴۰۱ ساعت تابستانی ندارد)

/** تفسیر پاسخ live.json؛ صادر شده برای تست */
export function parseLiveResponse(body: unknown): ProviderResult {
  if (typeof body !== 'object' || body === null) throw new PriceError('INVALID_RESPONSE', 'ساختار پاسخ سرویس نامعتبر است.');
  const b = body as Record<string, unknown>;
  const rates = b.rates;
  if (typeof rates !== 'object' || rates === null || Array.isArray(rates)) {
    throw new PriceError('INVALID_RESPONSE', 'پاسخ سرویس فاقد بخش rates است.');
  }

  const date = typeof b.date === 'string' ? /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(b.date) : null;
  if (!date) throw new PriceError('INVALID_RESPONSE', 'تاریخ پاسخ سرویس نامعتبر است.');
  const [jy, jm, jd] = [Number(date[1]), Number(date[2]), Number(date[3])];
  if (!jalaali.isValidJalaaliDate(jy, jm, jd)) throw new PriceError('INVALID_RESPONSE', 'تاریخ شمسی پاسخ سرویس نامعتبر است.');
  const { gy, gm, gd } = jalaali.toGregorian(jy, jm, jd);

  const timeStr = typeof b.time === 'string' ? b.time.trim() : '';
  let hh = 0;
  let mm = 0;
  let marketClosed = true;
  if (timeStr !== '') {
    const t = /^(\d{1,2}):(\d{2})$/.exec(timeStr);
    if (!t || Number(t[1]) > 23 || Number(t[2]) > 59) throw new PriceError('INVALID_RESPONSE', 'ساعت پاسخ سرویس نامعتبر است.');
    hh = Number(t[1]);
    mm = Number(t[2]);
    marketClosed = false;
  }
  // اگر ساعت خالی باشد (خارج از ساعت بازار) زمان دقیق نامعلوم است؛ محافظه‌کارانه ابتدای همان روز در نظر گرفته می‌شود.
  const observedAt = new Date(Date.UTC(gy, gm - 1, gd, hh, mm) - TEHRAN_OFFSET_MIN * 60_000).toISOString();

  const r = rates as Record<string, unknown>;
  const prices: ProviderResult['prices'] = {};
  for (const [ourKey, theirKey] of Object.entries(NERKHSANJ_KEY_MAP) as [BasePriceKey, string][]) {
    const v = r[theirKey];
    // مقدار غایب/نامعتبر/غیرمثبت پذیرفته نمی‌شود و آن قلم «قیمت نامشخص» می‌ماند
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      prices[ourKey] = { value: v, unit: 'toman' } satisfies RawProviderQuote;
    }
  }
  return { observedAt, marketClosed, usdMarket: 'free', prices };
}

export function createNerkhsanjProvider(opts: { baseUrl: string }): PriceProvider {
  const base = opts.baseUrl.replace(/\/+$/, '');
  return {
    id: 'nerkhsanj',
    name: 'نرخ‌سنج (Nerkhsanj)',
    sourceUrl: `${base}/data/live.json`,
    attribution: 'نرخ‌سنج',
    description:
      'سرویس رایگان و بدون کلید؛ نرخ بازار آزاد تهران به تومان، به‌روزرسانی هر دقیقه. حداکثر دقیقه‌ای یک‌بار از آن بخوانید و منبع را نمایش دهید.',
    supportedUsdMarkets: ['free'],
    declaredUnit: 'toman',
    unavailable: {
      coinFullPre86: PRE86_REASON,
      coinHalfPre86: PRE86_REASON,
      coinQuarterPre86: PRE86_REASON,
    },
    async fetch(ctx) {
      const body = await fetchJson(`${base}/data/live.json`, ctx);
      return parseLiveResponse(body);
    },
  };
}
