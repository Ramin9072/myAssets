import type { PriceKey } from '../../shared/assetSpecs';
import type { NormalizedSnapshot, PriceQuote } from '../../shared/types';
import { D } from './money';

const DIRECT_KEYS = ['coinFull', 'coinFullPre86', 'coinHalf', 'coinHalfPre86', 'coinQuarter', 'coinQuarterPre86', 'usd'] as const;

/** ساخت قیمت‌های قابل استفاده در محاسبه از یک اسنپ‌شات و عیار انتخابی */
export function buildQuotes(snapshot: NormalizedSnapshot, karat: number): Record<PriceKey, PriceQuote> {
  const quotes = {} as Record<PriceKey, PriceQuote>;
  for (const key of DIRECT_KEYS) {
    const p = snapshot.prices[key];
    quotes[key] = p
      ? { priceKey: key, available: true, unitPriceRial: p.rial, rawValue: p.raw, rawUnit: p.rawUnit, derived: false, note: null }
      : { priceKey: key, available: false, unitPriceRial: null, rawValue: null, rawUnit: null, derived: false, note: snapshot.unavailableReasons[key] ?? 'قیمت از ارائه‌دهنده دریافت نشد.' };
  }

  const g18 = snapshot.prices.gold18;
  const g24 = snapshot.prices.gold24;
  if (karat === 24 && g24) {
    quotes.gold = { priceKey: 'gold', available: true, unitPriceRial: g24.rial, rawValue: g24.raw, rawUnit: g24.rawUnit, derived: false, note: 'قیمت مستقیم هر گرم طلای ۲۴ عیار' };
  } else if (karat === 18 && g18) {
    quotes.gold = { priceKey: 'gold', available: true, unitPriceRial: g18.rial, rawValue: g18.raw, rawUnit: g18.rawUnit, derived: false, note: 'قیمت مستقیم هر گرم طلای ۱۸ عیار' };
  } else if (g18) {
    const derived = new D(g18.rial).times(karat).dividedBy(18);
    quotes.gold = {
      priceKey: 'gold',
      available: true,
      unitPriceRial: derived.toDecimalPlaces(4).toFixed(),
      rawValue: g18.raw,
      rawUnit: g18.rawUnit,
      derived: true,
      note: `محاسبه‌شده از قیمت ۱۸ عیار (× ${karat}/18)؛ قیمت مستقل بازار برای ${karat} عیار نیست و اجرت/سود ندارد.`,
    };
  } else {
    quotes.gold = { priceKey: 'gold', available: false, unitPriceRial: null, rawValue: null, rawUnit: null, derived: false, note: snapshot.unavailableReasons.gold18 ?? 'قیمت طلا از ارائه‌دهنده دریافت نشد.' };
  }
  return quotes;
}
