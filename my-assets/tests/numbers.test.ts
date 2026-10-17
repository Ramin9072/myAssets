import { describe, expect, it } from 'vitest';
import { ASSET_SPECS, validateAssetsObject, emptyAssets } from '../shared/assetSpecs';
import { normalizeDigits, parseQuantity } from '../shared/numbers';

describe('ورودی اعداد', () => {
  it('ارقام فارسی و عربی را تبدیل می‌کند', () => {
    expect(normalizeDigits('۱۲۳٤٥٦')).toBe('123456');
    const r = parseQuantity('۱٬۲۵۰٫۵', ASSET_SPECS.usd);
    expect(r).toEqual({ ok: true, value: 1250.5 });
  });
  it('سکه فقط عدد صحیح می‌پذیرد', () => {
    expect(parseQuantity('2.5', ASSET_SPECS.coinFull).ok).toBe(false);
    expect(parseQuantity('۲', ASSET_SPECS.coinFull)).toEqual({ ok: true, value: 2 });
  });
  it('مقدار منفی، خالی و متن را رد می‌کند و صفر را می‌پذیرد', () => {
    expect(parseQuantity('-1', ASSET_SPECS.usd).ok).toBe(false);
    expect(parseQuantity('', ASSET_SPECS.usd).ok).toBe(false);
    expect(parseQuantity('abc', ASSET_SPECS.usd).ok).toBe(false);
    expect(parseQuantity('0', ASSET_SPECS.usd)).toEqual({ ok: true, value: 0 });
  });
  it('ویرگول مبهم رد می‌شود تا «۲,۵» برابر ۲۵ نشود', () => {
    expect(parseQuantity('2,5', ASSET_SPECS.goldGrams).ok).toBe(false);
    expect(parseQuantity('1,250', ASSET_SPECS.goldGrams)).toEqual({ ok: true, value: 1250 });
  });
  it('وزن طلا تا سه رقم اعشار', () => {
    expect(parseQuantity('10.123', ASSET_SPECS.goldGrams).ok).toBe(true);
    expect(parseQuantity('10.1234', ASSET_SPECS.goldGrams).ok).toBe(false);
  });
});

describe('اعتبارسنجی فایل دارایی‌ها', () => {
  it('کلید ناشناخته، کلید گم‌شده و منفی را رد می‌کند', () => {
    const a = emptyAssets();
    expect(validateAssetsObject({ ...a, typo: 1 }).ok).toBe(false);
    const { usd: _u, ...missing } = a;
    expect(validateAssetsObject(missing).ok).toBe(false);
    expect(validateAssetsObject({ ...a, usd: -5 }).ok).toBe(false);
    expect(validateAssetsObject({ ...a, coinFull: 1.5 }).ok).toBe(false);
    expect(validateAssetsObject({ ...a, usd: '5' }).ok).toBe(false);
    expect(validateAssetsObject(a).ok).toBe(true);
  });
});
