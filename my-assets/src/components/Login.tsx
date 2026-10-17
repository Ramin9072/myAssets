import { useState, type FormEvent } from 'react';
import { api } from '../api';

export function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api.login(password);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ورود ناموفق بود.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="panel" onSubmit={submit}>
        <h2>ورود</h2>
        <p className="muted small">برای دیدن و ویرایش دارایی‌ها رمز عبور را وارد کنید.</p>
        <div className="field">
          <label htmlFor="pw">رمز عبور</label>
          <input id="pw" type="password" dir="ltr" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          <span className="err" role="alert">{error}</span>
        </div>
        <button className="btn primary" type="submit" disabled={busy || password === ''}>{busy ? 'در حال ورود…' : 'ورود'}</button>
      </form>
    </div>
  );
}
