import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createAuth, type AuthOptions } from './auth';
import { validateAssetsObject } from '../shared/assetSpecs';
import type { MetaResponse, NormalizedSnapshot, ProviderInfo } from '../shared/types';
import { ApiError, PriceError, StorageError } from './errors';
import { buildManualPrice, checkManualAgainst, isManualKey } from './domain/manual';
import { InvalidPriceError } from './domain/money';
import type { ManualPrices } from '../shared/types';
import { DEFAULT_PRICE_API_BASE_URL, createProviders } from './providers';
import type { PriceProvider } from './providers/types';
import { runCalculation } from './services/calculationService';
import { PriceService } from './services/priceService';
import { AssetsStore, parseBackupFile } from './storage/assetsStore';
import { JsonDoc } from './storage/files';
import { FileTextStore, type TextStore } from './storage/textStore';
import { HistoryStore } from './storage/historyStore';
import { SettingsStore, validateSettings } from './storage/settingsStore';

export interface AppOptions {
  /** یکی از دو گزینه: store (Redis/حافظه/فایل) یا dataDir (ذخیره در فایل) */
  store?: TextStore;
  dataDir?: string;
  maxHistoryEntries?: number;
  auth?: AuthOptions;
  distDir?: string;
  providers?: PriceProvider[];
  baseUrl?: string;
  now?: () => Date;
  fetchImpl?: typeof fetch;
  minLiveIntervalMs?: number;
  retryDelayMs?: number;
}

const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

