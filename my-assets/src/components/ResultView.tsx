import { ASSET_SPECS, GROUP_LABELS } from '../../shared/assetSpecs';
import type { HistoryEntry, PriceStatus } from '../../shared/types';
import { fmtAge, fmtDateTime, fmtMoney, fmtQty, fmtUnitPrice } from '../format';
import { CompositionBar, ItemBars } from './Charts';
import { Badge } from './ui';

const STATUS_TEXT: Record<PriceStatus, { tone: 'ok' | 'warn'; text: string }> = {
  fresh: { tone: 'ok', text: 'قیمت‌های تازه' },
  stale: { tone: 'warn', text: 'قیمت قدیمی (با تأیید شما)' },
  cached: { tone: 'warn', text: 'آخرین قیمت ذخیره‌شده (نه لحظه‌ای)' },
};

const COIN_KEYS = ['coinFull', 'coinFullPre86', 'coinHalf', 'coinHalfPre86', 'coinQuarter', 'coinQuarterPre86'] as const;

export function ResultView({ entry }: { entry: HistoryEntry }) {
  const { result } = entry;
  const st = STATUS_TEXT[entry.priceStatus];
  const priceAge = entry.observedAt ? Math.max(0, Math.round((Date.parse(entry.calculatedAt) - Date.parse(entry.observedAt)) / 60000)) : null;
  const totalCoins = COIN_KEYS.reduce((s, k) => s + entry.assets[k], 0);
  const manualItems = result.items.filter((i) => entry.quotes[ASSET_SPECS[i.key].priceKey].source === 'manual' && i.status !== 'empty');
  const noted = result.items.filter((i) => entry.quotes[ASSET_SPECS[i.key].priceKey].note && (i.status === 'unknown' || entry.quotes[ASSET_SPECS[i.key].priceKey].derived || entry.quotes[ASSET_SPECS[i.key].priceKey].source === 'manual'));

  return (
    <div className="result">
      <section className="hero">
        <div className="hero-top">
          <span className="hero-label">ارزش کل دارایی‌ها</span>
          <span className="badges">
            <Badge tone={st.tone}>{st.text}</Badge>
            <Badge tone={result.complete ? 'ok' : 'bad'}>{result.complete ? 'قیمت‌ها کامل' : `ناقص — ${fmtQty(result.unknownKeys.length)} مورد بدون قیمت`}</Badge>
          </span>
        </div>
        <div className="hero-amount">
          <span className="num">{fmtMoney(result.totalRial)}</span>
          <span className="unit">ریال</span>
        </div>
        <div className="hero-sub">
          معادل {fmtMoney(result.totalToman)} تومان <span className="muted">(فقط برای سهولت خواندن؛ محاسبات به ریال است)</span>
        </div>
        {!result.complete && (
          <p className="alert bad">
            این عدد جمع قطعی نیست؛ قیمت برخی دارایی‌ها در دسترس نبود و صفر فرض نشده است (در جدول «قیمت نامشخص» دیده می‌شود).
          </p>
        )}
        {manualItems.length > 0 && (
          <p className="alert warn">
            {fmtQty(manualItems.length)} قلم با <b>قیمت دستی</b> محاسبه شده است ({manualItems.map((i) => i.label).join('، ')}). این قیمت‌ها را خودتان ثبت کرده‌اید و از سرویس نیامده‌اند.
          </p>
        )}
        {entry.priceStatus !== 'fresh' && (
          <p className="alert warn">
            این محاسبه با قیمتی انجام شده که {entry.priceStatus === 'cached' ? 'در دریافت قبلی ذخیره شده بود' : 'قدیمی بود'}؛ زمان قیمت: {fmtDateTime(entry.observedAt)}. آن را قیمت لحظه‌ای فرض نکنید.
          </p>
        )}
        <div className="meta-line">
          محاسبه: {fmtDateTime(entry.calculatedAt)} · زمان قیمت‌ها: {fmtDateTime(entry.observedAt)}
          {entry.marketClosed ? ' (خارج از ساعت بازار؛ ساعت دقیق نامعلوم)' : ''}
          {priceAge !== null ? ` · قدمت: ${fmtAge(priceAge)}` : ''}
        </div>
      </section>

      <section className="grid3">
        {(['coins', 'usd', 'gold'] as const).map((g) => (
          <div className="stat" key={g}>
            <span className="stat-label">ارزش کل {GROUP_LABELS[g]}</span>
            <span className="stat-num">{fmtMoney(result.groups[g])}</span>
            <span className="stat-unit">ریال</span>
          </div>
        ))}
      </section>

      <section className="panel">
        <h3>ترکیب دارایی‌ها</h3>
        <CompositionBar result={result} />
        <ItemBars result={result} />
      </section>

      <section className="panel">
        <h3>تعداد سکه‌ها به تفکیک نوع</h3>
        <ul className="counts">
          {COIN_KEYS.map((k) => (
            <li key={k}>
              <span>{ASSET_SPECS[k].label}</span>
              <b>{fmtQty(entry.assets[k])}</b>
            </li>
          ))}
          <li className="total">
            <span>جمع کل سکه‌ها</span>
            <b>{fmtQty(totalCoins)}</b>
          </li>
        </ul>
      </section>

      <section className="panel">
        <h3>قیمت‌های استفاده‌شده در محاسبه</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>دارایی</th>
                <th>مقدار ثبت‌شده</th>
                <th>قیمت هر واحد (ریال)</th>
                <th>ارزش کل (ریال)</th>
                <th>زمان به‌روزرسانی قیمت</th>
                <th>منبع قیمت</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((i) => {
                const quote = entry.quotes[ASSET_SPECS[i.key].priceKey];
                const label = i.key === 'goldGrams' ? `طلای گرمی (${fmtQty(entry.goldKarat)} عیار)` : i.label;
                return (
                  <tr key={i.key} className={i.status === 'unknown' ? 'row-unknown' : ''}>
                    <td data-label="دارایی">{label}</td>
                    <td data-label="مقدار ثبت‌شده">{fmtQty(i.quantity)} {i.unit}</td>
                    <td data-label="قیمت هر واحد (ریال)">
                      {quote.available ? <>{fmtUnitPrice(quote.unitPriceRial)}{quote.derived && <small className="muted"> (محاسبه‌شده)</small>}{quote.source === 'manual' && <small className="muted"> (دستی)</small>}</> : <span className="unknown">قیمت نامشخص</span>}
                    </td>
                    <td data-label="ارزش کل (ریال)">
                      {i.status === 'unknown' ? <span className="unknown">قیمت نامشخص</span> : fmtMoney(i.valueRial)}
                    </td>
                    <td data-label="زمان به‌روزرسانی قیمت">{quote.available ? fmtDateTime(quote.source === 'manual' ? quote.enteredAt : entry.observedAt) : '—'}</td>
                    <td data-label="منبع قیمت">{quote.source === 'manual' && quote.available ? 'دستی (ثبت توسط شما)' : quote.available ? <>{entry.provider.attribution}{i.key === 'usd' ? (entry.dollarMarket === 'free' ? ' (بازار آزاد)' : ' (نرخ رسمی)') : ''}</> : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {noted.length > 0 && (
          <ul className="notes">
            {noted.map((i) => (
              <li key={i.key}><b>{ASSET_SPECS[i.key].label}:</b> {entry.quotes[ASSET_SPECS[i.key].priceKey].note}</li>
            ))}
          </ul>
        )}
        <p className="muted small">
          منبع: {entry.provider.name} · واحد دریافتی: {entry.unitMode === 'auto' ? 'تومان (طبق اعلام سرویس)' : entry.unitMode === 'toman' ? 'تومان (تنظیم دستی)' : 'ریال (تنظیم دستی)'} — همه محاسبات به ریال انجام شده است.
          قیمت دلار: {entry.dollarMarket === 'free' ? 'بازار آزاد' : 'نرخ رسمی'}. قیمت‌ها برآورد بازار هستند، نه توصیه مالی.
        </p>
      </section>
    </div>
  );
}
