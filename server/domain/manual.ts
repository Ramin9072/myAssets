import { MANUAL_KEYS, type ManualKey, type ManualPrice, type NormalizedSnapshot, type PriceUnit } from '../../shared/types';
import { D, InvalidPriceError, toRial } from './money';

export const isManualKey = (k: string): k is ManualKey => (MANUAL_KEYS as readonly string[]).includes(k);

const MAX_RAW = 10_000_000_000_000; // ۱۰ تریلیون

export function buildManualPrice(value: unknown, unit: unknown, now: Date): ManualPrice {
  if (unit !== 'toman' && unit !== 'rial') throw new InvalidPriceError('واحد قیمت باید تومان یا ریال باشد.');
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > MAX_RAW) {
    throw new InvalidPriceError('قیمت باید یک عدد صحیح مثبت باشد.');
  }
  return { rial: toRial(value, unit as PriceUnit).toFixed(), raw: value, rawUnit: unit as PriceUnit, enteredAt: now.toISOString() };
}

const SAME_TYPE: Partial<Record<ManualKey, 'coinFull' | 'coinHalf' | 'coinQuarter'>> = {
  coinFullPre86: 'coinFull',
  coinHalfPre86: 'coinHalf',
  coinQuarterPre86: 'coinQuarter',
};

/**
 * محافظت در برابر اشتباه ده‌برابری: قیمت دستی سکه طرح قدیم باید نسبت منطقی (۰٫۵ تا ۲ برابر)
 * به قیمت سکه هم‌نوع از سرویس داشته باشد. اگر قیمت سرویس در دسترس نباشد، چیزی بررسی نمی‌شود.
 */
export function checkManualAgainst(key: ManualKey, price: ManualPrice, prices: NormalizedSnapshot['prices'] | undefined): string | null {
  const ref = SAME_TYPE[key];
  const refPrice = ref ? prices?.[ref] : undefined;
  if (!refPrice) return null;
  const ratio = new D(price.rial).dividedBy(refPrice.rial);
  if (ratio.lt(0.5) || ratio.gt(2)) {
    return `قیمت واردشده ${ratio.toDecimalPlaces(2).toString()} برابر قیمت سکه هم‌نوع در سرویس است؛ احتمالاً واحد (ریال/تومان) یا تعداد صفرها اشتباه است.`;
  }
  return null;
}
