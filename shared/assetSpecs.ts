// تعریف مشترک دارایی‌ها (استفاده در فرانت‌اند و بک‌اند)

export const ASSET_KEYS = [
  'coinFull',
  'coinFullPre86',
  'coinHalf',
  'coinHalfPre86',
  'coinQuarter',
  'coinQuarterPre86',
  'usd',
  'goldGrams',
] as const;

export type AssetKey = (typeof ASSET_KEYS)[number];
export type Assets = Record<AssetKey, number>;

export type PriceKey =
  | 'coinFull'
  | 'coinFullPre86'
  | 'coinHalf'
  | 'coinHalfPre86'
  | 'coinQuarter'
  | 'coinQuarterPre86'
  | 'usd'
  | 'gold';

export type AssetGroup = 'coins' | 'usd' | 'gold';

export interface AssetSpec {
  key: AssetKey;
  label: string;
  unit: string;
  group: AssetGroup;
  priceKey: PriceKey;
  maxDecimals: number;
  max: number;
}

export const ASSET_SPECS: Record<AssetKey, AssetSpec> = {
  coinFull: { key: 'coinFull', label: 'سکه تمام بهار آزادی', unit: 'عدد', group: 'coins', priceKey: 'coinFull', maxDecimals: 0, max: 1_000_000 },
  coinFullPre86: { key: 'coinFullPre86', label: 'سکه تمام بهار آزادی قبل از ۱۳۸۶', unit: 'عدد', group: 'coins', priceKey: 'coinFullPre86', maxDecimals: 0, max: 1_000_000 },
  coinHalf: { key: 'coinHalf', label: 'نیم‌سکه بهار آزادی', unit: 'عدد', group: 'coins', priceKey: 'coinHalf', maxDecimals: 0, max: 1_000_000 },
  coinHalfPre86: { key: 'coinHalfPre86', label: 'نیم‌سکه قبل از ۱۳۸۶', unit: 'عدد', group: 'coins', priceKey: 'coinHalfPre86', maxDecimals: 0, max: 1_000_000 },
  coinQuarter: { key: 'coinQuarter', label: 'ربع‌سکه بهار آزادی', unit: 'عدد', group: 'coins', priceKey: 'coinQuarter', maxDecimals: 0, max: 1_000_000 },
  coinQuarterPre86: { key: 'coinQuarterPre86', label: 'ربع‌سکه قبل از ۱۳۸۶', unit: 'عدد', group: 'coins', priceKey: 'coinQuarterPre86', maxDecimals: 0, max: 1_000_000 },
  usd: { key: 'usd', label: 'دلار آمریکا', unit: 'دلار', group: 'usd', priceKey: 'usd', maxDecimals: 2, max: 1_000_000_000 },
  goldGrams: { key: 'goldGrams', label: 'طلای گرمی', unit: 'گرم', group: 'gold', priceKey: 'gold', maxDecimals: 3, max: 1_000_000 },
};

export const GROUP_LABELS: Record<AssetGroup, string> = {
  coins: 'سکه‌ها',
  usd: 'دلار',
  gold: 'طلای گرمی',
};

export function emptyAssets(): Assets {
  return {
    coinFull: 0,
    coinFullPre86: 0,
    coinHalf: 0,
    coinHalfPre86: 0,
    coinQuarter: 0,
    coinQuarterPre86: 0,
    usd: 0,
    goldGrams: 0,
  };
}

/** تعداد ارقام اعشار یک عدد؛ اعداد با نمایش علمی (مثل 1e-7) نامعتبر هستند. */
function countDecimals(n: number): number | null {
  const s = String(n);
  if (/e/i.test(s)) return null;
  const frac = s.split('.')[1];
  return frac ? frac.length : 0;
}

export type AssetsValidation = { ok: true; assets: Assets } | { ok: false; errors: string[] };

/** اعتبارسنجی سخت‌گیرانه: همه کلیدها الزامی، کلید ناشناخته ممنوع، مقدار منفی/نامعتبر ممنوع. */
export function validateAssetsObject(value: unknown): AssetsValidation {
  const errors: string[] = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, errors: ['ساختار دارایی‌ها باید یک شیء باشد.'] };
  }
  const obj = value as Record<string, unknown>;
  for (const k of Object.keys(obj)) {
    if (!(ASSET_KEYS as readonly string[]).includes(k)) errors.push(`کلید ناشناخته: ${k}`);
  }
  const out = emptyAssets();
  for (const key of ASSET_KEYS) {
    const spec = ASSET_SPECS[key];
    const v = obj[key];
    if (v === undefined) {
      errors.push(`مقدار «${spec.label}» وجود ندارد.`);
      continue;
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      errors.push(`مقدار «${spec.label}» باید عدد باشد.`);
      continue;
    }
    if (v < 0) {
      errors.push(`مقدار «${spec.label}» نمی‌تواند منفی باشد.`);
      continue;
    }
    if (v > spec.max) {
      errors.push(`مقدار «${spec.label}» بیش از حد مجاز است.`);
      continue;
    }
    const dec = countDecimals(v);
    if (dec === null || dec > spec.maxDecimals) {
      errors.push(
        spec.maxDecimals === 0
          ? `«${spec.label}» باید عدد صحیح باشد.`
          : `«${spec.label}» حداکثر ${spec.maxDecimals} رقم اعشار می‌تواند داشته باشد.`,
      );
      continue;
    }
    out[key] = v;
  }
  return errors.length ? { ok: false, errors } : { ok: true, assets: out };
}
