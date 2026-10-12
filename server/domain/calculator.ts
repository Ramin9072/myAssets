import { ASSET_KEYS, ASSET_SPECS, type Assets, type PriceKey } from '../../shared/assetSpecs';
import type { CalculationResult, ItemResult, PriceQuote } from '../../shared/types';
import { D, rialToToman, roundToInteger } from './money';

/**
 * محاسبه ارزش دارایی‌ها (ریال).
 * - ارزش هر ردیف = مقدار × قیمت واحد، گردشده به ریال صحیح.
 * - ردیف دارای مقدار ولی بدون قیمت: «نامشخص» (صفر فرض نمی‌شود) و کل ناقص علامت می‌خورد.
 * - ردیف با مقدار صفر: ارزش صفر و تأثیری در کامل‌بودن ندارد.
 */
export function calculate(assets: Assets, quotes: Record<PriceKey, PriceQuote>): CalculationResult {
  const items: ItemResult[] = [];
  const groups = { coins: new D(0), usd: new D(0), gold: new D(0) };
  const unknownKeys: ItemResult['key'][] = [];

  for (const key of ASSET_KEYS) {
    const spec = ASSET_SPECS[key];
    const quantity = assets[key];
    const quote = quotes[spec.priceKey];
    const hasPrice = quote?.available && quote.unitPriceRial !== null;

    if (quantity === 0) {
      items.push({ key, label: spec.label, unit: spec.unit, quantity, unitPriceRial: hasPrice ? quote!.unitPriceRial : null, valueRial: '0', status: 'empty' });
      continue;
    }
    if (!hasPrice) {
      unknownKeys.push(key);
      items.push({ key, label: spec.label, unit: spec.unit, quantity, unitPriceRial: null, valueRial: null, status: 'unknown' });
      continue;
    }
    const value = roundToInteger(new D(quantity).times(quote!.unitPriceRial!));
    groups[spec.group] = groups[spec.group].plus(value);
    items.push({ key, label: spec.label, unit: spec.unit, quantity, unitPriceRial: quote!.unitPriceRial, valueRial: value.toFixed(), status: 'priced' });
  }

  const total = groups.coins.plus(groups.usd).plus(groups.gold);
  return {
    items,
    groups: { coins: groups.coins.toFixed(), usd: groups.usd.toFixed(), gold: groups.gold.toFixed() },
    totalRial: total.toFixed(),
    totalToman: rialToToman(total).toFixed(),
    complete: unknownKeys.length === 0,
    unknownKeys,
  };
}
