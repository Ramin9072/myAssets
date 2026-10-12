import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SAMPLE_ASSETS, jsonFetch, liveBody, startTestApp } from './helpers';

let ctx: Awaited<ReturnType<typeof startTestApp>> | null = null;
afterEach(async () => { await ctx?.close(); ctx = null; });

const save = async (assets = SAMPLE_ASSETS) => {
  const cur = await ctx!.call('GET', '/api/assets');
  return ctx!.call('PUT', '/api/assets', { assets, baseRevision: cur.json.revision });
};

describe('ذخیره و بارگذاری دارایی‌ها', () => {
  it('فایل اولیه ساخته می‌شود و ذخیره، در assets.json خوانا و پایدار است', async () => {
    ctx = await startTestApp(jsonFetch(liveBody()));
    const first = await ctx.call('GET', '/api/assets');
    expect(first.json.assets.usd).toBe(0);

    const r = await save();
    expect(r.status).toBe(200);
    expect(r.json.updatedAt).toBeTruthy();

    const onDisk = JSON.parse(await readFile(join(ctx.dataDir, 'assets.json'), 'utf8'));
    expect(onDisk.assets.usd).toBe(1250.5);
    expect((await ctx.call('GET', '/api/assets')).json.assets).toEqual(SAMPLE_ASSETS);
  });

  it('مقدار منفی و کلید ناشناخته در سرور رد می‌شود و فایل تغییر نمی‌کند', async () => {
    ctx = await startTestApp(jsonFetch(liveBody()));
    await save();
    const before = await readFile(join(ctx.dataDir, 'assets.json'), 'utf8');
    expect((await ctx.call('PUT', '/api/assets', { assets: { ...SAMPLE_ASSETS, usd: -1 } })).status).toBe(400);
    expect((await ctx.call('PUT', '/api/assets', { assets: { ...SAMPLE_ASSETS, hack: 1 } })).status).toBe(400);
    expect(await readFile(join(ctx.dataDir, 'assets.json'), 'utf8')).toBe(before);
  });

  it('ویرایش دستی فایل بعد از بارگذاری → تعارض (۴۰۹) و بدون بازنویسی', async () => {
    ctx = await startTestApp(jsonFetch(liveBody()));
    const cur = await ctx.call('GET', '/api/assets');
    const file = join(ctx.dataDir, 'assets.json');
    const doc = JSON.parse(await readFile(file, 'utf8'));
    doc.assets.usd = 99;
    await writeFile(file, JSON.stringify(doc, null, 2));
    const r = await ctx.call('PUT', '/api/assets', { assets: SAMPLE_ASSETS, baseRevision: cur.json.revision });
    expect(r.status).toBe(409);
    expect(JSON.parse(await readFile(file, 'utf8')).assets.usd).toBe(99);
  });

  it('فایل خراب بازنویسی نمی‌شود', async () => {
    ctx = await startTestApp(jsonFetch(liveBody()));
    const file = join(ctx.dataDir, 'assets.json');
    await writeFile(file, '{ not json');
    expect((await ctx.call('GET', '/api/assets')).status).toBe(500);
    expect((await ctx.call('PUT', '/api/assets', { assets: SAMPLE_ASSETS })).status).toBe(500);
    expect(await readFile(file, 'utf8')).toBe('{ not json');
  });

  it('درخواست نوشتن بدون هدر امنیتی رد می‌شود', async () => {
    ctx = await startTestApp(jsonFetch(liveBody()));
    const res = await fetch(ctx.base + '/api/assets', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(403);
  });
});

describe('پشتیبان‌گیری و بازیابی', () => {
  it('پشتیبان دانلود، سپس بازیابی با تأیید', async () => {
    ctx = await startTestApp(jsonFetch(liveBody()));
    await save();
    const backup = JSON.parse((await ctx.call('GET', '/api/assets/backup')).text);
    expect(backup.format).toBe('my-assets-backup');

    await save({ ...SAMPLE_ASSETS, usd: 1, coinFull: 0 });
    const noConfirm = await ctx.call('POST', '/api/assets/restore', { backup });
    expect(noConfirm.status).toBe(400);

    const ok = await ctx.call('POST', '/api/assets/restore', { backup, confirmed: true });
    expect(ok.status).toBe(200);
    expect((await ctx.call('GET', '/api/assets')).json.assets).toEqual(SAMPLE_ASSETS);
  });

  it('پشتیبان نامعتبر رد می‌شود', async () => {
    ctx = await startTestApp(jsonFetch(liveBody()));
    await save();
    for (const bad of [{}, { format: 'x', version: 1, assets: SAMPLE_ASSETS }, { format: 'my-assets-backup', version: 1, assets: { ...SAMPLE_ASSETS, usd: -2 } }]) {
      expect((await ctx.call('POST', '/api/assets/restore', { backup: bad, confirmed: true })).status).toBe(400);
    }
    expect((await ctx.call('GET', '/api/assets')).json.assets).toEqual(SAMPLE_ASSETS);
  });
});

describe('محاسبه', () => {
  it('محاسبه موفق با قیمت تازه، ذخیره در تاریخچه و تبدیل تومان به ریال', async () => {
    ctx = await startTestApp(jsonFetch(liveBody()));
    await save();
    const r = await ctx.call('POST', '/api/calculate', {});
    expect(r.status).toBe(200);
    const e = r.json.entry;
    expect(e.priceStatus).toBe('fresh');
    expect(e.quotes.usd.unitPriceRial).toBe('2687900'); // 268790 تومان × ۱۰
    expect(e.quotes.usd.rawUnit).toBe('toman');
    expect(e.result.groups.coins).toBe('14455000000');
    expect(e.result.complete).toBe(true);

    const list = await ctx.call('GET', '/api/history');
    expect(list.json).toHaveLength(1);
    const detail = await ctx.call('GET', `/api/history/${e.id}`);
    expect(detail.json.entry.assets).toEqual(SAMPLE_ASSETS);
  });

  it('نتایج قدیمی با تغییر دارایی‌ها بازنویسی نمی‌شوند', async () => {
    ctx = await startTestApp(jsonFetch(liveBody()));
    await save();
    const first = (await ctx.call('POST', '/api/calculate', {})).json.entry;
    await save({ ...SAMPLE_ASSETS, coinFull: 100 });
    const detail = (await ctx.call('GET', `/api/history/${first.id}`)).json.entry;
    expect(detail.assets.coinFull).toBe(3);
    expect(detail.result.totalRial).toBe(first.result.totalRial);
  });

  it('تاریخچه بعد از راه‌اندازی مجدد سرور باقی می‌ماند', async () => {
    ctx = await startTestApp(jsonFetch(liveBody()));
    await ctx.call('POST', '/api/calculate', {});
    const { createApp } = await import('../server/app');
    const app2 = await createApp({ dataDir: ctx.dataDir, fetchImpl: jsonFetch(liveBody()), now: () => new Date('2026-10-11T10:00:00Z') });
    const srv = app2.listen(0, '127.0.0.1');
    await new Promise((r) => srv.once('listening', r));
    const port = (srv.address() as { port: number }).port;
    const list = await (await fetch(`http://127.0.0.1:${port}/api/history`)).json();
    srv.close();
    expect(list).toHaveLength(1);
  });

  it('قیمت ناموجود (سکه قبل از ۱۳۸۶) → «نامشخص» و مجموع ناقص', async () => {
    ctx = await startTestApp(jsonFetch(liveBody()));
    await save({ ...SAMPLE_ASSETS, coinFullPre86: 2 });
    const e = (await ctx.call('POST', '/api/calculate', {})).json.entry;
    expect(e.result.complete).toBe(false);
    expect(e.result.unknownKeys).toEqual(['coinFullPre86']);
    expect(e.quotes.coinFullPre86.available).toBe(false);
    expect(e.quotes.coinFullPre86.note).toContain('۱۳۸۶');
  });

  it('سرویس از دسترس خارج: خطا، آخرین قیمت معتبر اعلام می‌شود و بدون تأیید با قیمت قدیمی محاسبه نمی‌شود', async () => {
    let up = true;
    const flaky = (async () => {
      if (!up) throw new TypeError('network down');
      return new Response(JSON.stringify(liveBody()), { status: 200 });
    }) as typeof fetch;
    ctx = await startTestApp(flaky);
    await save();
    expect((await ctx.call('POST', '/api/calculate', {})).status).toBe(200);

    up = false;
    const fail = await ctx.call('POST', '/api/calculate', {});
    expect(fail.status).toBe(502);
    expect(fail.json.error.code).toBe('PRICE_NETWORK');
    expect(fail.json.lastValid.fetchedAt).toBeTruthy();

    expect((await ctx.call('POST', '/api/calculate', { mode: 'cached' })).status).toBe(400);
    const cached = await ctx.call('POST', '/api/calculate', { mode: 'cached', acceptStale: true });
    expect(cached.status).toBe(200);
    expect(cached.json.entry.priceStatus).toBe('cached');

    const st = (await ctx.call('GET', '/api/prices/status')).json;
    expect(st.state).toBe('error');
    expect(st.lastError.code).toBe('NETWORK');
  });

  it('سرویس کند: TIMEOUT', async () => {
    const slow = ((_u: unknown, init?: RequestInit) =>
      new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))))) as unknown as typeof fetch;
    ctx = await startTestApp(slow);
    await ctx.call('PUT', '/api/settings', { goldKarat: 18, providerId: 'nerkhsanj', dollarMarket: 'free', unitMode: 'auto', staleAfterMinutes: 120, timeoutMs: 1000, retries: 0, sanityCheck: true });
    const r = await ctx.call('POST', '/api/calculate', {});
    expect(r.status).toBe(502);
    expect(r.json.error.code).toBe('PRICE_TIMEOUT');
  }, 10_000);

  it('قیمت قدیمی (زمان سرویس قدیمی): ۴۰۹ و فقط با تأیید صریح محاسبه می‌شود', async () => {
    ctx = await startTestApp(jsonFetch(liveBody()), { now: () => new Date('2026-10-11T16:00:00Z') }); // ۶ ساعت بعد
    await save();
    const r = await ctx.call('POST', '/api/calculate', {});
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('STALE_PRICES');
    expect(r.json.ageMinutes).toBe(360);
    const ok = await ctx.call('POST', '/api/calculate', { acceptStale: true });
    expect(ok.status).toBe(200);
    expect(ok.json.entry.priceStatus).toBe('stale');
  });

  it('پاسخ نامعتبر سرویس (JSON خراب، ساختار غلط، HTTP 500) → خطا و بدون ثبت تاریخچه', async () => {
    for (const f of [
      (async () => new Response('<html>oops</html>', { status: 200 })) as typeof fetch,
      jsonFetch({ hello: 'world' }),
      jsonFetch({}, 500),
    ]) {
      ctx = await startTestApp(f);
      const r = await ctx.call('POST', '/api/calculate', {});
      expect(r.status).toBe(502);
      expect((await ctx.call('GET', '/api/history')).json).toHaveLength(0);
      await ctx.close();
      ctx = null;
    }
  });

  it('اگر سرویس واحد را ده‌برابر اشتباه بدهد (سکه به ریال، طلا به تومان) رد می‌شود', async () => {
    ctx = await startTestApp(jsonFetch(liveBody({ bahar: 2590000000 })));
    const r = await ctx.call('POST', '/api/calculate', {});
    expect(r.status).toBe(502);
    expect(r.json.error.code).toBe('PRICE_INCONSISTENT');
  });

  it('تنظیم واحد «ریال»: قیمت دوباره ×۱۰ نمی‌شود', async () => {
    ctx = await startTestApp(jsonFetch(liveBody({ dollar: 2687900, gold: 265287000, gold24: 353716000, bahar: 2590000000, half: 1430000000, quarter: 765000000 })));
    await ctx.call('PUT', '/api/settings', { goldKarat: 18, providerId: 'nerkhsanj', dollarMarket: 'free', unitMode: 'rial', staleAfterMinutes: 120, timeoutMs: 8000, retries: 0, sanityCheck: true });
    const e = (await ctx.call('POST', '/api/calculate', {})).json.entry;
    expect(e.quotes.usd.unitPriceRial).toBe('2687900');
    expect(e.quotes.usd.rawUnit).toBe('rial');
  });

  it('بازار رسمی دلار برای این سرویس پشتیبانی نمی‌شود و ترکیب نمی‌شود', async () => {
    ctx = await startTestApp(jsonFetch(liveBody()));
    await ctx.call('PUT', '/api/settings', { goldKarat: 18, providerId: 'nerkhsanj', dollarMarket: 'official', unitMode: 'auto', staleAfterMinutes: 120, timeoutMs: 8000, retries: 0, sanityCheck: true });
    const r = await ctx.call('POST', '/api/calculate', {});
    expect(r.status).toBe(502);
    expect(r.json.error.code).toBe('PRICE_USD_MARKET_UNSUPPORTED');
  });

  it('عیار ۲۱: قیمت مشتق‌شده و علامت‌دار', async () => {
    ctx = await startTestApp(jsonFetch(liveBody()));
    await ctx.call('PUT', '/api/settings', { goldKarat: 21, providerId: 'nerkhsanj', dollarMarket: 'free', unitMode: 'auto', staleAfterMinutes: 120, timeoutMs: 8000, retries: 0, sanityCheck: true });
    const e = (await ctx.call('POST', '/api/calculate', {})).json.entry;
    expect(e.quotes.gold.derived).toBe(true);
    expect(e.goldKarat).toBe(21);
  });

  it('محاسبه هم‌زمان تکراری رد می‌شود', async () => {
    const slowOk = (async () => {
      await new Promise((r) => setTimeout(r, 150));
      return new Response(JSON.stringify(liveBody()), { status: 200 });
    }) as typeof fetch;
    ctx = await startTestApp(slowOk);
    const [a, b] = await Promise.all([ctx.call('POST', '/api/calculate', {}), ctx.call('POST', '/api/calculate', {})]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it('شناسه تاریخچه نامعتبر هرگز به مسیر فایل تبدیل نمی‌شود', async () => {
    ctx = await startTestApp(jsonFetch(liveBody()));
    expect((await ctx.call('GET', '/api/history/..%2Fassets.json')).status).toBe(404);
  });
});
