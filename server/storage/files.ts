import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { StorageError } from '../errors';
import type { TextStore } from './textStore';

const locks = new Map<string, Promise<unknown>>();

/** صف‌کردن عملیات روی یک فایل تا نوشتن‌های هم‌زمان با هم تداخل نکنند */
export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(
    key,
    next.catch(() => undefined),
  );
  return next;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      // ویندوز: آنتی‌ویروس/ویرایشگر ممکن است لحظه‌ای فایل را قفل کند
      if (attempt < 6 && (code === 'EPERM' || code === 'EACCES' || code === 'EBUSY')) {
        await sleep(40 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
}

/** نوشتن اتمیک: فایل موقت در همان پوشه، fsync، سپس rename روی فایل اصلی */
export async function atomicWriteFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  const fh = await open(tmp, 'w');
  try {
    await fh.writeFile(content, 'utf8');
    await fh.sync();
  } finally {
    await fh.close();
  }
  try {
    await renameWithRetry(tmp, path);
  } catch (e) {
    await rm(tmp, { force: true });
    throw e;
  }
}

export async function readTextIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

export function parseJsonStrict(raw: string, what: string): unknown {
  try {
    // حذف BOM که برخی ویرایشگرهای ویندوز اضافه می‌کنند
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch {
    throw new StorageError('CORRUPT', `فایل ${what} JSON معتبر نیست. آن را اصلاح کنید یا از پشتیبان بازگردانید.`);
  }
}

/** ذخیره‌ساز ساده یک سند JSON روی هر TextStore (فایل، Redis، حافظه) */
export class JsonDoc<T> {
  constructor(
    private store: TextStore,
    private name: string,
  ) {}

  async read(): Promise<T | null> {
    const raw = await this.store.read(this.name);
    return raw === null ? null : (parseJsonStrict(raw, this.name) as T);
  }

  write(value: T): Promise<void> {
    return this.store.lock(this.name, () => this.writeUnlocked(value));
  }

  /** فقط داخل store.lock همین نام استفاده شود (برای خواندن-تغییر-نوشتن) */
  writeUnlocked(value: T): Promise<void> {
    return this.store.write(this.name, JSON.stringify(value, null, 2) + '\n');
  }
}
