import { PriceError } from '../errors';

const MAX_BYTES = 2_000_000;

export async function fetchJson(url: string, o: { timeoutMs: number; fetchImpl: typeof fetch; headers?: Record<string, string> }): Promise<unknown> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), o.timeoutMs);
  try {
    const res = await o.fetchImpl(url, { signal: ac.signal, headers: { Accept: 'application/json', ...o.headers } });
    if (!res.ok) throw new PriceError('HTTP', `سرویس قیمت با کد ${res.status} پاسخ داد.`, res.status >= 500 || res.status === 429);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new PriceError('INVALID_RESPONSE', 'پاسخ سرویس بیش از حد بزرگ است.');
    try {
      return JSON.parse(text);
    } catch {
      throw new PriceError('INVALID_RESPONSE', 'پاسخ سرویس JSON معتبر نیست.');
    }
  } catch (e) {
    if (e instanceof PriceError) throw e;
    if (ac.signal.aborted) throw new PriceError('TIMEOUT', 'مهلت پاسخ‌گویی سرویس قیمت تمام شد.', true);
    throw new PriceError('NETWORK', 'اتصال به سرویس قیمت برقرار نشد.', true);
  } finally {
    clearTimeout(timer);
  }
}
