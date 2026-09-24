import {
  type SyncConnection,
  type SyncEntries,
  validateConnection,
  validateEntries,
} from '../sync/model';

export const LOCAL_BACKUP_FORMAT = 'novabay-local-backup';
export const LOCAL_BACKUP_VERSION = 1;
export const LOCAL_BACKUP_APP = '万象星核 NovaBay';
export const LOCAL_BACKUP_MAX_CHARS = 48_000_000;

export type LocalBackupFile = {
  format: typeof LOCAL_BACKUP_FORMAT;
  version: typeof LOCAL_BACKUP_VERSION;
  app: string;
  createdAt: number;
  webdav: SyncConnection | null;
  entries: SyncEntries;
};

export type LocalBackupExportResult = {
  text: string;
  filename: string;
  summary: string;
  scriptCount: number;
};

export type LocalBackupImportResult = {
  summary: string;
  scriptCount: number;
  settingCount: number;
  skipped: string[];
  webdav: SyncConnection | null;
};

export interface LocalBackupController {
  export(): Promise<LocalBackupExportResult>;
  import(backup: string): Promise<LocalBackupImportResult>;
}

export type LocalBackupSummary = {
  createdAt: number;
  scriptCount: number;
  settingCount: number;
  webdavConfigured: boolean;
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function backupWebdav(value: unknown): SyncConnection | null {
  if (value === null) return null;
  return validateConnection(value);
}

export function buildLocalBackup(input: {
  createdAt: number;
  entries: SyncEntries;
  webdav: SyncConnection | null;
}): LocalBackupFile {
  if (!Number.isFinite(input.createdAt) || input.createdAt < 0)
    throw new Error('备份时间戳无效。');
  validateEntries(input.entries);
  return {
    format: LOCAL_BACKUP_FORMAT,
    version: LOCAL_BACKUP_VERSION,
    app: LOCAL_BACKUP_APP,
    createdAt: Math.floor(input.createdAt),
    webdav: input.webdav ? validateConnection(input.webdav) : null,
    entries: input.entries,
  };
}

export function serializeLocalBackup(file: LocalBackupFile): string {
  return JSON.stringify(file, null, 2);
}

export function parseLocalBackup(text: string): LocalBackupFile {
  if (typeof text !== 'string' || !text.trim())
    throw new Error('备份文件为空，未改动本机数据。');
  if (text.length > LOCAL_BACKUP_MAX_CHARS)
    throw new Error('备份文件超过 48 MB，本机数据未被替换。');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('备份文件不是有效的 JSON，本机数据未被替换。');
  }
  if (!record(value) || value.format !== LOCAL_BACKUP_FORMAT)
    throw new Error('这不是万象星核的完整备份文件，本机数据未被替换。');
  if (value.version !== LOCAL_BACKUP_VERSION)
    throw new Error(
      `备份版本 ${String(value.version)} 暂不支持导入，请在本机更新万象星核后重试。`,
    );
  if (typeof value.app !== 'string' || value.app.length > 512)
    throw new Error('备份文件缺少来源信息，本机数据未被替换。');
  if (
    typeof value.createdAt !== 'number' ||
    !Number.isFinite(value.createdAt) ||
    value.createdAt < 0
  )
    throw new Error('备份文件缺少生成时间，本机数据未被替换。');
  if (!Object.hasOwn(value, 'webdav') || !Object.hasOwn(value, 'entries'))
    throw new Error('备份文件内容不完整，本机数据未被替换。');
  let webdav: SyncConnection | null;
  try {
    webdav = backupWebdav(value.webdav);
  } catch (error) {
    throw new Error(
      `备份文件中的 WebDAV 设置不可用：${error instanceof Error ? error.message : '格式无效'}`,
    );
  }
  let entries: SyncEntries;
  try {
    entries = structuredClone(value.entries) as SyncEntries;
    validateEntries(entries);
  } catch (error) {
    throw new Error(
      `备份文件内容校验失败：${error instanceof Error ? error.message : '格式无效'}`,
    );
  }
  return buildLocalBackup({
    createdAt: value.createdAt,
    entries,
    webdav,
  });
}

/**
 * 恢复时以备份为准：本机有、备份里没有的卡牌会被标记成删除，
 * 其余配置项保持备份原样，避免导入后新旧混在一起。
 */
export function expandLocalBackupEntries(input: {
  backup: SyncEntries;
  current: SyncEntries;
}): SyncEntries {
  const next: SyncEntries = structuredClone(input.backup);
  for (const key of Object.keys(input.current)) {
    if (!key.startsWith('script:')) continue;
    if (Object.hasOwn(next, key)) continue;
    next[key] = null;
  }
  return next;
}

export function summarizeLocalBackup(
  file: LocalBackupFile,
): LocalBackupSummary {
  const keys = Object.keys(file.entries);
  return {
    createdAt: file.createdAt,
    scriptCount: keys.filter((key) => key.startsWith('script:')).length,
    settingCount: keys.filter((key) => key.startsWith('settings:')).length,
    webdavConfigured: file.webdav !== null,
  };
}

export function formatLocalBackupSummary(summary: LocalBackupSummary) {
  const parts = [
    `脚本 ${summary.scriptCount} 张`,
    `偏好设置 ${summary.settingCount} 项`,
    summary.webdavConfigured ? '含 WebDAV 服务器' : '不含 WebDAV 服务器',
  ];
  return `${new Date(summary.createdAt).toLocaleString('zh-CN', { hour12: false })} 生成 · ${parts.join(' · ')}`;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function localBackupFilename(at: number) {
  const date = new Date(Number.isFinite(at) ? at : Date.now());
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `novabay-backup-${stamp}.json`;
}
