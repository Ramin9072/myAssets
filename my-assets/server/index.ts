import 'dotenv/config';
import { resolve } from 'node:path';
import { createApp } from './app';
import { createStoreFromEnv } from './storage/textStore';

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '127.0.0.1';
const choice = createStoreFromEnv(process.env);

const app = await createApp({
  store: choice.store,
  maxHistoryEntries: choice.maxHistoryEntries,
  auth: { password: process.env.APP_PASSWORD || undefined, secret: process.env.SESSION_SECRET || undefined },
  distDir: resolve('dist'),
  baseUrl: process.env.PRICE_API_BASE_URL?.trim() || undefined,
});

app.listen(port, host, () => {
  console.log(`مدیریت دارایی‌های من: http://${host}:${port}`);
  console.log(`ذخیره‌سازی: ${choice.kind === 'redis' ? 'Upstash Redis' : resolve(process.env.DATA_DIR ?? './data')}`);
  if (!process.env.APP_PASSWORD) console.log('رمز عبور (APP_PASSWORD) تنظیم نشده؛ فقط روی همین رایانه استفاده کنید.');
});
