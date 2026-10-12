import type { BasePriceKey, ConnectionStatus, NormalizedSnapshot, Settings } from '../../shared/types';
import { checkConsistency } from '../domain/sanity';
import { InvalidPriceError, toRial } from '../domain/money';
import { PriceError } from '../errors';
import type { PriceProvider } from '../providers/types';
import type { JsonDoc } from '../storage/files';
import type { SettingsStore } from '../storage/settingsStore';

export interface PriceServiceDeps {
  providers: PriceProvider[];
  settings: SettingsStore;
  lastValid: JsonDoc<NormalizedSnapshot>;
  now: () => Date;
  fetchImpl: typeof fetch;
  /** حداقل فاصله بین دو درخواست واقعی به سرویس (رعایت شرایط استفاده منصفانه) */
  minLiveIntervalMs: number;
  retryDelayMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class PriceService {
  private live: { snapshot: NormalizedSnapshot; signature: string; at: number } | null = null;
  private inflight: Promise<NormalizedSnapshot> | null = null;
  private status: Pick<ConnectionStatus, 'state' | 'lastAttemptAt' | 'lastSuccessAt' | 'lastError'> = {
    state: 'unknown',
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
  };

  constructor(private deps: PriceServiceDeps) {}

  getProvider(id: string): PriceProvider {
    const p = this.deps.providers.find((x) => x.id === id);
    if (!p) throw new PriceError('NO_PRICES', 'منبع قیمت انتخاب‌شده وجود ندارد.');
    return p;
  }

  async getStatus(): Promise<ConnectionStatus> {
    const lv = await this.getCached().catch(() => null);
    return {
      ...this.status,
      lastValid: lv ? { fetchedAt: lv.fetchedAt, observedAt: lv.observedAt, providerName: lv.providerName } : null,
    };
  }

  /** آخرین اسنپ‌شات معتبر ذخیره‌شده (برای محاسبه با قیمت قدیمی، فقط با تأیید کاربر) */
  getCached(): Promise<NormalizedSnapshot | null> {
    return this.deps.lastValid.read();
  }

  async getLive(): Promise<NormalizedSnapshot> {
    const settings = await this.deps.settings.read();
    const signature = [settings.providerId, settings.dollarMarket, settings.unitMode, settings.sanityCheck].join('|');
    const nowMs = this.deps.now().getTime();
    if (this.live && this.live.signature === signature && nowMs - this.live.at < this.deps.minLiveIntervalMs) {
      return this.live.snapshot;
    }
    if (this.inflight) return this.inflight;
    this.inflight = this.fetchWithRetry(settings)
      .then((snapshot) => {
        this.live = { snapshot, signature, at: this.deps.now().getTime() };
        return snapshot;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  private async fetchWithRetry(settings: Settings): Promise<NormalizedSnapshot> {
    const attemptAt = this.deps.now().toISOString();
    this.status.lastAttemptAt = attemptAt;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= settings.retries; attempt++) {
      try {
        const snapshot = await this.fetchOnce(settings);
        await this.deps.lastValid.write(snapshot);
        this.status = { state: 'ok', lastAttemptAt: attemptAt, lastSuccessAt: snapshot.fetchedAt, lastError: null };
        return snapshot;
      } catch (e) {
        lastErr = e;
        if (e instanceof PriceError && e.retryable && attempt < settings.retries) {
          await sleep((this.deps.retryDelayMs ?? 400) * (attempt + 1));
          continue;
        }
        break;
      }
    }
    const err = lastErr instanceof PriceError ? lastErr : new PriceError('NETWORK', 'خطای ناشناخته در دریافت قیمت‌ها.');
    this.status = {
      ...this.status,
      state: 'error',
      lastAttemptAt: attemptAt,
      lastError: { code: err.code, message: err.message, at: this.deps.now().toISOString() },
    };
    throw err;
  }

  private async fetchOnce(settings: Settings): Promise<NormalizedSnapshot> {
    const provider = this.getProvider(settings.providerId);
    if (!provider.supportedUsdMarkets.includes(settings.dollarMarket)) {
      throw new PriceError('USD_MARKET_UNSUPPORTED', `منبع «${provider.name}» قیمت دلار «${settings.dollarMarket === 'free' ? 'بازار آزاد' : 'رسمی'}» را ارائه نمی‌دهد. نوع بازار را در تنظیمات تغییر دهید.`);
    }
    const raw = await provider.fetch({ timeoutMs: settings.timeoutMs, fetchImpl: this.deps.fetchImpl });
    const now = this.deps.now();

    if (raw.usdMarket !== settings.dollarMarket) {
      throw new PriceError('USD_MARKET_UNSUPPORTED', 'نوع بازار دلار دریافتی با تنظیمات یکسان نیست.');
    }
    if (raw.observedAt !== null) {
      const t = Date.parse(raw.observedAt);
      if (!Number.isFinite(t) || t - now.getTime() > 24 * 3600_000) {
        throw new PriceError('INVALID_RESPONSE', 'زمان قیمت‌های دریافتی نامعتبر است.');
      }
    }

    const prices: NormalizedSnapshot['prices'] = {};
    for (const [key, q] of Object.entries(raw.prices) as [BasePriceKey, { value: number; unit: 'toman' | 'rial' }][]) {
      const unit = settings.unitMode === 'auto' ? q.unit : settings.unitMode;
      try {
        prices[key] = { rial: toRial(q.value, unit).toFixed(), raw: q.value, rawUnit: unit };
      } catch (e) {
        if (!(e instanceof InvalidPriceError)) throw e; // قیمت نامعتبر پذیرفته نمی‌شود
      }
    }
    if (Object.keys(prices).length === 0) throw new PriceError('NO_PRICES', 'هیچ قیمت معتبری از سرویس دریافت نشد.');

    if (settings.sanityCheck) {
      const problem = checkConsistency(prices);
      if (problem) throw new PriceError('INCONSISTENT', problem);
    }

    return {
      providerId: provider.id,
      providerName: provider.name,
      sourceUrl: provider.sourceUrl,
      attribution: provider.attribution,
      fetchedAt: now.toISOString(),
      observedAt: raw.observedAt,
      marketClosed: raw.marketClosed,
      usdMarket: raw.usdMarket,
      unitMode: settings.unitMode,
      prices,
      unavailableReasons: provider.unavailable,
    };
  }
}
