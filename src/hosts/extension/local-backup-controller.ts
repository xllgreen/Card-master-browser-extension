import type {
  LocalBackupController,
  LocalBackupExportResult,
  LocalBackupImportResult,
} from '../../backup/local-backup';
import { type ExtensionApi, sendExtensionRequest } from './api';
import { EXTENSION_CHANNEL } from './protocol';

/** 本机备份走扩展消息，由后台读取完整牌库与全部偏好。 */
export class ExtensionLocalBackupController implements LocalBackupController {
  constructor(private readonly api: ExtensionApi) {}

  async export(): Promise<LocalBackupExportResult> {
    const response = await sendExtensionRequest<
      Partial<LocalBackupExportResult> & { error?: string }
    >(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'local-backup-command',
      action: 'export',
    });
    if (response?.error) throw new Error(response.error);
    if (
      !response ||
      typeof response.text !== 'string' ||
      typeof response.filename !== 'string'
    ) {
      throw new Error('本机备份没有返回可保存的内容。');
    }
    return {
      text: response.text,
      filename: response.filename,
      summary: response.summary ?? '',
      scriptCount: response.scriptCount ?? 0,
    };
  }

  async import(backup: string): Promise<LocalBackupImportResult> {
    const response = await sendExtensionRequest<
      Partial<LocalBackupImportResult> & { error?: string }
    >(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'local-backup-command',
      action: 'import',
      backup,
    });
    if (response?.error) throw new Error(response.error);
    if (!response || typeof response.summary !== 'string') {
      throw new Error('本机备份导入没有返回结果。');
    }
    return {
      summary: response.summary,
      scriptCount: response.scriptCount ?? 0,
      settingCount: response.settingCount ?? 0,
      skipped: response.skipped ?? [],
      webdav: response.webdav ?? null,
    };
  }
}