export async function createApp(opts: AppOptions) {
  const now = opts.now ?? (() => new Date());
  const providers = opts.providers ?? createProviders({ PRICE_API_BASE_URL: opts.baseUrl });
  const baseUrl = opts.baseUrl ?? DEFAULT_PRICE_API_BASE_URL;

  // نام‌های ذخیره‌سازی ثابت‌اند و هیچ بخشی از آن از ورودی کاربر ساخته نمی‌شود.
  const store = opts.store ?? (opts.dataDir ? new FileTextStore(opts.dataDir) : null);
  if (!store) throw new Error('store یا dataDir لازم است.');
  const assets = new AssetsStore(store, now);
  const history = new HistoryStore(store, opts.maxHistoryEntries);
  const settings = new SettingsStore(store);
  const lastValid = new JsonDoc<NormalizedSnapshot>(store, 'last-prices.json');
  const manual = new JsonDoc<{ version: 1; prices: ManualPrices }>(store, 'manual-prices.json');
  const auth = createAuth(opts.auth ?? {}, now);
  const prices = new PriceService({
    providers,
    settings,
    lastValid,
    now,
    fetchImpl: opts.fetchImpl ?? fetch,
    minLiveIntervalMs: opts.minLiveIntervalMs ?? 60_000,
    retryDelayMs: opts.retryDelayMs,
  });
  await assets.init();

  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'");
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  // محافظت در برابر درخواست‌های بین‌سایتی: عملیات نوشتن فقط با هدر سفارشی (که مرورگر بدون CORS اجازه نمی‌دهد) پذیرفته می‌شود.
  app.use('/api', (req, _res, next) => {
    if (req.method !== 'GET' && req.get('x-requested-with') !== 'my-assets') {
      return next(new ApiError(403, 'FORBIDDEN', 'درخواست نامعتبر است.'));
    }
    next();
  });

  // ورود با رمز عبور (وقتی APP_PASSWORD تنظیم باشد). مسیرهای session/login/logout بدون ورود در دسترس‌اند.
  app.get('/api/session', auth.configGuard, auth.session);
  app.post('/api/login', auth.configGuard, auth.login);
  app.post('/api/logout', auth.logout);
  app.use('/api', auth.configGuard, auth.guard);

  const api = express.Router();

  api.get('/meta', wrap(async (_req, res) => {
    const infos: ProviderInfo[] = providers.map((p) => ({
      id: p.id, name: p.name, sourceUrl: p.sourceUrl, attribution: p.attribution, description: p.description,
      supportedUsdMarkets: p.supportedUsdMarkets, declaredUnit: p.declaredUnit, unavailable: p.unavailable,
    }));
    const body: MetaResponse = { providers: infos, baseUrl, settings: await settings.read() };
    res.json(body);
  }));

  api.get('/assets', wrap(async (_req, res) => { res.json(await assets.read()); }));

  api.put('/assets', wrap(async (req, res) => {
    const v = validateAssetsObject(req.body?.assets);
    if (!v.ok) throw new ApiError(400, 'INVALID_ASSETS', v.errors.join(' '), { errors: v.errors });
    const base = typeof req.body?.baseRevision === 'string' ? req.body.baseRevision : undefined;
    res.json(await assets.write(v.assets, base));
  }));

  api.get('/assets/backup', wrap(async (_req, res) => {
    const backup = await assets.exportBackup();
    const stamp = now().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    res.setHeader('Content-Disposition', `attachment; filename="assets-backup-${stamp}.json"`);
    res.type('application/json').send(JSON.stringify(backup, null, 2));
  }));

  api.post('/assets/restore', wrap(async (req, res) => {
    if (req.body?.confirmed !== true) throw new ApiError(400, 'CONFIRMATION_REQUIRED', 'جایگزینی کامل اطلاعات نیازمند تأیید است.');
    const parsed = parseBackupFile(req.body?.backup);
    if (!parsed.ok) throw new ApiError(400, 'INVALID_BACKUP', parsed.errors.join(' '), { errors: parsed.errors });
    res.json(await assets.restore(parsed.assets));
  }));

  api.get('/manual-prices', wrap(async (_req, res) => { res.json({ prices: (await manual.read())?.prices ?? {} }); }));

  // ثبت/حذف قیمت دستی؛ کلیدهای ارسال‌نشده بدون تغییر می‌مانند، مقدار null یعنی حذف
  api.put('/manual-prices', wrap(async (req, res) => {
    const input = req.body?.prices;
    if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new ApiError(400, 'INVALID_MANUAL', 'ساختار قیمت‌های دستی نامعتبر است.');
    const current: ManualPrices = { ...((await manual.read())?.prices ?? {}) };
    const ref = (await prices.getCached())?.prices;
    const errors: string[] = [];
    for (const [key, v] of Object.entries(input as Record<string, unknown>)) {
      if (!isManualKey(key)) { errors.push(`کلید نامعتبر: ${key}`); continue; }
      if (v === null) { delete current[key]; continue; }
      try {
        const o = v as { value?: unknown; unit?: unknown };
        const mp = buildManualPrice(o.value, o.unit, now());
        const problem = checkManualAgainst(key, mp, ref);
        if (problem) errors.push(`${key}: ${problem}`); else current[key] = mp;
      } catch (e) {
        if (!(e instanceof InvalidPriceError)) throw e;
        errors.push(`${key}: ${e.message}`);
      }
    }
    if (errors.length) throw new ApiError(400, 'INVALID_MANUAL', errors.join(' '), { errors });
    await manual.write({ version: 1, prices: current });
    res.json({ prices: current });
  }));

  api.get('/settings', wrap(async (_req, res) => { res.json(await settings.read()); }));

  api.put('/settings', wrap(async (req, res) => {
    const s = validateSettings(req.body, providers.map((p) => p.id));
    await settings.write(s);
    res.json(s);
  }));

  api.get('/prices/status', wrap(async (_req, res) => { res.json(await prices.getStatus()); }));

  // تست اتصال: فقط دریافت قیمت (بدون محاسبه و بدون ثبت در تاریخچه)
  api.post('/prices/test', wrap(async (_req, res) => {
    try {
      await prices.getLive();
    } catch (e) {
      if (!(e instanceof PriceError)) throw e;
    }
    res.json(await prices.getStatus());
  }));

  api.post('/calculate', wrap(async (req, res) => {
    const mode = req.body?.mode === 'cached' ? 'cached' : 'live';
    const acceptStale = req.body?.acceptStale === true;
    res.json(await runCalculation({ assets, history, settings, prices, manual, now }, { mode, acceptStale }));
  }));

  api.get('/history', wrap(async (_req, res) => { res.json(await history.list()); }));
  api.get('/history/latest', wrap(async (_req, res) => { res.json({ entry: await history.latest() }); }));
  api.get('/history/:id', wrap(async (req, res) => {
    const entry = await history.get(String(req.params.id));
    if (!entry) throw new ApiError(404, 'NOT_FOUND', 'محاسبه موردنظر پیدا نشد.');
    res.json({ entry });
  }));

  app.use('/api', api);
  app.use('/api', (_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'مسیر یافت نشد.')));

  // فقط پوشه build فرانت‌اند ارائه می‌شود؛ پوشه data هرگز.
  const distDir = opts.distDir;
  if (distDir && existsSync(join(distDir, 'index.html'))) {
    app.use(express.static(distDir, { index: false }));
    app.get('*', (_req, res) => { res.sendFile(join(distDir, 'index.html')); });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message }, ...err.extra });
    } else if (err instanceof StorageError) {
      const status = err.code === 'CONFLICT' ? 409 : err.code === 'INVALID' ? 400 : err.code === 'UNAVAILABLE' ? 503 : 500;
      res.status(status).json({ error: { code: `STORAGE_${err.code}`, message: err.message } });
    } else if ((err as { type?: string })?.type === 'entity.parse.failed' || (err as { type?: string })?.type === 'entity.too.large') {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'بدنه درخواست نامعتبر یا بزرگ‌تر از حد مجاز است.' } });
    } else {
      // جزئیات مالی در لاگ چاپ نمی‌شود؛ فقط پیام خطا
      console.error('[server] unexpected error:', err instanceof Error ? err.message : 'unknown');
      res.status(500).json({ error: { code: 'INTERNAL', message: 'خطای داخلی سرور.' } });
    }
  });

  return app;
}
