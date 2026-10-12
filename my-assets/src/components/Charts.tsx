import { useMemo } from 'react';
import { GROUP_LABELS, type AssetGroup } from '../../shared/assetSpecs';
import type { CalculationResult } from '../../shared/types';
import { fmtMoney } from '../format';

const COLORS: Record<AssetGroup, string> = { coins: '#B7893A', usd: '#2F6B5E', gold: '#7A5B22' };

/** نوار ترکیب دارایی‌ها بر اساس ارزش (فقط ردیف‌های دارای قیمت) */
export function CompositionBar({ result }: { result: CalculationResult }) {
  const parts = useMemo(() => {
    const entries = (Object.keys(result.groups) as AssetGroup[]).map((g) => ({ g, v: BigInt(result.groups[g]) }));
    const total = entries.reduce((a, b) => a + b.v, 0n);
    return { total, entries: entries.map((e) => ({ ...e, pct: total > 0n ? Number((e.v * 10000n) / total) / 100 : 0 })) };
  }, [result]);
  if (parts.total === 0n) return <p className="muted">برای نمایش نمودار، دارایی با قیمت معتبر لازم است.</p>;
  return (
    <div>
      <div className="stackbar" role="img" aria-label="سهم هر گروه از ارزش کل">
        {parts.entries.filter((e) => e.pct > 0).map((e) => (
          <div key={e.g} style={{ width: `${e.pct}%`, background: COLORS[e.g] }} title={`${GROUP_LABELS[e.g]}: ${fmtMoney(e.v.toString())} ریال`} />
        ))}
      </div>
      <ul className="legend">
        {parts.entries.map((e) => (
          <li key={e.g}>
            <i style={{ background: COLORS[e.g] }} />
            <span>{GROUP_LABELS[e.g]}</span>
            <b>{new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 }).format(e.pct)}٪</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** نمودار میله‌ای ارزش هر دارایی */
export function ItemBars({ result }: { result: CalculationResult }) {
  const rows = result.items.filter((i) => i.status === 'priced' && i.valueRial && i.valueRial !== '0');
  const max = rows.reduce((m, r) => (BigInt(r.valueRial!) > m ? BigInt(r.valueRial!) : m), 0n);
  if (rows.length === 0) return null;
  return (
    <div className="bars" role="img" aria-label="ارزش هر دارایی">
      {rows.map((r) => (
        <div className="bar-row" key={r.key}>
          <span className="bar-label">{r.label}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${max > 0n ? Math.max(2, Number((BigInt(r.valueRial!) * 10000n) / max) / 100) : 0}%` }} />
          </div>
          <span className="bar-val">{fmtMoney(r.valueRial)}</span>
        </div>
      ))}
    </div>
  );
}
