import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { Login } from './components/Login';
import { AssetsPage } from './components/AssetsPage';
import { Dashboard } from './components/Dashboard';
import { HistoryPage } from './components/HistoryPage';
import { SettingsPage } from './components/SettingsPage';
import { Toast, type ToastState } from './components/ui';

const TABS = [
  { id: 'dashboard', label: 'داشبورد' },
  { id: 'assets', label: 'دارایی‌ها' },
  { id: 'history', label: 'تاریخچه' },
  { id: 'settings', label: 'تنظیمات' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function App() {
  const [tab, setTab] = useState<TabId>('dashboard');
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [auth, setAuth] = useState<{ phase: 'loading' | 'login' | 'ok' | 'error'; required: boolean; message?: string }>({ phase: 'loading', required: false });

  const checkSession = useCallback(() => {
    api
      .session()
      .then((s) => setAuth({ phase: !s.authRequired || s.authenticated ? 'ok' : 'login', required: s.authRequired }))
      .catch((e) => setAuth({ phase: 'error', required: false, message: e instanceof Error ? e.message : 'خطا' }));
  }, []);
  useEffect(() => {
    checkSession();
    const h = () => setAuth((a) => ({ ...a, phase: 'login' }));
    window.addEventListener('ma-unauthorized', h);
    return () => window.removeEventListener('ma-unauthorized', h);
  }, [checkSession]);
  const notify = useCallback((t: ToastState) => setToast(t), []);
  const closeToast = useCallback(() => setToast(null), []);

  async function logout() {
    await api.logout().catch(() => undefined);
    setDirty(false);
    setAuth({ phase: 'login', required: true });
  }

  if (auth.phase === 'loading') return <div className="shell"><p className="muted">در حال بارگذاری…</p></div>;
  if (auth.phase === 'error') return <div className="shell"><p className="alert bad">{auth.message}</p></div>;
  if (auth.phase === 'login') return <div className="shell"><h1 className="login-title">مدیریت دارایی‌های من</h1><Login onDone={() => { setAuth({ phase: 'ok', required: true }); }} /></div>;

  // تب‌ها فقط وقتی فعال‌اند mount می‌شوند؛ AssetsPage برای حفظ تغییرات ذخیره‌نشده همیشه mount می‌ماند.
  return (
    <div className="shell">
      <header className="topbar">
        <h1>مدیریت دارایی‌های من</h1>
        <nav role="tablist" aria-label="بخش‌ها">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === 'assets' && dirty && <i className="dot" aria-label="تغییر ذخیره‌نشده" />}
            </button>
          ))}
        </nav>
        {auth.required && <button className="btn tiny" onClick={logout}>خروج</button>}
      </header>
      <main>
        {tab === 'dashboard' && <Dashboard dirty={dirty} notify={notify} />}
        <div hidden={tab !== 'assets'}><AssetsPage onDirty={setDirty} notify={notify} /></div>
        {tab === 'history' && <HistoryPage notify={notify} />}
        {tab === 'settings' && <SettingsPage notify={notify} />}
      </main>
      <footer>قیمت‌ها از سرویس انتخاب‌شده در تنظیمات دریافت می‌شوند و برآورد بازار هستند، نه توصیه مالی.</footer>
      <Toast toast={toast} onClose={closeToast} />
    </div>
  );
}
