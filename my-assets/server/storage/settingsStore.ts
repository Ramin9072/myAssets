import { GOLD_KARATS, type DollarMarket, type Settings, type UnitMode } from '../../shared/types';
import { ApiError } from '../errors';
import { JsonDoc } from './files';
import type { TextStore } from './textStore';

export const DEFAULT_SETTINGS: Settings = {
  goldKarat: 18,
  providerId: 'nerkhsanj',
  dollarMarket: 'free',
  unitMode: 'auto',
  staleAfterMinutes: 120,
  timeoutMs: 8000,
  retries: 1,
  sanityCheck: true,
};

export function validateSettings(input: unknown, providerIds: string[]): Settings {
  if (typeof input !== 'object' || input === null) throw new ApiError(400, 'INVALID_SETTINGS', 'ساختار تنظیمات نامعتبر است.');
  const o = input as Record<string, unknown>;
  const errs: string[] = [];
  const s: Settings = { ...DEFAULT_SETTINGS };

  if ((GOLD_KARATS as readonly unknown[]).includes(o.goldKarat)) s.goldKarat = o.goldKarat as number;
  else errs.push('عیار طلا نامعتبر است.');

  if (typeof o.providerId === 'string' && providerIds.includes(o.providerId)) s.providerId = o.providerId;
  else errs.push('منبع قیمت نامعتبر است.');

  if (o.dollarMarket === 'free' || o.dollarMarket === 'official') s.dollarMarket = o.dollarMarket as DollarMarket;
  else errs.push('نوع بازار دلار نامعتبر است.');

  if (o.unitMode === 'auto' || o.unitMode === 'toman' || o.unitMode === 'rial') s.unitMode = o.unitMode as UnitMode;
  else errs.push('واحد قیمت نامعتبر است.');

  const int = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
  if (int(o.staleAfterMinutes, 1, 10080)) s.staleAfterMinutes = o.staleAfterMinutes as number;
  else errs.push('آستانه قدیمی‌بودن قیمت باید بین ۱ تا ۱۰۰۸۰ دقیقه باشد.');
  if (int(o.timeoutMs, 1000, 60000)) s.timeoutMs = o.timeoutMs as number;
  else errs.push('مهلت اتصال باید بین ۱۰۰۰ تا ۶۰۰۰۰ میلی‌ثانیه باشد.');
  if (int(o.retries, 0, 5)) s.retries = o.retries as number;
  else errs.push('تعداد تلاش مجدد باید بین ۰ تا ۵ باشد.');
  if (typeof o.sanityCheck === 'boolean') s.sanityCheck = o.sanityCheck;
  else errs.push('گزینه بررسی سازگاری نامعتبر است.');

  if (errs.length) throw new ApiError(400, 'INVALID_SETTINGS', errs.join(' '));
  return s;
}

export class SettingsStore {
  private doc: JsonDoc<Settings>;
  constructor(store: TextStore) {
    this.doc = new JsonDoc<Settings>(store, 'settings.json');
  }
  async read(): Promise<Settings> {
    const stored = await this.doc.read();
    return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
  }
  write(s: Settings): Promise<void> {
    return this.doc.write(s);
  }
}
