import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { resolve } from 'node:path';
import { createClient } from 'redis';
import { StorageError } from '../errors';
import { atomicWriteFile, readTextIfExists, withLock } from './files';

/** لایه ذخیره‌سازی متن؛ نام‌ها ثابت و داخلی‌اند (هرگز از ورودی کاربر ساخته نمی‌شوند). */
export interface TextStore {
  read(name: string): Promise<string | null>;
  write(name: string, content: string): Promise<void>;
  remove(name: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
  lock<T>(name: string, fn: () => Promise<T>): Promise<T>;
}

const NAME_RE = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/i;
function checkName(name: string) {
  if (!NAME_RE.test(name) || name.includes('..')) throw new StorageError('INVALID', 'نام ذخیره‌سازی نامعتبر است.');
}

export class FileTextStore implements TextStore {
  constructor(private dir: string) {}
  private path(name: string) {
    checkName(name);
    return join(this.dir, name);
  }
  read(name: string) {
    return readTextIfExists(this.path(name));
  }
  write(name: string, content: string) {
    return atomicWriteFile(this.path(name), content);
  }
  async remove(name: string) {
    await rm(this.path(name), { force: true });
  }
  async list(prefix: string) {
    const [dir, ...rest] = prefix.split('/');
    try {
      return (await readdir(join(this.dir, dir))).map((f) => `${dir}/${f}`).filter((n) => n.startsWith(prefix) && rest.length <= 1);
    } catch {
      return [];
    }
  }
  lock<T>(name: string, fn: () => Promise<T>) {
    return withLock(this.path(name), fn);
  }
}

export class MemoryTextStore implements TextStore {
  private m = new Map<string, string>();
  async read(name: string) {
    checkName(name);
    return this.m.get(name) ?? null;
  }
  async write(name: string, content: string) {
    checkName(name);
    this.m.set(name, content);
  }
  async remove(name: string) {
    this.m.delete(name);
  }
  async list(prefix: string) {
    return [...this.m.keys()].filter((k) => k.startsWith(prefix));
  }
  lock<T>(name: string, fn: () => Promise<T>) {
    return withLock(`mem:${name}`, fn);
  }
}

/** Upstash Redis از طریق REST (بدون وابستگی اضافه). مناسب Vercel (Marketplace → Upstash). */
export class UpstashTextStore implements TextStore {
  constructor(
    private url: string,
    private token: string,
    private fetchImpl: typeof fetch = fetch,
    private prefix = 'my-assets:',
  ) {}

  private async cmd(args: string[]): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
    } catch {
      throw new StorageError('UNAVAILABLE', 'اتصال به پایگاه داده (Upstash Redis) برقرار نشد.');
    }
    const body = (await res.json().catch(() => null)) as { result?: unknown; error?: string } | null;
    if (!res.ok || !body || body.error) throw new StorageError('UNAVAILABLE', 'پایگاه داده (Upstash Redis) خطا داد؛ آدرس و توکن را بررسی کنید.');
    return body.result;
  }

  async read(name: string) {
    checkName(name);
    const r = await this.cmd(['GET', this.prefix + name]);
    return typeof r === 'string' ? r : null;
  }
  async write(name: string, content: string) {
    checkName(name);
    await this.cmd(['SET', this.prefix + name, content]);
  }
  async remove(name: string) {
    checkName(name);
    await this.cmd(['DEL', this.prefix + name]);
  }
  async list(prefix: string) {
    const r = await this.cmd(['KEYS', `${this.prefix}${prefix}*`]);
    return Array.isArray(r) ? r.filter((k): k is string => typeof k === 'string').map((k) => k.slice(this.prefix.length)) : [];
  }
  lock<T>(name: string, fn: () => Promise<T>) {
    // قفل فقط داخل همین پردازش است؛ برای استفاده تک‌کاربره کافی است.
    return withLock(`redis:${name}`, fn);
  }
}

/** Redis با پروتکل استاندارد (REDIS_URL، مثلاً redis:// یا rediss://). برای Redis Cloud و دیتابیس‌های Redis در Vercel. */
export class RedisTcpStore implements TextStore {
  private client: ReturnType<typeof createClient> | null = null;
  constructor(
    private url: string,
    private prefix = 'my-assets:',
  ) {}

  private async conn() {
    if (!this.client) {
      const c = createClient({ url: this.url, socket: { connectTimeout: 5000, reconnectStrategy: (n) => (n > 2 ? new Error('retries exhausted') : 200) } });
      c.on('error', () => undefined); // خطاها در هر دستور مدیریت می‌شوند
      this.client = c;
    }
    if (!this.client.isOpen) await this.client.connect();
    return this.client;
  }

  private async run<T>(fn: (c: ReturnType<typeof createClient>) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn(await this.conn());
      } catch {
        const old = this.client;
        this.client = null; // اتصال خراب (مثلاً بعد از توقف تابع) → یک بار اتصال تازه
        old?.disconnect().catch(() => undefined);
        if (attempt >= 1) throw new StorageError('UNAVAILABLE', 'اتصال به پایگاه داده Redis برقرار نشد؛ REDIS_URL را بررسی کنید.');
      }
    }
  }

  async read(name: string) {
    checkName(name);
    return this.run((c) => c.get(this.prefix + name));
  }
  async write(name: string, content: string) {
    checkName(name);
    await this.run((c) => c.set(this.prefix + name, content));
  }
  async remove(name: string) {
    checkName(name);
    await this.run((c) => c.del(this.prefix + name));
  }
  async list(prefix: string) {
    const keys = await this.run((c) => c.keys(`${this.prefix}${prefix}*`));
    return keys.map((k) => k.slice(this.prefix.length));
  }
  lock<T>(name: string, fn: () => Promise<T>) {
    return withLock(`redis-tcp:${name}`, fn);
  }
}

export interface StoreChoice {
  store: TextStore;
  /** سقف تعداد ردیف تاریخچه (برای محدودیت اندازه هر مقدار در Redis) */
  maxHistoryEntries?: number;
  kind: 'redis' | 'file';
  label?: string;
}

export function createStoreFromEnv(env: Record<string, string | undefined>, fetchImpl: typeof fetch = fetch): StoreChoice {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (url && token) return { store: new UpstashTextStore(url, token, fetchImpl), maxHistoryEntries: 200, kind: 'redis' };
  const redisUrl = env.REDIS_URL || env.KV_URL;
  if (redisUrl) return { store: new RedisTcpStore(redisUrl), maxHistoryEntries: 200, kind: 'redis' };
  if (env.VERCEL) {
    throw new Error('پایگاه داده تنظیم نشده است: در Vercel یک دیتابیس Redis به پروژه وصل کنید (متغیر REDIS_URL، یا KV_REST_API_URL و KV_REST_API_TOKEN).');
  }
  return { store: new FileTextStore(resolve(env.DATA_DIR ?? './data')), kind: 'file' };
}
