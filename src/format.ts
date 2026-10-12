const nf = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 3 });
const dtf = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' });

/** عدد صحیح ریالی (رشته) با جداکننده هزارگان، بدون عبور از Number */
export function fmtMoney(v: string | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const neg = v.startsWith('-');
  const [intPart] = (neg ? v.slice(1) : v).split('.');
  try {
    return (neg ? '−' : '') + new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 }).format(BigInt(intPart));
  } catch {
    return '—';
  }
}

/** قیمت واحد ممکن است اعشار داشته باشد (عیار مشتق‌شده)؛ برای نمایش به ریال صحیح گرد می‌شود */
export function fmtUnitPrice(v: string | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const [i, f = ''] = v.split('.');
  try {
    const up = f.length > 0 && Number(`0.${f}`) >= 0.5 ? 1n : 0n;
    return fmtMoney((BigInt(i) + up).toString());
  } catch {
    return '—';
  }
}

export function fmtQty(n: number): string {
  return nf.format(n);
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return 'نامشخص';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'نامشخص' : dtf.format(d);
}

export function fmtAge(minutes: number | null): string {
  if (minutes === null) return 'نامشخص';
  if (minutes < 60) return `${nf.format(minutes)} دقیقه`;
  const h = Math.floor(minutes / 60);
  if (h < 48) return `${nf.format(h)} ساعت`;
  return `${nf.format(Math.floor(h / 24))} روز`;
}

/** نمایش مقدار برای فیلد ورودی (ارقام فارسی با جداکننده هزارگان) */
export function fmtInput(n: number): string {
  return nf.format(n);
}
