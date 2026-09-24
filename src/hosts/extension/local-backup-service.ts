import {
  buildLocalBackup,
  expandLocalBackupEntries,
  formatLocalBackupSummary,
  type LocalBackupExportResult,
  type LocalBackupImportResult,
  localBackupFilename,
  parseLocalBackup,
  serializeLocalBackup,
  summarizeLocalBackup,
} from '../../backup/local-backup';
import {
  SYNC_STORAGE_KEY,
  type SyncConnection,
  validateConnection,
} from '../../sync/model';
import { type SyncProjection, syncScriptKey } from '../../sync/projection';
import {
  storedScript,
  type TransactionalScriptRepository,
} from '../../userscript/application/script-repository';
import type { ScriptTrashStore } from '../../userscript/application/script-trash';
import type { ExtensionStorageArea } from './api';

function storedConnection(value: unknown): SyncConnection | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = (value as { connection?: unknown }).connection;
  if (!candidate) return null;
  try {
    return validateConnection(candidate);
  } catch {
    return null;
  }
}

/**
 * 本机完整备份：把牌库、全部偏好和 WebDAV 设置打包成一份 JSON 文件，
 * 不经过网络，用户自己保存与回传。
 */
export class ExtensionLocalBackupService {
  constructor(
    private readonly dependencies: {
      storage: ExtensionStorageArea;
      projection: SyncProjection;
      repository: TransactionalScriptRepository;
      trash?: ScriptTrashStore;
      reportFailure: (context: string, error: unknown) => void;
    },
  ) {}

  private async connectedWebdav(): Promise<SyncConnection | null> {
    try {
      const stored = await this.dependencies.storage.get(SYNC_STORAGE_KEY);
      return storedConnection(stored?.[SYNC_STORAGE_KEY]);
    } catch {
      return null;
    }
  }

  async export(): Promise<LocalBackupExportResult> {
    const [entries, webdav] = await Promise.all([
      this.dependencies.projection.readEntries('full'),
      this.connectedWebdav(),
    ]);
    const file = buildLocalBackup({
      createdAt: Date.now(),
      entries,
      webdav,
    });
    const summary = summarizeLocalBackup(file);
    return {
      text: serializeLocalBackup(file),
      filename: localBackupFilename(file.createdAt),
      summary: formatLocalBackupSummary(summary),
      scriptCount: summary.scriptCount,
    };
  }

  async import(backup: string): Promise<LocalBackupImportResult> {
    const file = parseLocalBackup(backup);
    const current = await this.dependencies.projection.readEntries('full');
    const next = expandLocalBackupEntries({ backup: file.entries, current });
    const before = await this.dependencies.repository.list();
    const { skipped } = await this.dependencies.projection.applyEntries(
      next,
      current,
      'full',
    );
    const after = await this.dependencies.repository.list();
    const kept = new Set(after.map(syncScriptKey));
    const removed = before.filter((script) => !kept.has(syncScriptKey(script)));
    if (removed.length > 0 && this.dependencies.trash) {
      try {
        await this.dependencies.trash.record(removed.map(storedScript));
      } catch (error) {
        this.dependencies.reportFailure('回收站写入失败', error);
      }
    }
    const summary = summarizeLocalBackup(file);
    return {
      summary: formatLocalBackupSummary(summary),
      scriptCount: summary.scriptCount,
      settingCount: summary.settingCount,
      skipped: [...skipped],
      webdav: file.webdav,
    };
  }
}
