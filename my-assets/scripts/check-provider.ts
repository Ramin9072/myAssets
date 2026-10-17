// اجرا: npm run check:provider
// پاسخ زنده سرویس قیمت را می‌گیرد و نتیجه تفسیرشده را چاپ می‌کند تا از درستی نگاشت فیلدها مطمئن شوید.
import 'dotenv/config';
import { createProviders } from '../server/providers';

const providers = createProviders({ PRICE_API_BASE_URL: process.env.PRICE_API_BASE_URL });
for (const p of providers) {
  console.log(`\n== ${p.name} (${p.sourceUrl})`);
  try {
    const r = await p.fetch({ timeoutMs: 10_000, fetchImpl: fetch });
    console.log('زمان قیمت (ISO):', r.observedAt, '| بازار بسته:', r.marketClosed, '| بازار دلار:', r.usdMarket);
    for (const [k, v] of Object.entries(r.prices)) console.log(`${k.padEnd(10)} ${v.value} ${v.unit}`);
    console.log('بدون قیمت مستقل:', Object.keys(p.unavailable).join(', ') || '—');
  } catch (e) {
    console.error('خطا:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}
