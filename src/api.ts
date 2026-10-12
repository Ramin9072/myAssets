import type { Assets } from '../shared/assetSpecs';
import type {
  AssetsResponse,
  BackupFile,
  ConnectionStatus,
  HistoryEntry,
  HistorySummary,
  MetaResponse,
  Settings,
} from '../shared/types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public body: Record<string, any> = {},
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'my-assets' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'OFFLINE', 'ارتباط با سرور برنامه برقرار نشد. مطمئن شوید سرور در حال اجراست.');
  }
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* پاسخ غیر JSON */
  }
  if (res.status === 401 && json?.error?.code === 'UNAUTHORIZED') window.dispatchEvent(new Event('ma-unauthorized'));
  if (!res.ok) {
    throw new ApiError(res.status, json?.error?.code ?? 'ERROR', json?.error?.message ?? 'خطای ناشناخته', json ?? {});
  }
  return json as T;
}

export interface CalculateResponse {
  entry: HistoryEntry;
  historySaved: boolean;
  historyError?: string;
}

export interface SessionInfo {
  authRequired: boolean;
  authenticated: boolean;
}

export const api = {
  session: () => request<SessionInfo>('GET', '/api/session'),
  login: (password: string) => request<SessionInfo>('POST', '/api/login', { password }),
  logout: () => request<SessionInfo>('POST', '/api/logout', {}),
  meta: () => request<MetaResponse>('GET', '/api/meta'),
  getAssets: () => request<AssetsResponse>('GET', '/api/assets'),
  saveAssets: (assets: Assets, baseRevision: string) => request<AssetsResponse>('PUT', '/api/assets', { assets, baseRevision }),
  getBackup: () => request<BackupFile>('GET', '/api/assets/backup'),
  restore: (backup: unknown) => request<AssetsResponse>('POST', '/api/assets/restore', { backup, confirmed: true }),
  getSettings: () => request<Settings>('GET', '/api/settings'),
  saveSettings: (s: Settings) => request<Settings>('PUT', '/api/settings', s),
  status: () => request<ConnectionStatus>('GET', '/api/prices/status'),
  testConnection: () => request<ConnectionStatus>('POST', '/api/prices/test', {}),
  calculate: (mode: 'live' | 'cached', acceptStale: boolean) => request<CalculateResponse>('POST', '/api/calculate', { mode, acceptStale }),
  history: () => request<HistorySummary[]>('GET', '/api/history'),
  latest: () => request<{ entry: HistoryEntry | null }>('GET', '/api/history/latest'),
  historyEntry: (id: string) => request<{ entry: HistoryEntry }>('GET', `/api/history/${encodeURIComponent(id)}`),
};
