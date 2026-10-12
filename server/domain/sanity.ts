import type { NormalizedSnapshot } from '../../shared/types';
import { D } from './money';

/**
 * بررسی سازگاری قیمت‌ها برای گرفتن خطای ده‌برابری تومان/ریال.
 * نسبت قیمت هر سکه به قیمت هر گرم طلای ۱۸ عیار باید در بازه‌ای منطقی باشد
 * (تمام ≈ ۹ تا ۱۱، نیم ≈ ۵، ربع ≈ ۳ به‌همراه حباب). اگر واحد ده‌برابر اشتباه باشد از بازه خارج می‌شود.
 */
const RANGES: Array<{ key: 'coinFull' | 'coinHalf' | 'coinQuarter'; min: number; max: number }> = [
  { key: 'coinFull', min: 6, max: 16 },
  { key: 'coinHalf', min: 3, max: 8.5 },
  { key: 'coinQuarter', min: 1.5, max: 5 },
];

export function checkConsistency(prices: NormalizedSnapshot['prices']): string | null {
  const gold = prices.gold18;
  if (!gold) return null;
  for (const r of RANGES) {
    const coin = prices[r.key];
    if (!coin) continue;
    const ratio = new D(coin.rial).dividedBy(gold.rial);
    if (ratio.lt(r.min) || ratio.gt(r.max)) {
      return `نسبت قیمت ${r.key} به طلای ۱۸ عیار (${ratio.toDecimalPlaces(2).toString()}) خارج از بازه منطقی است؛ احتمال اشتباه واحد (ریال/تومان) یا داده نامعتبر.`;
    }
  }
  return null;
}
