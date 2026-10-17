import { useCallback, useEffect, useState } from 'react';
import { MANUAL_KEYS, type ManualKey, type ManualPrices, type PriceUnit } from '../../shared/types';
import { ASSET_SPECS } from '../../shared/assetSpecs';
import { parseQuantity } from '../../shared/numbers';
import { ApiError, api } from '../api';
import { fmtDateTime, fmtInput } from '../format';
import type { ToastState } from './ui';

type Draft = { text: string; unit: PriceUnit };
const PRICE_SPEC = { label: 'قیمت', maxDecimals: 0, max: 10_000_000_000_000 };
const PRE86 = MANUAL_KEYS.filter((k) => k.endsWith('Pre86'));
const REGULAR = MANUAL_KEYS.filter((k) => !k.endsWith('Pre86'));

export function ManualPricesPanel({ notify }: { notify: (t: ToastState) => void }) {
  const [saved, setSaved] = useState<ManualPrices | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<ManualKey, Draft>>>({});
  const [errors, setErrors] = useState<Partial<Record<ManualKey, string>>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.getManual();
      setSaved(r.prices);
      const d: Partial<Record<ManualKey, Draft>> = {};
      for (const k of MANUAL_KEYS) {
        const p = r.prices[k];
        d[k] = p ? { text: fmtInput(p.raw), unit: p.rawUnit } : { text: '', unit: 'toman' };
      }
      setDrafts(d);
      setErrors({});
    } catch (e) {
      notify({ kind: 'error', text: e instanceof Error ? e.message : 'بارگذاری قیمت‌های دستی ناموفق بود.' });
    }
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  if (!saved) return <p className="muted">در حال بارگذاری قیمت‌های دستی…</p>;

  const changed = (k: ManualKey) => {
    const d = drafts[k];
    const p = saved[k];
    if (!d) return false;
    if (!p) return d.text.trim() !== '';
    return d.text !== fmtInput(p.raw) || d.unit !== p.rawUnit;
  };
  const anyChanged = MANUAL_KEYS.some(changed);

  async function save() {
    const payload: Record<string, { value: number; unit: PriceUnit }> = {};
    const errs: Partial<Record<ManualKey, string>> = {};
    for (const k of MANUAL_KEYS) {
      if (!changed(k)) continue;
      const d = drafts[k]!;
      const r = parseQuantity(d.text, PRICE_SPEC);
      if (!r.ok) errs[k] = r.error;
      else if (r.value <= 0) errs[k] = 'قیمت باید بیشتر از صفر باشد.';
      else payload[k] = { value: r.value, unit: d.unit };
    }
    setErrors(errs);
    if (Object.keys(errs).length) return notify({ kind: 'error', text: 'ابتدا خطاهای قیمت دستی را اصلاح کنید.' });
    setBusy(true);
    try {
      await api.saveManual(payload);
      await load();
      notify({ kind: 'ok', text: 'قیمت‌های دستی ذخیره شد.' });
    } catch (e) {
      notify({ kind: 'error', text: e instanceof ApiError ? e.message : 'ذخیره ناموفق بود.' });
    } finally {
      setBusy(false);
    }
  }

  async function remove(k: ManualKey) {
    setBusy(true);
    try {
      await api.saveManual({ [k]: null });
      await load();
      notify({ kind: 'ok', text: 'قیمت دستی حذف شد.' });
    } catch (e) {
      notify({ kind: 'error', text: e instanceof Error ? e.message : 'حذف ناموفق بود.' });
    } finally {
      setBusy(false);
    }
  }

  const row = (k: ManualKey) => {
    const d = drafts[k] ?? { text: '', unit: 'toman' as PriceUnit };
    const p = saved[k];
    return (
      <div className={`field${errors[k] ? ' has-error' : ''}`} key={k}>
        <label htmlFor={`m-${k}`}>{ASSET_SPECS[k].label}</label>
        <div className="input-row">
          <input id={`m-${k}`} type="text" inputMode="numeric" dir="ltr" autoComplete="off" placeholder="قیمت هر عدد" value={d.text}
            onChange={(e) => { setDrafts({ ...drafts, [k]: { ...d, text: e.target.value } }); if (errors[k]) setErrors({ ...errors, [k]: undefined }); }} />
          <select aria-label="واحد" value={d.unit} onChange={(e) => setDrafts({ ...drafts, [k]: { ...d, unit: e.target.value as PriceUnit } })} style={{ width: 'auto' }}>
            <option value="toman">تومان</option>
            <option value="rial">ریال</option>
          </select>
          {p && <button type="button" className="btn tiny" onClick={() => remove(k)} disabled={busy}>حذف</button>}
        </div>
        <span className="err" role="alert">{errors[k] ?? ''}</span>
        {p && <span className="hint">ثبت‌شده در {fmtDateTime(p.enteredAt)}؛ معادل {fmtInput(Number(p.rial) / (p.rawUnit === 'toman' ? 10 : 1))} تومان</span>}
      </div>
    );
  };

  return (
    <section className="panel">
      <h3>قیمت دستی سکه‌ها</h3>
      <p className="muted small">
        قیمت دستی فقط وقتی استفاده می‌شود که سرویس برای آن مورد قیمت نداشته باشد؛ هیچ‌وقت جای قیمت سرویس را نمی‌گیرد و خودکار به‌روز نمی‌شود. در جدول و تاریخچه با برچسب «دستی» و زمان ثبت نمایش داده می‌شود. هر وقت قیمت بازار عوض شد، خودتان این عدد را به‌روز کنید.
      </p>
      <h4 className="subhead">سکه‌های قبل از ۱۳۸۶ (سرویس فعلی قیمت ندارد)</h4>
      <div className="fields">{PRE86.map(row)}</div>
      <h4 className="subhead">جایگزین موقت برای سکه‌های معمولی (اختیاری)</h4>
      <div className="fields">{REGULAR.map(row)}</div>
      <div className="row" style={{ marginTop: '0.8rem' }}>
        <button className="btn primary" onClick={save} disabled={!anyChanged || busy}>ذخیره قیمت‌های دستی</button>
        <button className="btn ghost" onClick={load} disabled={!anyChanged || busy}>لغو تغییرات</button>
      </div>
    </section>
  );
}
