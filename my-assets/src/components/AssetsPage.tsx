import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ASSET_KEYS, ASSET_SPECS, GROUP_LABELS, validateAssetsObject, type AssetGroup, type AssetKey, type Assets } from '../../shared/assetSpecs';
import { parseQuantity } from '../../shared/numbers';
import { ApiError, api } from '../api';
import { fmtDateTime, fmtInput, fmtQty } from '../format';
import { ConfirmDialog, type ToastState } from './ui';

type Texts = Record<AssetKey, string>;
type Dialog = { kind: 'save'; changes: Array<{ key: AssetKey; from: number; to: number }> } | { kind: 'restore'; assets: Assets; exportedAt: string | null } | null;

const toTexts = (a: Assets): Texts => Object.fromEntries(ASSET_KEYS.map((k) => [k, fmtInput(a[k])])) as Texts;

export function AssetsPage({ onDirty, notify }: { onDirty: (d: boolean) => void; notify: (t: ToastState) => void }) {
  const [server, setServer] = useState<{ assets: Assets; revision: string; updatedAt: string | null } | null>(null);
  const [texts, setTexts] = useState<Texts | null>(null);
  const [errors, setErrors] = useState<Partial<Record<AssetKey, string>>>({});
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.getAssets();
      setServer(r);
      setTexts(toTexts(r.assets));
      setErrors({});
      setConflict(false);
    } catch (e) {
      notify({ kind: 'error', text: e instanceof Error ? e.message : 'بارگذاری ناموفق بود.' });
    }
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  const parsed = useMemo(() => {
    if (!texts) return null;
    return Object.fromEntries(ASSET_KEYS.map((k) => [k, parseQuantity(texts[k], ASSET_SPECS[k])])) as Record<AssetKey, ReturnType<typeof parseQuantity>>;
  }, [texts]);

  const dirty = useMemo(() => {
    if (!server || !texts || !parsed) return false;
    return ASSET_KEYS.some((k) => {
      const p = parsed[k];
      return p.ok ? p.value !== server.assets[k] : texts[k] !== fmtInput(server.assets[k]);
    });
  }, [server, texts, parsed]);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  if (!server || !texts || !parsed) return <p className="muted">در حال بارگذاری…</p>;

  const setText = (k: AssetKey, v: string) => {
    setTexts({ ...texts, [k]: v });
    if (errors[k]) setErrors({ ...errors, [k]: undefined });
  };
  const blur = (k: AssetKey) => {
    const p = parsed[k];
    if (p.ok) setTexts({ ...texts, [k]: fmtInput(p.value) });
    else setErrors({ ...errors, [k]: p.error });
  };

  function requestSave() {
    const errs: Partial<Record<AssetKey, string>> = {};
    const values = {} as Assets;
    for (const k of ASSET_KEYS) {
      const p = parsed![k];
      if (p.ok) values[k] = p.value; else errs[k] = p.error;
    }
    setErrors(errs);
    if (Object.keys(errs).length) return notify({ kind: 'error', text: 'ابتدا خطاهای فرم را اصلاح کنید.' });
    const changes = ASSET_KEYS.filter((k) => values[k] !== server!.assets[k]).map((k) => ({ key: k, from: server!.assets[k], to: values[k] }));
    if (!changes.length) return notify({ kind: 'ok', text: 'تغییری برای ذخیره وجود ندارد.' });
    setDialog({ kind: 'save', changes });
  }

  async function doSave() {
    if (!server || !parsed) return;
    const values = Object.fromEntries(ASSET_KEYS.map((k) => [k, (parsed[k] as { ok: true; value: number }).value])) as Assets;
    setBusy(true);
    try {
      const r = await api.saveAssets(values, server.revision);
      setServer(r);
      setTexts(toTexts(r.assets));
      setConflict(false);
      notify({ kind: 'ok', text: 'تغییرات با موفقیت ذخیره شد.' });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setConflict(true);
      notify({ kind: 'error', text: `ذخیره ناموفق بود: ${e instanceof Error ? e.message : ''}` });
    } finally {
      setBusy(false);
      setDialog(null);
    }
  }

  async function downloadBackup() {
    try {
      const b = await api.getBackup();
      const url = URL.createObjectURL(new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `assets-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      notify({ kind: 'ok', text: 'نسخه پشتیبان دانلود شد (مقادیر ذخیره‌شده روی سرور).' });
    } catch (e) {
      notify({ kind: 'error', text: e instanceof Error ? e.message : 'تهیه پشتیبان ناموفق بود.' });
    }
  }

  async function pickBackup(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 200_000) throw new Error('حجم فایل بیش از حد انتظار است.');
      const data = JSON.parse(await file.text());
      if (data?.format !== 'my-assets-backup' || data?.version !== 1) throw new Error('این فایل، پشتیبان این برنامه نیست.');
      const v = validateAssetsObject(data.assets);
      if (!v.ok) throw new Error(v.errors.join(' '));
      setDialog({ kind: 'restore', assets: v.assets, exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : null });
    } catch (e) {
      notify({ kind: 'error', text: `فایل پشتیبان معتبر نیست: ${e instanceof Error ? e.message : ''}` });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function doRestore() {
    if (dialog?.kind !== 'restore') return;
    setBusy(true);
    try {
      const r = await api.restore({ format: 'my-assets-backup', version: 1, exportedAt: dialog.exportedAt ?? new Date().toISOString(), assets: dialog.assets });
      setServer(r);
      setTexts(toTexts(r.assets));
      setErrors({});
      notify({ kind: 'ok', text: 'اطلاعات از فایل پشتیبان بازیابی شد. نسخه قبلی در پوشه data/backups نگه‌داری شد.' });
    } catch (e) {
      notify({ kind: 'error', text: `بازیابی ناموفق بود: ${e instanceof Error ? e.message : ''}` });
    } finally {
      setBusy(false);
      setDialog(null);
    }
  }

  const groups: AssetGroup[] = ['coins', 'usd', 'gold'];
  return (
    <div>
      <div className="action-bar">
        <div>
          <h2>دارایی‌ها</h2>
          <p className="muted small">آخرین ذخیره‌سازی: {server.updatedAt ? fmtDateTime(server.updatedAt) : 'هنوز ذخیره نشده'}</p>
        </div>
        <div className="row">
          <button className="btn ghost" onClick={load} disabled={!dirty || busy}>لغو تغییرات</button>
          <button className="btn primary" onClick={requestSave} disabled={!dirty || busy}>ذخیره تغییرات</button>
        </div>
      </div>

      {conflict && (
        <div className="alert bad">
          فایل assets.json خارج از برنامه تغییر کرده است. برای جلوگیری از بازنویسی، ذخیره انجام نشد.
          <button className="btn ghost" onClick={load}>بارگذاری آخرین مقادیر</button>
        </div>
      )}
      {dirty && <p className="alert warn">تغییرات ذخیره‌نشده دارید.</p>}

      {groups.map((g) => (
        <section className="panel" key={g}>
          <h3>{GROUP_LABELS[g]}</h3>
          <div className="fields">
            {ASSET_KEYS.filter((k) => ASSET_SPECS[k].group === g).map((k) => {
              const s = ASSET_SPECS[k];
              return (
                <div className={`field${errors[k] ? ' has-error' : ''}`} key={k}>
                  <label htmlFor={`f-${k}`}>{s.label}</label>
                  <div className="input-row">
                    <input
                      id={`f-${k}`}
                      type="text"
                      inputMode={s.maxDecimals ? 'decimal' : 'numeric'}
                      autoComplete="off"
                      dir="ltr"
                      value={texts[k]}
                      aria-invalid={Boolean(errors[k])}
                      aria-describedby={`e-${k}`}
                      onChange={(e) => setText(k, e.target.value)}
                      onBlur={() => blur(k)}
                    />
                    <span className="suffix">{s.unit}</span>
                    <button type="button" className="btn tiny" onClick={() => setTexts({ ...texts, [k]: fmtInput(0) })} aria-label={`صفر کردن ${s.label}`}>صفر</button>
                  </div>
                  <span id={`e-${k}`} className="err" role="alert">{errors[k] ?? ''}</span>
                  {k.endsWith('Pre86') && <span className="hint">برای این مورد، سرویس قیمت فعلی قیمت مستقل ندارد؛ در محاسبه «قیمت نامشخص» می‌شود.</span>}
                  {k === 'goldGrams' && <span className="hint">وزن بر حسب گرم؛ عیار در «تنظیمات» انتخاب می‌شود (پیش‌فرض ۱۸).</span>}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <section className="panel">
        <h3>پشتیبان‌گیری</h3>
        <p className="muted small">اطلاعات در فایل <code>data/assets.json</code> روی سرور ذخیره می‌شود و با هر ویرایشگر متنی قابل مشاهده است.</p>
        <div className="row">
          <button className="btn ghost" onClick={downloadBackup}>دانلود نسخه پشتیبان</button>
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>بازیابی از فایل پشتیبان…</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => pickBackup(e.target.files?.[0])} />
        </div>
      </section>

      {dialog?.kind === 'save' && (
        <ConfirmDialog title="ذخیره تغییرات؟" confirmLabel="ذخیره" busy={busy} onConfirm={doSave} onCancel={() => setDialog(null)}>
          <ul className="diff">
            {dialog.changes.map((c) => (
              <li key={c.key}><span>{ASSET_SPECS[c.key].label}</span><b>{fmtQty(c.from)} ← {fmtQty(c.to)}</b></li>
            ))}
          </ul>
        </ConfirmDialog>
      )}
      {dialog?.kind === 'restore' && (
        <ConfirmDialog title="جایگزینی کامل اطلاعات؟" confirmLabel="جایگزین کن" danger busy={busy} onConfirm={doRestore} onCancel={() => setDialog(null)}>
          <p>همه مقادیر فعلی با مقادیر فایل پشتیبان{dialog.exportedAt ? ` (تهیه‌شده در ${fmtDateTime(dialog.exportedAt)})` : ''} جایگزین می‌شود. نسخه فعلی پیش از جایگزینی در <code>data/backups</code> ذخیره می‌شود.{dirty ? ' تغییرات ذخیره‌نشده فعلی از بین می‌رود.' : ''}</p>
          <ul className="diff">
            {ASSET_KEYS.map((k) => (
              <li key={k}><span>{ASSET_SPECS[k].label}</span><b>{fmtQty(server.assets[k])} ← {fmtQty(dialog.assets[k])}</b></li>
            ))}
          </ul>
        </ConfirmDialog>
      )}
    </div>
  );
}
