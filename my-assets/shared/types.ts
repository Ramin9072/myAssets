import type { AssetKey, Assets, PriceKey } from './assetSpecs';

export type PriceUnit = 'toman' | 'rial';
export type DollarMarket = 'free' | 'official';
export type UnitMode = 'auto' | PriceUnit;

/** کلیدهای قیمتی که از ارائه‌دهنده خوانده می‌شوند (طلا به‌صورت ۱۸ و ۲۴ عیار) */
export type BasePriceKey = Exclude<PriceKey, 'gold'> | 'gold18' | 'gold24';

export interface NormalizedPrice {
  /** قیمت هر واحد به ریال (رشته اعشاری دقیق) */
  rial: string;
  /** عدد خام دریافت‌شده از ارائه‌دهنده */
  raw: number;
  /** واحد خام دریافتی که برای تبدیل استفاده شد */
  rawUnit: PriceUnit;
}

export interface NormalizedSnapshot {
  providerId: string;
  providerName: string;
  sourceUrl: string;
  attribution: string;
  /** زمان دریافت توسط سرور (ISO) */
  fetchedAt: string;
  /** زمان قیمت طبق اعلام ارائه‌دهنده (ISO) یا null اگر مشخص نباشد */
  observedAt: string | null;
  marketClosed: boolean | null;
  usdMarket: DollarMarket;
  unitMode: UnitMode;
  prices: Partial<Record<BasePriceKey, NormalizedPrice>>;
  unavailableReasons: Partial<Record<BasePriceKey, string>>;
}

export interface PriceQuote {
  priceKey: PriceKey;
  available: boolean;
  unitPriceRial: string | null;
  rawValue: number | null;
  rawUnit: PriceUnit | null;
  /** true اگر قیمت از قیمت سایر عیارها محاسبه شده باشد (نه قیمت مستقیم بازار) */
  derived: boolean;
  note: string | null;
}

export type ItemStatus = 'priced' | 'unknown' | 'empty';

export interface ItemResult {
  key: AssetKey;
  label: string;
  unit: string;
  quantity: number;
  unitPriceRial: string | null;
  valueRial: string | null;
  status: ItemStatus;
}

export interface CalculationResult {
  items: ItemResult[];
  groups: { coins: string; usd: string; gold: string };
  totalRial: string;
  totalToman: string;
  /** true یعنی برای همه دارایی‌های دارای مقدار، قیمت معتبر وجود داشته است */
  complete: boolean;
  unknownKeys: AssetKey[];
}

export type PriceStatus = 'fresh' | 'stale' | 'cached';

export interface HistoryEntry {
  id: string;
  calculatedAt: string;
  assets: Assets;
  goldKarat: number;
  dollarMarket: DollarMarket;
  provider: { id: string; name: string; sourceUrl: string; attribution: string };
  priceStatus: PriceStatus;
  fetchedAt: string;
  observedAt: string | null;
  marketClosed: boolean | null;
  unitMode: UnitMode;
  quotes: Record<PriceKey, PriceQuote>;
  result: CalculationResult;
}

export interface HistorySummary {
  id: string;
  calculatedAt: string;
  totalRial: string;
  totalToman: string;
  complete: boolean;
  priceStatus: PriceStatus;
  providerName: string;
}

export const GOLD_KARATS = [24, 22, 21, 18, 14] as const;

export interface Settings {
  goldKarat: number;
  providerId: string;
  dollarMarket: DollarMarket;
  unitMode: UnitMode;
  staleAfterMinutes: number;
  timeoutMs: number;
  retries: number;
  sanityCheck: boolean;
}

export interface ProviderInfo {
  id: string;
  name: string;
  sourceUrl: string;
  attribution: string;
  description: string;
  supportedUsdMarkets: DollarMarket[];
  declaredUnit: PriceUnit;
  unavailable: Partial<Record<BasePriceKey, string>>;
}

export interface ConnectionStatus {
  state: 'unknown' | 'ok' | 'error';
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: { code: string; message: string; at: string } | null;
  lastValid: { fetchedAt: string; observedAt: string | null; providerName: string } | null;
}

export interface MetaResponse {
  providers: ProviderInfo[];
  baseUrl: string;
  settings: Settings;
}

export interface AssetsResponse {
  assets: Assets;
  updatedAt: string | null;
  revision: string;
}

export interface BackupFile {
  format: 'my-assets-backup';
  version: 1;
  exportedAt: string;
  assets: Assets;
}
