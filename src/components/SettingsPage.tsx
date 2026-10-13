import { useCallback, useEffect, useState } from 'react';
import { GOLD_KARATS, type ConnectionStatus, type MetaResponse, type Settings } from '../../shared/types';
import { api } from '../api';
import { fmtDateTime } from '../format';
import { ManualPricesPanel } from './ManualPricesPanel';
import { Badge, type ToastState } from './ui';

export function SettingsPage({ notify }: { notify: (t: ToastState) => void }) {
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, s] = await Promise.all([api.meta(), api.status()]);
      setMeta(m);
      setForm(m.settings);
      setStatus(s);
    } catch (e) {
      notify({ kind: 'error', text: e instanceof Error ? e.message : 'بارگذاری تنظیمات ناموفق بود.' });
    }
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  if (!meta || !form) return <p className="muted">در حال بارگذاری…</p>;
  const provider = meta.providers.find((p) => p.id === form.providerId) ?? meta.providers[0];
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm({ ...form, [k]: v });
  const changed = JSON.stringify(form) !== JSON.stringify(meta.settings);
  const marketUnsupported = !provider.supportedUsdMarkets.includes(form.dollarMarket);

  async function save() {
    setBusy(true);
    try {
      const s = await api.saveSettings(form!);
      setMeta({ ...meta!, settings: s });
      setForm(s);
      notify({ kind: 'ok', text: 'تنظیمات ذخیره شد.' });
    } catch (e) {
      notify({ kind: 'error', text: e instanceof Error ? e.message : 'ذخیره تنظیمات ناموفق بود.' });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (changed) return notify({ kind: 'error', text: 'ابتدا تنظیمات را ذخیره کنید.' });
    setTesting(true);
    try {
      setStatus(await api.testConnection());
    } catch (e) {
      notify({ kind: 'error', text: e instanceof Error ? e.message : 'تست اتصال ناموفق بود.' });
    } finally {
      setTesting(false);
    }
  }

  const num = (k: 'staleAfterMinutes' | 'timeoutMs' | 'retries') => (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value));

  return (
    <div>
      <div className="action-bar">
        <div><h2>تنظیمات</h2></div>
        <div className="row">
          <button className="btn ghost" onClick={() => setForm(meta.settings)} disabled={!changed || busy}>لغو تغییرات</button>
          <button className="btn primary" onClick={save} disabled={!changed || busy}>ذخیره تنظیمات</button>
        </div>
      </div>

      <section className="panel">
        <h3>محاسبه</h3>
        <div className="fields">
          <div className="field">
            <label htmlFor="karat">عیار طلای گرمی</label>
            <select id="karat" value={form.goldKarat} onChange={(e) => set('goldKarat', Number(e.target.value))}>
              {GOLD_KARATS.map((k) => <option key={k} value={k}>{new Intl.NumberFormat('fa-IR').format(k)} عیار</option>)}
            </select>
            <span className="hint">فقط ۱۸ و ۲۴ عیار (در صورت ارائه سرویس) قیمت مستقیم بازار دارند؛ سایر عیارها از قیمت ۱۸ عیار محاسبه می‌شوند و در جدول علامت «محاسبه‌شده» می‌خورند.</span>
          </div>
          <div className="field">
            <label htmlFor="market">نوع بازار دلار</label>
            <select id="market" value={form.dollarMarket} onChange={(e) => set('dollarMarket', e.target.value as Settings['dollarMarket'])}>
              <option value="free">بازار آزاد</option>
              <option value="official">نرخ رسمی</option>
            </select>
            <span className="hint">قیمت رسمی و آزاد هیچ‌گاه با هم ترکیب نمی‌شوند.</span>
            {marketUnsupported && <span className="err">منبع «{provider.name}» فقط بازار آزاد را ارائه می‌دهد؛ با این انتخاب دریافت قیمت خطا می‌دهد.</span>}
          </div>
        </div>
      </section>

      <section className="panel">
        <h3>منبع قیمت</h3>
        <div className="fields">
          <div className="field">
            <label htmlFor="prov">ارائه‌دهنده</label>
            <select id="prov" value={form.providerId} onChange={(e) => set('providerId', e.target.value)}>
              {meta.providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <span className="hint">{provider.description}</span>
          </div>
          <div className="field">
            <label htmlFor="unit">واحد قیمت دریافتی</label>
            <select id="unit" value={form.unitMode} onChange={(e) => set('unitMode', e.target.value as Settings['unitMode'])}>
              <option value="auto">خودکار (طبق اعلام سرویس: {provider.declaredUnit === 'toman' ? 'تومان' : 'ریال'})</option>
              <option value="toman">همیشه تومان</option>
              <option value="rial">همیشه ریال</option>
            </select>
            {form.unitMode !== 'auto' && <span className="err">با تغییر دستی، اگر واحد واقعی سرویس فرق کند محاسبات ده‌برابر خطا می‌شود. مگر اینکه مطمئن باشید، روی «خودکار» بگذارید.</span>}
          </div>
        </div>
        {Object.keys(provider.unavailable).length > 0 && (
          <p className="alert warn small">محدودیت این منبع: {Array.from(new Set(Object.values(provider.unavailable))).join(' ')}</p>
        )}
        <p className="muted small">منبع داده: <a href={provider.sourceUrl} target="_blank" rel="noreferrer noopener">{provider.attribution}</a></p>
      </section>

      <ManualPricesPanel notify={notify} />

      <section className="panel">
        <h3>اتصال به API</h3>
        <div className="fields">
          <div className="field"><label htmlFor="stale">قدیمی‌بودن قیمت پس از (دقیقه)</label><input id="stale" type="number" min={1} max={10080} value={form.staleAfterMinutes} onChange={num('staleAfterMinutes')} /></div>
          <div className="field"><label htmlFor="to">مهلت پاسخ (میلی‌ثانیه)</label><input id="to" type="number" min={1000} max={60000} step={500} value={form.timeoutMs} onChange={num('timeoutMs')} /></div>
          <div className="field"><label htmlFor="rt">تعداد تلاش مجدد</label><input id="rt" type="number" min={0} max={5} value={form.retries} onChange={num('retries')} /></div>
          <div className="field">
            <label className="check"><input type="checkbox" checked={form.sanityCheck} onChange={(e) => set('sanityCheck', e.target.checked)} /> بررسی سازگاری قیمت‌ها (گرفتن خطای ده‌برابری)</label>
            <span className="hint">نسبت قیمت سکه به طلا را می‌سنجد و داده‌ی غیرمنطقی را رد می‌کند.</span>
          </div>
          <div className="field">
            <label htmlFor="base">آدرس پایه سرویس (فقط‌خواندنی)</label>
            <input id="base" type="text" dir="ltr" value={meta.baseUrl} readOnly />
            <span className="hint">برای تغییر، متغیر PRICE_API_BASE_URL را در فایل .env تنظیم کنید.</span>
          </div>
        </div>
      </section>

      <section className="panel">
        <h3>وضعیت اتصال</h3>
        <p>
          {status?.state === 'ok' && <Badge tone="ok">برقرار</Badge>}
          {status?.state === 'error' && <Badge tone="bad">خطا</Badge>}
          {(!status || status.state === 'unknown') && <Badge tone="muted">هنوز بررسی نشده</Badge>}
        </p>
        <ul className="notes">
          <li>آخرین تلاش: {fmtDateTime(status?.lastAttemptAt)}</li>
          <li>آخرین دریافت موفق: {fmtDateTime(status?.lastSuccessAt ?? status?.lastValid?.fetchedAt)}</li>
          {status?.lastError && <li className="bad-text">آخرین خطا: {status.lastError.message} ({fmtDateTime(status.lastError.at)})</li>}
        </ul>
        <button className="btn ghost" onClick={test} disabled={testing}>{testing ? 'در حال تست…' : 'تست اتصال'}</button>
      </section>
    </div>
  );
}
