import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { ApiError } from './errors';

export interface AuthOptions {
  /** رمز عبور برنامه (APP_PASSWORD) */
  password?: string;
  /** اگر true باشد و رمز تنظیم نشده باشد، همه درخواست‌ها با خطای پیکربندی رد می‌شوند (حالت Vercel) */
  required?: boolean;
  secret?: string;
  failDelayMs?: number;
  sessionDays?: number;
}

const COOKIE = 'ma_session';
const sha = (s: string) => createHash('sha256').update(s).digest();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createAuth(opts: AuthOptions, now: () => Date) {
  const enabled = Boolean(opts.password);
  const misconfigured = !enabled && Boolean(opts.required);
  const secret = opts.secret || sha(`my-assets-session:${opts.password ?? ''}`).toString('hex');
  const maxAge = (opts.sessionDays ?? 30) * 86400;

  const sign = (exp: number) => createHmac('sha256', secret).update(String(exp)).digest('hex');
  const makeToken = () => {
    const exp = Math.floor(now().getTime() / 1000) + maxAge;
    return `${exp}.${sign(exp)}`;
  };
  const validToken = (token: string | undefined) => {
    if (!token) return false;
    const [expStr, mac] = token.split('.');
    const exp = Number(expStr);
    if (!Number.isInteger(exp) || !mac || exp < now().getTime() / 1000) return false;
    const a = Buffer.from(mac, 'hex');
    const b = Buffer.from(sign(exp), 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  };
  const readCookie = (req: Request) => {
    for (const part of (req.get('cookie') ?? '').split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === COOKIE) return v.join('=');
    }
    return undefined;
  };
  const isAuthed = (req: Request) => !enabled || validToken(readCookie(req));
  const secureFlag = (req: Request) => (req.get('x-forwarded-proto') === 'https' || req.secure ? '; Secure' : '');

  return {
    enabled,
    misconfigured,
    isAuthed,

    configGuard(_req: Request, _res: Response, next: NextFunction) {
      if (misconfigured) {
        return next(new ApiError(503, 'CONFIG_ERROR', 'رمز عبور برنامه تنظیم نشده است: متغیر محیطی APP_PASSWORD را در Vercel بسازید و دوباره Deploy کنید.'));
      }
      next();
    },

    session(req: Request, res: Response) {
      res.json({ authRequired: enabled, authenticated: isAuthed(req) });
    },

    async login(req: Request, res: Response, next: NextFunction) {
      try {
        const given = typeof req.body?.password === 'string' ? req.body.password : '';
        const ok = enabled && timingSafeEqual(sha(given), sha(opts.password!));
        if (!ok) {
          await sleep(opts.failDelayMs ?? 700); // کند کردن حدس‌زدن رمز
          throw new ApiError(401, 'INVALID_PASSWORD', 'رمز عبور نادرست است.');
        }
        res.setHeader('Set-Cookie', `${COOKIE}=${makeToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secureFlag(req)}`);
        res.json({ authRequired: true, authenticated: true });
      } catch (e) {
        next(e);
      }
    },

    logout(req: Request, res: Response) {
      res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureFlag(req)}`);
      res.json({ authRequired: enabled, authenticated: false });
    },

    guard(req: Request, _res: Response, next: NextFunction) {
      if (!isAuthed(req)) return next(new ApiError(401, 'UNAUTHORIZED', 'برای ادامه وارد شوید.'));
      next();
    },
  };
}
