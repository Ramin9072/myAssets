import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { RedisTcpStore } from '../server/storage/textStore';
import { NOW, SAMPLE_ASSETS, jsonFetch, liveBody } from './helpers';

// فقط وقتی REDIS_TEST_URL تنظیم باشد (یک Redis واقعی) اجرا می‌شود
const url = process.env.REDIS_TEST_URL;
describe.skipIf(!url)('Redis واقعی (TCP)', () => {
  it('ذخیره، بازیابی و تاریخچه روی Redis واقعی', async () => {
    const prefix = `t${Date.now()}:`;
    const mk = () => new RedisTcpStore(url!, prefix);
    const app = await createApp({ store: mk(), fetchImpl: jsonFetch(liveBody()), now: () => NOW, minLiveIntervalMs: 0 });
    const server = app.listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const call = async (m: string, p: string, b?: unknown) => {
      const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', 'x-requested-with': 'my-assets' }, body: b ? JSON.stringify(b) : undefined });
      return { status: r.status, json: await r.json() };
    };
    const cur = await call('GET', '/api/assets');
    expect((await call('PUT', '/api/assets', { assets: SAMPLE_ASSETS, baseRevision: cur.json.revision })).status).toBe(200);
    expect((await call('POST', '/api/calculate', {})).status).toBe(200);
    // پشتیبان/بازیابی با list/remove
    const backup = (await call('GET', '/api/assets/backup')).json;
    expect((await call('POST', '/api/assets/restore', { backup, confirmed: true })).status).toBe(200);
    server.close();

    // «راه‌اندازی مجدد» با یک اتصال تازه
    const app2 = await createApp({ store: mk(), fetchImpl: jsonFetch(liveBody()), now: () => NOW });
    const s2 = app2.listen(0, '127.0.0.1');
    await new Promise((r) => s2.once('listening', r));
    const p2 = (s2.address() as { port: number }).port;
    expect((await (await fetch(`http://127.0.0.1:${p2}/api/assets`)).json()).assets).toEqual(SAMPLE_ASSETS);
    expect(await (await fetch(`http://127.0.0.1:${p2}/api/history`)).json()).toHaveLength(1);
    s2.close();
  });
});
