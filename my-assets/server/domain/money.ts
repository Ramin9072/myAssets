import Decimal from 'decimal.js';
import type { PriceUnit } from '../../shared/types';

/** Decimal مستقل با دقت بالا و گردکردن «نیم به بالا» تا خطای اعشاری JS وارد محاسبات مالی نشود */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof D>;

export class InvalidPriceError extends Error {}

/** تبدیل قیمت به ریال. تومان ×۱۰؛ ریال بدون تغییر. قیمت باید عدد متناهی و مثبت باشد. */
export function toRial(value: number, unit: PriceUnit): Dec {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new InvalidPriceError('قیمت نامعتبر است.');
  }
  const d = new D(value);
  return unit === 'toman' ? d.times(10) : d;
}

export function roundToInteger(d: Dec): Dec {
  return d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

export function rialToToman(rial: string | Dec): Dec {
  return new D(rial).dividedBy(10).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}
