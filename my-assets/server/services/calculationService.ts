import type { HistoryEntry, NormalizedSnapshot, PriceStatus } from '../../shared/types';
import { calculate } from '../domain/calculator';
import { buildQuotes } from '../domain/quotes';
import { ApiError, PriceError } from '../errors';
import type { AssetsStore } from '../storage/assetsStore';
import { newHistoryId, type HistoryStore } from '../storage/historyStore';
import type { SettingsStore } from '../storage/settingsStore';
import type { JsonDoc } from '../storage/files';
import type { ManualPrices } from '../../shared/types';
import type { PriceService } from './priceService';

export interface CalculationDeps {
  assets: AssetsStore;
  history: HistoryStore;
  settings: SettingsStore;
  prices: PriceService;
  manual: JsonDoc<{ version: 1; prices: ManualPrices }>;
  now: () => Date;
}

export interface CalculateOptions {
  mode: 'live' | 'cached';
  acceptStale: boolean;
}

let busy = false;

/** جلوگیری از اجرای هم‌زمان درخواست‌های تکراری محاسبه */
export async function runCalculation(deps: CalculationDeps, opts: CalculateOptions): Promise<{ entry: HistoryEntry; historySaved: boolean; historyError?: string }> {
  if (busy) throw new ApiError(409, 'CALCULATION_IN_PROGRESS', 'یک محاسبه در حال انجام است؛ چند لحظه صبر کنید.');
  busy = true;
  try {
    const settings = await deps.settings.read();
    const { assets } = await deps.assets.read(); // مقادیر ذخیره‌شده روی سرور
    const now = deps.now();

    let snapshot: NormalizedSnapshot;
    let priceStatus: PriceStatus;

    if (opts.mode === 'cached') {
      if (!opts.acceptStale) throw new ApiError(400, 'CONFIRMATION_REQUIRED', 'محاسبه با قیمت قدیمی فقط با تأیید صریح کاربر ممکن است.');
      const cached = await deps.prices.getCached();
      if (!cached) throw new ApiError(404, 'NO_CACHED_PRICES', 'هنوز هیچ قیمت معتبری ذخیره نشده است.');
      snapshot = cached;
      priceStatus = 'cached';
    } else {
      try {
        snapshot = await deps.prices.getLive();
      } catch (e) {
        if (e instanceof PriceError) {
          const lastValid = await deps.prices.getStatus().then((s) => s.lastValid);
          throw new ApiError(502, `PRICE_${e.code}`, e.message, { lastValid });
        }
        throw e;
      }
      const ageMin = snapshot.observedAt ? Math.max(0, (now.getTime() - Date.parse(snapshot.observedAt)) / 60_000) : null;
      const stale = ageMin === null || ageMin > settings.staleAfterMinutes;
      if (stale && !opts.acceptStale) {
        throw new ApiError(409, 'STALE_PRICES', 'قیمت‌های دریافتی قدیمی‌اند یا زمان آن‌ها مشخص نیست.', {
          observedAt: snapshot.observedAt,
          ageMinutes: ageMin === null ? null : Math.round(ageMin),
          marketClosed: snapshot.marketClosed,
        });
      }
      priceStatus = stale ? 'stale' : 'fresh';
    }

    const manualDoc = await deps.manual.read();
    const quotes = buildQuotes(snapshot, settings.goldKarat, manualDoc?.prices ?? {});
    const result = calculate(assets, quotes);
    const entry: HistoryEntry = {
      id: newHistoryId(now),
      calculatedAt: now.toISOString(),
      assets,
      goldKarat: settings.goldKarat,
      dollarMarket: snapshot.usdMarket,
      provider: { id: snapshot.providerId, name: snapshot.providerName, sourceUrl: snapshot.sourceUrl, attribution: snapshot.attribution },
      priceStatus,
      fetchedAt: snapshot.fetchedAt,
      observedAt: snapshot.observedAt,
      marketClosed: snapshot.marketClosed,
      unitMode: snapshot.unitMode,
      quotes,
      result,
    };

    try {
      await deps.history.append(entry);
      return { entry, historySaved: true };
    } catch (e) {
      // نتیجه محاسبه از بین نمی‌رود؛ فقط خطای ذخیره تاریخچه گزارش می‌شود
      return { entry, historySaved: false, historyError: e instanceof Error ? e.message : 'ذخیره تاریخچه ناموفق بود.' };
    }
  } finally {
    busy = false;
  }
}
