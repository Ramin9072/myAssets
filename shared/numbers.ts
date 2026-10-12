import type { AssetSpec } from './assetSpecs';

const PERSIAN_ZERO = 0x06f0;
const ARABIC_ZERO = 0x0660;

/** تبدیل ارقام فارسی و عربی به انگلیسی */
export function normalizeDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const c = ch.codePointAt(0)!;
    if (c >= PERSIAN_ZERO && c <= PERSIAN_ZERO + 9) out += String(c - PERSIAN_ZERO);
    else if (c >= ARABIC_ZERO && c <= ARABIC_ZERO + 9) out += String(c - ARABIC_ZERO);
    else out += ch;
  }
  return out;
}

export type ParseResult = { ok: true; value: number } | { ok: false; error: string };

/**
 * پردازش ورودی کاربر برای یک دارایی.
 * - ارقام فارسی/عربی پذیرفته می‌شود.
 * - «٫» و «/» جداکننده اعشار و «٬» جداکننده هزارگان است.
 * - ویرگول انگلیسی/فارسی فقط وقتی به‌عنوان هزارگان پذیرفته می‌شود که الگوی ۳رقمی کامل داشته باشد
 *   (تا «۲,۵» اشتباهاً ۲۵ خوانده نشود).
 */
export function parseQuantity(raw: string, spec: Pick<AssetSpec, 'label' | 'maxDecimals' | 'max'>): ParseResult {
  let s = normalizeDigits(raw).trim().replace(/\s+/g, '');
  if (s === '') return { ok: false, error: 'مقدار را وارد کنید (برای صفر، عدد ۰ را بنویسید).' };
  if (s.startsWith('-') || s.startsWith('−') || s.startsWith('–')) {
    return { ok: false, error: 'مقدار منفی پذیرفته نمی‌شود.' };
  }
  s = s.replace(/٬/g, ''); // هزارگان عربی/فارسی
  s = s.replace(/٫/g, '.').replace(/\//g, '.');
  if (/[,،]/.test(s)) {
    const t = s.replace(/،/g, ',');
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) s = t.replace(/,/g, '');
    else return { ok: false, error: 'برای اعشار از «.» یا «٫» استفاده کنید؛ ویرگول فقط برای هزارگان است.' };
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, error: 'فقط عدد وارد کنید.' };
  const decimals = s.split('.')[1]?.length ?? 0;
  if (decimals > spec.maxDecimals) {
    return {
      ok: false,
      error: spec.maxDecimals === 0 ? 'این مورد فقط عدد صحیح می‌پذیرد.' : `حداکثر ${spec.maxDecimals} رقم اعشار مجاز است.`,
    };
  }
  const value = Number(s);
  if (!Number.isFinite(value)) return { ok: false, error: 'عدد نامعتبر است.' };
  if (value > spec.max) return { ok: false, error: 'مقدار بیش از حد مجاز است.' };
  return { ok: true, value };
}
