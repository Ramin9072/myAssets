import { afterEach, describe, expect, it } from 'vitest';
import { SAMPLE_ASSETS, jsonFetch, liveBody, startTestApp } from './helpers';

let ctx: Awaited<ReturnType<typeof startTestApp>> | null = null;
afterEach(async () => { await ctx?.close(); ctx = null; });

const prep = async (assets = { ...SAMPLE_ASSETS, coinFullPre86: 2 }) => {
  ctx = await startTestApp(jsonFetch(liveBody()));
  const cur = await ctx.call('GET', '/api/assets');
  await ctx.call('PUT', '/api/assets', { assets, baseRevision: cur.json.revision });
  await ctx.call('POST', '/api/calculate', {}); // یک دریافت موفق تا قیمت مرجع ذخیره شود
};

describe('قیمت دستی', () => {
  it('جای خالی قیمت سرویس را پر می‌کند، جمع کامل می‌شود و منبع «دستی» ثبت می‌شود', async () => {
    await prep();
    const before = (await ctx!.call('POST', '/api/calculate', {})).json.entry;
    expect(before.result.complete).toBe(false);

    const put = await ctx!.call('PUT', '/api/manual-prices', { prices: { coinFullPre86: { value: 258000000, unit: 'toman' } } });
    expect(put.status).toBe(200);
    expect(put.json.prices.coinFullPre86.rial).toBe('2580000000'); // تومان × ۱۰
    expect(put.json.prices.coinFullPre86.enteredAt).toBeTruthy();

    const e = (await ctx!.call('POST', '/api/calculate', {})).json.entry;
    const q = e.quotes.coinFullPre86;
    expect(q.available).toBe(true);
    expect(q.source).toBe('manual');
    expect(q.enteredAt).toBeTruthy();
    expect(e.result.complete).toBe(true);
    expect(e.result.items.find((i: any) => i.key === 'coinFullPre86').valueRial).toBe('5160000000'); // 2 × 2,580,000,000
    expect(e.result.totalRial).toBe(String(BigInt(before.result.totalRial) + 5160000000n));
    // رکورد قبلی تاریخچه تغییر نکرده است
    const old = (await ctx!.call('GET', `/api/history/${before.id}`)).json.entry;
    expect(old.result.complete).toBe(false);
  });

  it('قیمت سرویس همیشه بر قیمت دستی ارجح است', async () => {
    await prep();
    await ctx!.call('PUT', '/api/manual-prices', { prices: { coinFull: { value: 1, unit: 'toman' } } });
    const e = (await ctx!.call('POST', '/api/calculate', {})).json.entry;
    expect(e.quotes.coinFull.source).toBe('provider');
    expect(e.quotes.coinFull.unitPriceRial).toBe('2590000000');
  });

  it('واحد ریال دوباره ×۱۰ نمی‌شود', async () => {
    await prep();
    const r = await ctx!.call('PUT', '/api/manual-prices', { prices: { coinHalfPre86: { value: 1400000000, unit: 'rial' } } });
    expect(r.json.prices.coinHalfPre86.rial).toBe('1400000000');
  });

  it('اشتباه ده‌برابری، منفی، اعشاری و کلید نامعتبر رد می‌شود', async () => {
    await prep();
    const bad = [
      { coinFullPre86: { value: 2580000000, unit: 'toman' } }, // ده‌برابر (مثل وارد کردن ریال با واحد تومان)
      { coinFullPre86: { value: 25800000, unit: 'toman' } }, // یک‌دهم
      { coinFullPre86: { value: -5, unit: 'toman' } },
      { coinFullPre86: { value: 1.5, unit: 'toman' } },
      { coinFullPre86: { value: 100, unit: 'dollar' } },
      { usd: { value: 100000, unit: 'toman' } },
      { gold: { value: 100000, unit: 'toman' } },
    ];
    for (const prices of bad) expect((await ctx!.call('PUT', '/api/manual-prices', { prices })).status).toBe(400);
    expect((await ctx!.call('GET', '/api/manual-prices')).json.prices).toEqual({});
  });

  it('حذف قیمت دستی (null) و حفظ سایر کلیدها', async () => {
    await prep();
    await ctx!.call('PUT', '/api/manual-prices', { prices: { coinFullPre86: { value: 258000000, unit: 'toman' }, coinHalfPre86: { value: 140000000, unit: 'toman' } } });
    const r = await ctx!.call('PUT', '/api/manual-prices', { prices: { coinFullPre86: null } });
    expect(Object.keys(r.json.prices)).toEqual(['coinHalfPre86']);
    const e = (await ctx!.call('POST', '/api/calculate', {})).json.entry;
    expect(e.quotes.coinFullPre86.available).toBe(false);
  });
});
