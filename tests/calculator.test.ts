import { describe, expect, it } from 'vitest';
import type { PriceKey } from '../shared/assetSpecs';
import type { NormalizedSnapshot, PriceQuote } from '../shared/types';
import { calculate } from '../server/domain/calculator';
import { InvalidPriceError, rialToToman, toRial, D } from '../server/domain/money';
import { buildQuotes } from '../server/domain/quotes';
import { checkConsistency } from '../server/domain/sanity';
import { SAMPLE_ASSETS } from './helpers';

const q = (key: PriceKey, rial: string | null): PriceQuote => ({
  priceKey: key, available: rial !== null, unitPriceRial: rial, rawValue: null, rawUnit: null, derived: false, note: null,
});
const quotes = (o: Partial<Record<PriceKey, string | null>>) => {
  const keys: PriceKey[] = ['coinFull', 'coinFullPre86', 'coinHalf', 'coinHalfPre86', 'coinQuarter', 'coinQuarterPre86', 'usd', 'gold'];
  return Object.fromEntries(keys.map((k) => [k, q(k, o[k] ?? null)])) as Record<PriceKey, PriceQuote>;
};

describe('تبدیل واحد', () => {
  it('تومان به ریال (×۱۰)', () => {
    expect(toRial(268790, 'toman').toFixed()).toBe('2687900');
  });
  it('قیمتی که از قبل ریال است دوباره تبدیل نمی‌شود', () => {
    expect(toRial(2687900, 'rial').toFixed()).toBe('2687900');
  });
  it('قیمت صفر، منفی و نامعتبر رد می‌شود', () => {
    for (const bad of [0, -1, NaN, Infinity]) expect(() => toRial(bad, 'toman')).toThrow(InvalidPriceError);
  });
  it('تبدیل ریال به تومان با گردکردن نیم‌به‌بالا', () => {
    expect(rialToToman('15').toFixed()).toBe('2');
    expect(rialToToman('14').toFixed()).toBe('1');
  });
  it('خطای اعشاری JS در محاسبه مالی وارد نمی‌شود', () => {
    expect(0.1 * 3).not.toBe(0.3); // رفتار شناخته‌شده JS
    expect(new D('0.1').times(3).toFixed()).toBe('0.3');
  });
});

describe('محاسبه ارزش', () => {
  const full = quotes({ coinFull: '2590000000', coinHalf: '1430000000', coinQuarter: '765000000', usd: '2687900', gold: '265287000' });

  it('هر نوع دارایی و مجموع کل', () => {
    const r = calculate(SAMPLE_ASSETS, full);
    const byKey = Object.fromEntries(r.items.map((i) => [i.key, i.valueRial]));
    expect(byKey.coinFull).toBe('7770000000'); // 3 × 2,590,000,000
    expect(byKey.coinHalf).toBe('2860000000');
    expect(byKey.coinQuarter).toBe('3825000000');
    expect(byKey.usd).toBe('3361218950'); // 1250.5 × 2,687,900
    expect(byKey.goldGrams).toBe('11341019250'); // 42.75 گرم × 265,287,000 (تعداد اعشاری)
    const total = ['7770000000', '2860000000', '3825000000', byKey.usd!, byKey.goldGrams!].reduce((a, b) => a.plus(b), new D(0));
    expect(r.totalRial).toBe(total.toFixed());
    expect(r.totalToman).toBe(rialToToman(total).toFixed());
    expect(r.groups.coins).toBe('14455000000');
    expect(r.complete).toBe(true);
  });

  it('قیمت ناموجود: صفر فرض نمی‌شود، «نامشخص» می‌شود و کل ناقص است', () => {
    const r = calculate({ ...SAMPLE_ASSETS, coinFullPre86: 2 }, full);
    const item = r.items.find((i) => i.key === 'coinFullPre86')!;
    expect(item.status).toBe('unknown');
    expect(item.valueRial).toBeNull();
    expect(r.complete).toBe(false);
    expect(r.unknownKeys).toEqual(['coinFullPre86']);
  });

  it('قیمت ناموجود برای مقدار صفر، کل را ناقص نمی‌کند', () => {
    const r = calculate(SAMPLE_ASSETS, full); // pre86 = 0 و قیمت ندارد
    expect(r.items.find((i) => i.key === 'coinFullPre86')!.status).toBe('empty');
    expect(r.complete).toBe(true);
  });

  it('مقدار اعشاری دلار دقیق است', () => {
    const r = calculate({ ...SAMPLE_ASSETS, coinFull: 0, coinHalf: 0, coinQuarter: 0, goldGrams: 0, usd: 0.07 }, full);
    expect(r.totalRial).toBe(new D('0.07').times('2687900').toDecimalPlaces(0).toFixed()); // 188153
  });
});

describe('عیار طلا', () => {
  const snap = {
    prices: {
      gold18: { rial: '265287000', raw: 26528700, rawUnit: 'toman' },
      gold24: { rial: '353716000', raw: 35371600, rawUnit: 'toman' },
    },
    unavailableReasons: {},
  } as unknown as NormalizedSnapshot;
  it('۱۸ و ۲۴ مستقیم، سایر عیارها مشتق‌شده و علامت‌دار', () => {
    expect(buildQuotes(snap, 18).gold).toMatchObject({ unitPriceRial: '265287000', derived: false });
    expect(buildQuotes(snap, 24).gold).toMatchObject({ unitPriceRial: '353716000', derived: false });
    const q21 = buildQuotes(snap, 21).gold;
    expect(q21.derived).toBe(true);
    expect(q21.unitPriceRial).toBe(new D('265287000').times(21).dividedBy(18).toDecimalPlaces(4).toFixed());
  });
});

describe('بررسی سازگاری (گرفتن خطای ده‌برابری)', () => {
  const p = (rial: string) => ({ rial, raw: 1, rawUnit: 'toman' as const });
  it('قیمت‌های عادی پذیرفته می‌شوند', () => {
    expect(checkConsistency({ gold18: p('265287000'), coinFull: p('2590000000'), coinHalf: p('1430000000'), coinQuarter: p('765000000') })).toBeNull();
  });
  it('اگر قیمت سکه ده‌برابر اشتباه باشد رد می‌شود', () => {
    expect(checkConsistency({ gold18: p('265287000'), coinFull: p('259000000') })).not.toBeNull();
    expect(checkConsistency({ gold18: p('26528700'), coinFull: p('2590000000') })).not.toBeNull();
  });
});
