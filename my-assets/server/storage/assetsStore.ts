import { createHash } from 'node:crypto';
import { emptyAssets, validateAssetsObject, type Assets } from '../../shared/assetSpecs';
import type { AssetsResponse, BackupFile } from '../../shared/types';
import { StorageError } from '../errors';
import { parseJsonStrict } from './files';
import type { TextStore } from './textStore';

const NAME = 'assets.json';
const revisionOf = (raw: string) => createHash('sha256').update(raw).digest('hex').slice(0, 16);

function serialize(assets: Assets, updatedAt: string | null): string {
  return JSON.stringify({ version: 1, updatedAt, assets }, null, 2) + '\n';
}

export class AssetsStore {
  constructor(
    private store: TextStore,
    private now: () => Date = () => new Date(),
  ) {}

  /** در اولین اجرا مقدار اولیه (همه صفر) ساخته می‌شود. */
  async init(): Promise<void> {
    await this.store.lock(NAME, async () => {
      if ((await this.store.read(NAME)) === null) await this.store.write(NAME, serialize(emptyAssets(), null));
    });
  }

  async read(): Promise<AssetsResponse> {
    const raw = await this.store.read(NAME);
    if (raw === null) return { assets: emptyAssets(), updatedAt: null, revision: 'none' };
    const doc = parseJsonStrict(raw, 'assets.json') as { version?: unknown; updatedAt?: unknown; assets?: unknown };
    if (doc === null || typeof doc !== 'object' || doc.version !== 1) {
      throw new StorageError('CORRUPT', 'نسخه یا ساختار داده‌های دارایی پشتیبانی نمی‌شود.');
    }
    const v = validateAssetsObject(doc.assets);
    if (!v.ok) throw new StorageError('CORRUPT', `داده‌های دارایی نامعتبر است: ${v.errors.join(' ')}`);
    return { assets: v.assets, updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : null, revision: revisionOf(raw) };
  }

  /** ذخیره با کنترل هم‌زمانی: اگر داده بعد از بارگذاری تغییر کرده باشد رد می‌شود. */
  write(assets: Assets, baseRevision?: string): Promise<AssetsResponse> {
    return this.store.lock(NAME, async () => {
      const current = await this.read();
      if (baseRevision !== undefined && baseRevision !== current.revision) {
        throw new StorageError('CONFLICT', 'داده‌های دارایی بعد از بارگذاری تغییر کرده است. صفحه را تازه کنید تا آخرین مقادیر نمایش داده شود.');
      }
      const updatedAt = this.now().toISOString();
      const content = serialize(assets, updatedAt);
      await this.store.write(NAME, content);
      return { assets, updatedAt, revision: revisionOf(content) };
    });
  }

  /** جایگزینی کامل از پشتیبان؛ نسخه فعلی ابتدا در backups/ نگه‌داری می‌شود. */
  restore(assets: Assets): Promise<AssetsResponse> {
    return this.store.lock(NAME, async () => {
      const currentRaw = await this.store.read(NAME);
      if (currentRaw !== null) {
        const stamp = this.now().toISOString().replace(/[:.]/g, '-');
        await this.store.write(`backups/assets-before-restore-${stamp}.json`, currentRaw);
        await this.pruneBackups();
      }
      const updatedAt = this.now().toISOString();
      const content = serialize(assets, updatedAt);
      await this.store.write(NAME, content);
      return { assets, updatedAt, revision: revisionOf(content) };
    });
  }

  private async pruneBackups(keep = 30): Promise<void> {
    try {
      const names = (await this.store.list('backups/')).filter((n) => n.startsWith('backups/assets-before-restore-')).sort();
      for (const n of names.slice(0, Math.max(0, names.length - keep))) await this.store.remove(n);
    } catch {
      /* پاک‌سازی پشتیبان‌های قدیمی حیاتی نیست */
    }
  }

  async exportBackup(): Promise<BackupFile> {
    const cur = await this.read();
    return { format: 'my-assets-backup', version: 1, exportedAt: this.now().toISOString(), assets: cur.assets };
  }
}

export function parseBackupFile(value: unknown): { ok: true; assets: Assets; exportedAt: string | null } | { ok: false; errors: string[] } {
  if (typeof value !== 'object' || value === null) return { ok: false, errors: ['فایل پشتیبان معتبر نیست.'] };
  const o = value as Record<string, unknown>;
  if (o.format !== 'my-assets-backup' || o.version !== 1) {
    return { ok: false, errors: ['این فایل، پشتیبان این برنامه نیست یا نسخه آن پشتیبانی نمی‌شود.'] };
  }
  const v = validateAssetsObject(o.assets);
  if (!v.ok) return v;
  return { ok: true, assets: v.assets, exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : null };
}
