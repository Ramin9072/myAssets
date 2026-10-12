import { describe, expect, it } from 'vitest';
import { PriceError } from '../server/errors';
import { parseLiveResponse } from '../server/providers/nerkhsanj';
import { liveBody } from './helpers';

describe('تفسیر پاسخ نرخ‌سنج', () => {
  it('قیمت‌ها و زمان تهران را درست می‌خواند', () => {
    const r = parseLiveResponse(liveBody());
    expect(r.prices.usd).toEqual({ value: 268790, unit: 'toman' });
    expect(r.prices.coinFull?.value).toBe(259000000);
    expect(r.prices.coinFullPre86).toBeUndefined();
    expect(r.usdMarket).toBe('free');
    expect(r.observedAt).toBe('2026-10-11T10:00:00.000Z'); // 1405/07/19 13:30 تهران
    expect(r.marketClosed).toBe(false);
  });
  it('ساعت خالی یعنی بازار بسته', () => {
    const r = parseLiveResponse(liveBody({}, { time: '' }));
    expect(r.marketClosed).toBe(true);
  });
  it('قیمت منفی/صفر/متنی پذیرفته نمی‌شود', () => {
    const r = parseLiveResponse(liveBody({ dollar: -5, half: 0, quarter: '76500000' }));
    expect(r.prices.usd).toBeUndefined();
    expect(r.prices.coinHalf).toBeUndefined();
    expect(r.prices.coinQuarter).toBeUndefined();
    expect(r.prices.gold18).toBeDefined();
  });
  it('ساختار نامعتبر خطای INVALID_RESPONSE می‌دهد', () => {
    for (const bad of [null, 'x', {}, { date: '1405/07/19', time: '', rates: [] }, { date: 'bad', rates: {} }, { date: '1405/13/40', rates: {} }, liveBody({}, { time: '25:99' })]) {
      expect(() => parseLiveResponse(bad)).toThrow(PriceError);
    }
  });
});
