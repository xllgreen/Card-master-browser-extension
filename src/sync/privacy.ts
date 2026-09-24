/**
 * 同步隐私开关：决定 WebDAV 同步是否携带 API 密钥等敏感字段。
 *
 * 万象星核默认会把 AI 服务配置（含 API Key、请求地址、模型）写入 WebDAV，
 * 用户可以在全局设置里关闭该开关，只同步非敏感字段。
 */

export const SYNC_PRIVACY_STORAGE_KEY = 'card-master.sync-privacy.v1';
export const SYNC_PRIVACY_DEFAULT_INCLUDE_SECRETS = true;

export type SyncPrivacySettings = {
  includeSecrets: boolean;
};

export type SyncPrivacyStorageArea = Pick<
  chrome.storage.StorageArea,
  'get' | 'set'
>;

export function normalizeSyncPrivacySettings(
  value: unknown,
): SyncPrivacySettings {
  const includeSecrets =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>).includeSecrets
      : undefined;
  return {
    includeSecrets:
      typeof includeSecrets === 'boolean'
        ? includeSecrets
        : SYNC_PRIVACY_DEFAULT_INCLUDE_SECRETS,
  };
}

export class SyncPrivacyRepository {
  constructor(private readonly storage: SyncPrivacyStorageArea) {}

  async read(): Promise<SyncPrivacySettings> {
    const stored = await this.storage.get(SYNC_PRIVACY_STORAGE_KEY);
    return normalizeSyncPrivacySettings(stored[SYNC_PRIVACY_STORAGE_KEY]);
  }

  async write(value: unknown): Promise<SyncPrivacySettings> {
    const settings = normalizeSyncPrivacySettings(value);
    await this.storage.set({ [SYNC_PRIVACY_STORAGE_KEY]: settings });
    return settings;
  }
}
