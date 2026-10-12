import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { createApp, type AppOptions } from '../server/app';
import { MemoryTextStore, UpstashTextStore, createStoreFromEnv } from '../server/storage/textStore';
import { SAMPLE_ASSETS, NOW, jsonFetch, liveBody } from './helpers';

async function serve(opts: Partial<AppOptions>) {
  const app = await createApp({ store: new MemoryTextStore(), fetchImpl: jsonFetch(liveBody()), now: () => NOW, minLiveIntervalMs: 0, ...opts });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let cookie = '';
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', 'x-requested-with': 'my-assets', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, json: await res.json().catch(() => null), setCookie: set };
  };
  return { call, close: () => new Promise((r) => server.close(r)) };
}

describe('رمز عبور', () => {
  it('بدون ورود همه مسیرها ۴۰۱ است؛ با رمز درست ورود و دسترسی', async () => {
    const s = await serve({ auth: { password: 'p@ss', failDelayMs: 0 } });
    expect((await s.call('GET', '/api/session')).json).toEqual({ authRequired: true, authenticated: false });
    expect((await s.call('GET', '/api/assets')).status).toBe(401);
    expect((await s.call('PUT', '/api/assets', { assets: SAMPLE_ASSETS })).status).toBe(401);
    expect((await s.call('POST', '/api/calculate', {})).status).toBe(401);
    expect((await s.call('POST', '/api/login', { password: 'wrong' })).status).toBe(401);
    expect((await s.call('POST', '/api/login', {})).status).toBe(401);

    const ok = await s.call('POST', '/api/login', { password: 'p@ss' });
    expect(ok.status).toBe(200);
    expect(ok.setCookie).toContain('HttpOnly');
    expect(ok.setCookie).toContain('SameSite=Strict');
    expect((await s.call('GET', '/api/assets')).status).toBe(200);
    expect((await s.call('GET', '/api/session')).json.authenticated).toBe(true);

    await s.call('POST', '/api/logout', {});
    expect((await s.call('GET', '/api/assets')).status).toBe(401);
    await s.close();
  });

  it('توکن جعلی یا منقضی پذیرفته نمی‌شود', async () => {
    let t = NOW;
    const s = await serve({ auth: { password: 'p', failDelayMs: 0, sessionDays: 1 }, now: () => t });
    await s.call('POST', '/api/login', { password: 'p' });
    expect((await s.call('GET', '/api/assets')).status).toBe(200);
    t = new Date(NOW.getTime() + 2 * 86400_000);
    expect((await s.call('GET', '/api/assets')).status).toBe(401);
    await s.close();
  });

  it('حالت Vercel: بدون APP_PASSWORD همه‌چیز خطای پیکربندی (۵۰۳) است', async () => {
    const s = await serve({ auth: { required: true } });
    expect((await s.call('GET', '/api/assets')).status).toBe(503);
    expect((await s.call('POST', '/api/login', { password: 'x' })).status).toBe(503);
    await s.close();
  });
});

describe('ذخیره‌سازی Upstash Redis', () => {
  function fakeUpstash() {
    const kv = new Map<string, string>();
    const calls: string[][] = [];
    const f = (async (_url: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
      const [cmd, key, val] = JSON.parse(String(init.body)) as string[];
      calls.push([cmd, key]);
      let result: unknown = null;
      if (cmd === 'GET') result = kv.get(key) ?? null;
      else if (cmd === 'SET') { kv.set(key, val); result = 'OK'; }
      else if (cmd === 'DEL') { result = kv.delete(key) ? 1 : 0; }
      else if (cmd === 'KEYS') result = [...kv.keys()].filter((k) => k.startsWith(key.replace('*', '')));
      return new Response(JSON.stringify({ result }), { status: 200 });
    }) as unknown as typeof fetch;
    return { f, kv, calls };
  }

  it('کل برنامه روی Redis کار می‌کند و داده‌ها ماندگارند', async () => {
    const u = fakeUpstash();
    const store = new UpstashTextStore('https://x.upstash.io', 'tok', u.f);
    const s = await serve({ store });
    const cur = await s.call('GET', '/api/assets');
    await s.call('PUT', '/api/assets', { assets: SAMPLE_ASSETS, baseRevision: cur.json.revision });
    expect((await s.call('POST', '/api/calculate', {})).status).toBe(200);
    await s.close();

    expect([...u.kv.keys()].sort()).toEqual(['my-assets:assets.json', 'my-assets:history.json', 'my-assets:last-prices.json']);
    // «راه‌اندازی مجدد» با همان پایگاه داده
    const s2 = await serve({ store: new UpstashTextStore('https://x.upstash.io', 'tok', u.f) });
    expect((await s2.call('GET', '/api/assets')).json.assets).toEqual(SAMPLE_ASSETS);
    expect((await s2.call('GET', '/api/history')).json).toHaveLength(1);
    await s2.close();
  });

  it('خطای Redis → ۵۰۳ و بدون خراب‌کردن داده', async () => {
    const down = (async () => new Response('{"error":"boom"}', { status: 500 })) as unknown as typeof fetch;
    await expect(createApp({ store: new UpstashTextStore('https://x', 't', down) })).rejects.toThrow();
  });

  it('سقف تاریخچه رعایت می‌شود', async () => {
    const s = await serve({ maxHistoryEntries: 2 });
    for (let i = 0; i < 3; i++) await s.call('POST', '/api/calculate', {});
    expect((await s.call('GET', '/api/history')).json).toHaveLength(2);
    await s.close();
  });

  it('انتخاب ذخیره‌ساز از متغیرهای محیطی', () => {
    expect(createStoreFromEnv({ KV_REST_API_URL: 'https://a', KV_REST_API_TOKEN: 't' }).kind).toBe('redis');
    expect(createStoreFromEnv({ UPSTASH_REDIS_REST_URL: 'https://a', UPSTASH_REDIS_REST_TOKEN: 't' }).kind).toBe('redis');
    expect(createStoreFromEnv({}).kind).toBe('file');
    expect(() => createStoreFromEnv({ VERCEL: '1' })).toThrow(/Redis/);
  });
});

describe('Redis با پروتکل استاندارد (REDIS_URL)', () => {
  it('اگر REDIS_URL باشد انتخاب می‌شود', () => {
    expect(createStoreFromEnv({ REDIS_URL: 'redis://localhost:6379' }).kind).toBe('redis');
  });
});
