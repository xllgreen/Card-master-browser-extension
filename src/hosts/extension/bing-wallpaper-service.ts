/**
 * 必应每日壁纸后台服务。
 *
 * 只负责抓取接口结果并写入扩展本地存储；抓取失败时保留上一次快照，
 * 新标签页与设置页都直接读取同一份数据，不再走额外的消息协议。
 */
import {
  BING_WALLPAPER_API_URL,
  BING_WALLPAPER_STORAGE_KEY,
  type BingWallpaperSettingsController,
  type BingWallpaperSnapshot,
  bingWallpaperIsFresh,
  normalizeBingWallpaperPayload,
  parseBingWallpaperSnapshot,
} from '../../new-tab/application/bing-wallpaper';
import {
  type ExtensionApi,
  type ExtensionStorageArea,
  sendExtensionTransportRequest,
} from './api';
import { EXTENSION_CHANNEL } from './extension-channel';

export const BING_WALLPAPER_ALARM = 'new-tab.bing-wallpaper';
const BING_WALLPAPER_TIMEOUT_MS = 10_000;

type BingWallpaperResponse = {
  body(): Promise<unknown>;
  ok: boolean;
  status: number;
};

export type BingWallpaperFetch = (
  url: string,
  init: { credentials: 'omit'; signal: AbortSignal },
) => Promise<BingWallpaperResponse>;

export class BingWallpaperService {
  private inflight: Promise<BingWallpaperSnapshot> | null = null;

  constructor(
    private readonly storage: ExtensionStorageArea,
    private readonly fetchImpl: BingWallpaperFetch = defaultFetch,
    private readonly now: () => number = () => Date.now(),
  ) {}

  read(): Promise<BingWallpaperSnapshot | null> {
    return this.readStored();
  }

  /** force 为 false 时，6 小时内的快照直接复用，不重复请求。 */
  async refresh(force = false): Promise<BingWallpaperSnapshot | null> {
    const current = await this.readStored();
    if (!force && bingWallpaperIsFresh(current, this.now())) return current;
    if (this.inflight) return this.inflight;
    const task = this.download();
    this.inflight = task;
    try {
      return await task;
    } finally {
      this.inflight = null;
    }
  }

  /** 定时任务用：失败时静默保留旧快照。 */
  async refreshIfStale(): Promise<BingWallpaperSnapshot | null> {
    try {
      return await this.refresh();
    } catch {
      return this.readStored();
    }
  }

  private async readStored() {
    const stored = await this.storage.get(BING_WALLPAPER_STORAGE_KEY);
    return parseBingWallpaperSnapshot(stored[BING_WALLPAPER_STORAGE_KEY]);
  }

  private async download() {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      BING_WALLPAPER_TIMEOUT_MS,
    );
    let payload: unknown;
    try {
      const response = await this.fetchImpl(BING_WALLPAPER_API_URL, {
        credentials: 'omit',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`必应壁纸接口返回 ${response.status}。`);
      }
      payload = await response.body();
    } finally {
      clearTimeout(timer);
    }
    const images = normalizeBingWallpaperPayload(payload);
    if (images.length === 0) {
      throw new Error('必应壁纸接口没有返回可用图片。');
    }
    const snapshot: BingWallpaperSnapshot = {
      fetchedAt: this.now(),
      images,
      version: 1,
    };
    await this.storage.set({ [BING_WALLPAPER_STORAGE_KEY]: snapshot });
    return snapshot;
  }
}

async function defaultFetch(
  url: string,
  init: { credentials: 'omit'; signal: AbortSignal },
): Promise<BingWallpaperResponse> {
  const response = await fetch(url, init);
  return {
    body: () => response.json(),
    ok: response.ok,
    status: response.status,
  };
}

export class ExtensionBingWallpaperSettingsController
  implements BingWallpaperSettingsController
{
  constructor(private readonly api: ExtensionApi) {}

  async read() {
    const stored = await this.api.storage.local.get(BING_WALLPAPER_STORAGE_KEY);
    return parseBingWallpaperSnapshot(stored[BING_WALLPAPER_STORAGE_KEY]);
  }

  subscribe(listener: () => void) {
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName === 'local' && BING_WALLPAPER_STORAGE_KEY in changes) {
        listener();
      }
    };
    this.api.storage.onChanged.addListener(onChanged);
    return () => this.api.storage.onChanged.removeListener(onChanged);
  }

  async refresh() {
    const response = await sendExtensionTransportRequest<{
      error?: string;
      snapshot?: unknown;
    }>(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'new-tab-bing-wallpaper-refresh',
    });
    if (response.error) throw new Error(response.error);
    return parseBingWallpaperSnapshot(response.snapshot);
  }
}
