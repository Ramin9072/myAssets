import { randomBytes } from 'node:crypto';
import type { HistoryEntry, HistorySummary } from '../../shared/types';
import { StorageError } from '../errors';
import { JsonDoc } from './files';
import type { TextStore } from './textStore';

interface HistoryFile {
  version: 1;
  entries: HistoryEntry[];
}

export function newHistoryId(now: Date): string {
  return `${now.getTime().toString(36)}-${randomBytes(4).toString('hex')}`;
}

export class HistoryStore {
  private doc: JsonDoc<HistoryFile>;
  constructor(
    private store: TextStore,
    private maxEntries?: number,
  ) {
    this.doc = new JsonDoc<HistoryFile>(store, 'history.json');
  }

  private async load(): Promise<HistoryFile> {
    const f = await this.doc.read();
    if (f === null) return { version: 1, entries: [] };
    if (f.version !== 1 || !Array.isArray(f.entries)) throw new StorageError('CORRUPT', 'ساختار فایل history.json نامعتبر است.');
    return f;
  }

  async list(): Promise<HistorySummary[]> {
    const f = await this.load();
    return f.entries
      .map<HistorySummary>((e) => ({
        id: e.id,
        calculatedAt: e.calculatedAt,
        totalRial: e.result.totalRial,
        totalToman: e.result.totalToman,
        complete: e.result.complete,
        priceStatus: e.priceStatus,
        providerName: e.provider.name,
      }))
      .reverse();
  }

  /** شناسه فقط برای جست‌وجو در حافظه استفاده می‌شود و هرگز در ساخت مسیر فایل نقش ندارد. */
  async get(id: string): Promise<HistoryEntry | null> {
    const f = await this.load();
    return f.entries.find((e) => e.id === id) ?? null;
  }

  async latest(): Promise<HistoryEntry | null> {
    const f = await this.load();
    return f.entries.length ? f.entries[f.entries.length - 1] : null;
  }

  append(entry: HistoryEntry): Promise<void> {
    return this.store.lock('history.json', async () => {
      const f = await this.load();
      f.entries.push(entry);
      if (this.maxEntries && f.entries.length > this.maxEntries) f.entries = f.entries.slice(-this.maxEntries);
      await this.doc.writeUnlocked(f);
    });
  }
}
