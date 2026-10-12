import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../server/app';
import { createStoreFromEnv } from '../server/storage/textStore';

let appPromise: ReturnType<typeof createApp> | null = null;

/** ورودی Serverless Function در Vercel. همه مسیرهای /api/* به اینجا می‌رسند (vercel.json). */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    appPromise ??= (async () => {
      const choice = createStoreFromEnv(process.env);
      return createApp({
        store: choice.store,
        maxHistoryEntries: choice.maxHistoryEntries,
        baseUrl: process.env.PRICE_API_BASE_URL?.trim() || undefined,
        // در Vercel بدون APP_PASSWORD هیچ درخواستی پذیرفته نمی‌شود (خطای پیکربندی)
        auth: { password: process.env.APP_PASSWORD || undefined, required: true, secret: process.env.SESSION_SECRET || undefined },
      });
    })();
    const app = await appPromise;
    app(req as never, res as never);
  } catch (e) {
    appPromise = null;
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: { code: 'CONFIG_ERROR', message: e instanceof Error ? e.message : 'خطای پیکربندی سرور.' } }));
  }
}
