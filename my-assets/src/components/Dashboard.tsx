import { useCallback, useEffect, useState } from 'react';
import type { ConnectionStatus, HistoryEntry } from '../../shared/types';
import { ApiError, api } from '../api';
import { fmtAge, fmtDateTime } from '../format';
import { ResultView } from './ResultView';
import { Badge, ConfirmDialog, type ToastState } from './ui';

type Pending = { kind: 'stale'; observedAt: string | null; ageMinutes: number | null; marketClosed: boolean | null } | { kind: 'cached'; observedAt: string | null; fetchedAt: string } | null;

export function Dashboard({ dirty, notify }: { dirty: boolean; notify: (t: ToastState) => void }) {
  const [entry, setEntry] = useState<HistoryEntry | null>(null);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Pending>(null);
  const [failure, setFailure] = useState<{ message: string; lastValid: ConnectionStatus['lastValid'] } | null>(null);

  const refreshStatus = useCallback(() => api.status().then(setStatus).catch(() => undefined), []);

  useEffect(() => {
    Promise.all([api.latest().then((r) => setEntry(r.entry)), refreshStatus()])
      .catch((e) => notify({ kind: 'error', text: e.message }))
      .finally(() => setLoading(false));
  }, [notify, refreshStatus]);

  async function run(mode: 'live' | 'cached', acceptStale: boolean) {
    if (busy) return; // جلوگیری از درخواست تکراری
    setBusy(true);
    setFailure(null);
    try {
      const r = await api.calculate(mode, acceptStale);
      setEntry(r.entry);
      setPending(null);
      notify(r.historySaved ? { kind: 'ok', text: 'محاسبه انجام و در تاریخچه ذخیره شد.' } : { kind: 'error', text: `محاسبه انجام شد اما ذخیره در تاریخچه ناموفق بود: ${r.historyError ?? ''}` });
    } catch (e) {
      setPending(null);
      if (e instanceof ApiError && e.code === 'STALE_PRICES') {
        setPending({ kind: 'stale', observedAt: e.body.observedAt ?? null, ageMinutes: e.body.ageMinutes ?? null, marketClosed: e.body.marketClosed ?? null });
      } else if (e instanceof ApiError && e.code.startsWith('PRICE_')) {
        setFailure({ message: e.message, lastValid: e.body.lastValid ?? null });
      } else {
        notify({ kind: 'error', text: e instanceof Error ? e.message : 'خطای ناشناخته' });
      }
    } finally {
      setBusy(false);
      refreshStatus();
    }
  }

  return (
    <div>
      <div className="action-bar">
        <div>
          <h2>داشبورد</h2>
          <p className="muted small">
            اتصال به سرویس قیمت:{' '}
            {status?.state === 'ok' && <Badge tone="ok">برقرار</Badge>}
            {status?.state === 'error' && <Badge tone="bad">خطا</Badge>}
            {(!status || status.state === 'unknown') && <Badge tone="muted">هنوز بررسی نشده</Badge>}
            {status?.lastError && <span className="small"> — {status.lastError.message}</span>}
          </p>
        </div>
        <button className="btn primary big" onClick={() => run('live', false)} disabled={busy}>
          {busy ? 'در حال دریافت قیمت‌ها…' : 'دریافت قیمت روز و محاسبه'}
        </button>
      </div>

      {dirty && <p className="alert warn">تغییرات ذخیره‌نشده‌ای در صفحه «دارایی‌ها» دارید. محاسبه فقط از مقادیر ذخیره‌شده روی سرور استفاده می‌کند.</p>}

      {failure && (
        <div className="alert bad">
          <b>دریافت قیمت‌ها ناموفق بود:</b> {failure.message}
          <div className="small">
            {failure.lastValid ? `آخرین قیمت معتبر: ${fmtDateTime(failure.lastValid.observedAt ?? failure.lastValid.fetchedAt)} (از ${failure.lastValid.providerName}) — این قیمت لحظه‌ای نیست.` : 'هیچ قیمت معتبر قبلی ذخیره نشده است.'}
          </div>
          {failure.lastValid && (
            <button className="btn ghost" onClick={() => setPending({ kind: 'cached', observedAt: failure.lastValid!.observedAt, fetchedAt: failure.lastValid!.fetchedAt })} disabled={busy}>
              محاسبه با آخرین قیمت معتبر…
            </button>
          )}
        </div>
      )}

      {loading ? <p className="muted">در حال بارگذاری…</p> : entry ? <ResultView entry={entry} /> : (
        <div className="empty">
          <h3>هنوز محاسبه‌ای انجام نشده</h3>
          <p>ابتدا در صفحه «دارایی‌ها» تعداد دارایی‌هایتان را ذخیره کنید، سپس «دریافت قیمت روز و محاسبه» را بزنید.</p>
        </div>
      )}

      {pending?.kind === 'stale' && (
        <ConfirmDialog title="قیمت‌های دریافتی قدیمی‌اند" confirmLabel="محاسبه با همین قیمت‌ها" busy={busy} onConfirm={() => run('live', true)} onCancel={() => setPending(null)}>
          <p>
            زمان قیمت‌ها: {fmtDateTime(pending.observedAt)}{pending.ageMinutes !== null ? ` (حدود ${fmtAge(pending.ageMinutes)} پیش)` : ''}.
            {pending.marketClosed ? ' سرویس اعلام می‌کند بازار الان بسته است و این آخرین قیمت پایانی است.' : ''}
          </p>
          <p>اگر ادامه دهید، نتیجه با برچسب «قیمت قدیمی» ذخیره می‌شود.</p>
        </ConfirmDialog>
      )}
      {pending?.kind === 'cached' && (
        <ConfirmDialog title="محاسبه با قیمت قدیمی ذخیره‌شده" confirmLabel="بله، با قیمت قدیمی محاسبه کن" busy={busy} onConfirm={() => run('cached', true)} onCancel={() => setPending(null)}>
          <p>قیمت‌های آخرین دریافت موفق ({fmtDateTime(pending.observedAt ?? pending.fetchedAt)}) استفاده می‌شوند. این‌ها قیمت لحظه‌ای نیستند و نتیجه با همین برچسب ثبت می‌شود.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
