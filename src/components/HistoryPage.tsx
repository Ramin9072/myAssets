import { useEffect, useRef, useState } from 'react';
import type { HistoryEntry, HistorySummary } from '../../shared/types';
import { api } from '../api';
import { fmtDateTime, fmtMoney } from '../format';
import { ResultView } from './ResultView';
import { Badge, type ToastState } from './ui';

export function HistoryPage({ notify }: { notify: (t: ToastState) => void }) {
  const [list, setList] = useState<HistorySummary[] | null>(null);
  const [entry, setEntry] = useState<HistoryEntry | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.history().then(setList).catch((e) => notify({ kind: 'error', text: e.message }));
  }, [notify]);

  async function open(id: string) {
    setOpenId(id);
    try {
      const r = await api.historyEntry(id);
      setEntry(r.entry);
      setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' }), 0);
    } catch (e) {
      notify({ kind: 'error', text: e instanceof Error ? e.message : 'بارگذاری جزئیات ناموفق بود.' });
    }
  }

  if (!list) return <p className="muted">در حال بارگذاری…</p>;
  return (
    <div>
      <div className="action-bar"><div><h2>تاریخچه محاسبات</h2><p className="muted small">هر محاسبه با مقادیر و قیمت‌های همان لحظه ثبت می‌شود و بعداً تغییر نمی‌کند.</p></div></div>
      {list.length === 0 ? (
        <div className="empty"><h3>تاریخچه خالی است</h3><p>بعد از اولین محاسبه موفق، نتیجه اینجا ثبت می‌شود.</p></div>
      ) : (
        <div className="table-wrap panel">
          <table className="history">
            <thead><tr><th>زمان محاسبه</th><th>ارزش کل (ریال)</th><th>وضعیت قیمت</th><th>کامل بودن</th><th>منبع</th><th /></tr></thead>
            <tbody>
              {list.map((h) => (
                <tr key={h.id} className={h.id === openId ? 'selected' : ''}>
                  <td data-label="زمان محاسبه">{fmtDateTime(h.calculatedAt)}</td>
                  <td data-label="ارزش کل (ریال)">{fmtMoney(h.totalRial)}</td>
                  <td data-label="وضعیت قیمت"><Badge tone={h.priceStatus === 'fresh' ? 'ok' : 'warn'}>{h.priceStatus === 'fresh' ? 'تازه' : h.priceStatus === 'stale' ? 'قدیمی' : 'ذخیره‌شده'}</Badge></td>
                  <td data-label="کامل بودن"><Badge tone={h.complete ? 'ok' : 'bad'}>{h.complete ? 'کامل' : 'ناقص'}</Badge></td>
                  <td data-label="منبع">{h.providerName}</td>
                  <td><button className="btn tiny" onClick={() => open(h.id)}>جزئیات</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {entry && (
        <div ref={detailRef} className="detail">
          <div className="action-bar"><h3>جزئیات محاسبه</h3><button className="btn ghost" onClick={() => { setEntry(null); setOpenId(null); }}>بستن جزئیات</button></div>
          <ResultView entry={entry} />
        </div>
      )}
    </div>
  );
}
