import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app';

export const NOW = new Date('2026-10-11T10:00:00Z');

/** پاسخ نمونه «نرخ‌سنج» (تومان). ۱۴۰۵/۰۷/۱۹ ۱۳:۳۰ به وقت تهران = ۱۰:۰۰ UTC */
export function liveBody(overrides: Record<string, unknown> = {}, top: Record<string, unknown> = {}) {
  return {
    date: '1405/07/19',
    time: '13:30',
    rates: { dollar: 268790, gold: 26528700, gold24: 35371600, coin: 271160000, bahar: 259000000, half: 143000000, quarter: 76500000, gram: 37000000, ...overrides },
    ...top,
  };
}

export function jsonFetch(body: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as typeof fetch;
}

export async function startTestApp(fetchImpl: typeof fetch, extra: { now?: () => Date } = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'my-assets-'));
  const app = await createApp({ dataDir, fetchImpl, now: extra.now ?? (() => NOW), minLiveIntervalMs: 0, retryDelayMs: 1 });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', 'x-requested-with': 'my-assets' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, text };
  };
  return {
    base, dataDir, call,
    close: async () => { await new Promise((r) => server.close(r)); await rm(dataDir, { recursive: true, force: true }); },
  };
}

export const SAMPLE_ASSETS = { coinFull: 3, coinFullPre86: 0, coinHalf: 2, coinHalfPre86: 0, coinQuarter: 5, coinQuarterPre86: 0, usd: 1250.5, goldGrams: 42.75 };
