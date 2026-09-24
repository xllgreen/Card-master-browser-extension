/**
 * Bing 每日壁纸（新标签页背景）。
 *
 * 数据源：https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN
 * 本文件只做纯数据解析，不依赖浏览器扩展 API，便于单元测试。
 */

export const BING_WALLPAPER_API_URL =
  'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN';
export const BING_WALLPAPER_IMAGE_ORIGIN = 'https://cn.bing.com';
export const BING_WALLPAPER_STORAGE_KEY =
  'card-master.new-tab.bing-wallpaper.v1';
export const BING_WALLPAPER_MAX_IMAGES = 8;
export const BING_WALLPAPER_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

export const BING_WALLPAPER_QUALITIES = ['hd', 'uhd'] as const;
export type BingWallpaperQuality = (typeof BING_WALLPAPER_QUALITIES)[number];
export const DEFAULT_BING_WALLPAPER_QUALITY: BingWallpaperQuality = 'hd';

const QUALITY_SUFFIX: Record<BingWallpaperQuality, string> = {
  hd: '1920x1080',
  uhd: 'UHD',
};

export function bingWallpaperQualityLabel(quality: BingWallpaperQuality) {
  return quality === 'uhd' ? '超高清 (4K)' : '高清 (1080P)';
}

export type BingWallpaperImage = {
  /** 形如 YYYYMMDD 的 Bing 图片日期。 */
  date: string;
  title: string;
  copyright: string;
  /** 形如 /th?id=OHR.Name_ZH-CN1234567890 的无尺寸地址。 */
  urlBase: string;
};

export type BingWallpaperSnapshot = {
  version: 1;
  fetchedAt: number;
  images: BingWallpaperImage[];
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizedUrlBase(value: unknown) {
  const candidate = text(value, 512);
  if (!candidate.startsWith('/th') || candidate.includes('..')) return '';
  return candidate;
}

/** 接口把尺寸写在 url 尾部，这里回退推导出无尺寸地址。 */
function urlBaseFromFullUrl(value: unknown) {
  const candidate = text(value, 1024);
  if (!candidate.startsWith('/th') || candidate.includes('..')) return '';
  return normalizedUrlBase(
    candidate.replace(/_(?:\d{3,4}x\d{3,4}|UHD|HLS|HNM|JHN)\.jpg.*$/iu, ''),
  );
}

export function bingWallpaperImageUrl(
  image: BingWallpaperImage,
  quality: BingWallpaperQuality = DEFAULT_BING_WALLPAPER_QUALITY,
) {
  return `${BING_WALLPAPER_IMAGE_ORIGIN}${image.urlBase}_${QUALITY_SUFFIX[quality]}.jpg`;
}

function normalizedDate(value: unknown) {
  const candidate = text(value, 16);
  return /^\d{8}$/u.test(candidate) ? candidate : '';
}

function normalizeImage(value: unknown): BingWallpaperImage | null {
  if (!record(value)) return null;
  const urlBase =
    normalizedUrlBase(value.urlbase) || urlBaseFromFullUrl(value.url);
  if (!urlBase) return null;
  return {
    copyright: text(value.copyright, 240),
    date: normalizedDate(value.startdate ?? value.enddate),
    title: text(value.title, 120),
    urlBase,
  };
}

/** 解析 Bing 接口返回的 JSON；忽略无法渲染的条目。 */
export function normalizeBingWallpaperPayload(value: unknown) {
  const images =
    record(value) && Array.isArray(value.images) ? value.images : [];
  const seen = new Set<string>();
  const result: BingWallpaperImage[] = [];
  for (const entry of images) {
    const image = normalizeImage(entry);
    if (!image || seen.has(image.urlBase)) continue;
    seen.add(image.urlBase);
    result.push(image);
    if (result.length >= BING_WALLPAPER_MAX_IMAGES) break;
  }
  return result;
}

export function parseBingWallpaperSnapshot(
  value: unknown,
): BingWallpaperSnapshot | null {
  if (!record(value) || value.version !== 1) return null;
  if (typeof value.fetchedAt !== 'number' || !Number.isFinite(value.fetchedAt))
    return null;
  if (!Array.isArray(value.images)) return null;
  const images: BingWallpaperImage[] = [];
  for (const entry of value.images) {
    if (!record(entry)) continue;
    const urlBase = normalizedUrlBase(entry.urlBase);
    if (!urlBase) continue;
    images.push({
      copyright: text(entry.copyright, 240),
      date: normalizedDate(entry.date),
      title: text(entry.title, 120),
      urlBase,
    });
    if (images.length >= BING_WALLPAPER_MAX_IMAGES) break;
  }
  return images.length > 0
    ? { fetchedAt: value.fetchedAt, images, version: 1 }
    : null;
}

export function bingWallpaperIsFresh(
  snapshot: BingWallpaperSnapshot | null,
  now = Date.now(),
) {
  return Boolean(
    snapshot && now - snapshot.fetchedAt < BING_WALLPAPER_REFRESH_INTERVAL_MS,
  );
}

export function todayBingWallpaper(
  snapshot: BingWallpaperSnapshot | null,
): BingWallpaperImage | null {
  return snapshot?.images[0] ?? null;
}

/** 当天日期（YYYYMMDD）没有命中时退回最新一张。 */
export function bingWallpaperForDate(
  snapshot: BingWallpaperSnapshot | null,
  date: string,
) {
  return (
    snapshot?.images.find((image) => image.date === date) ??
    todayBingWallpaper(snapshot)
  );
}

/** 设置页与后台共用的读取/刷新能力。 */
export type BingWallpaperSettingsController = {
  read(): Promise<BingWallpaperSnapshot | null>;
  refresh(): Promise<BingWallpaperSnapshot | null>;
  subscribe(listener: () => void): () => void;
};

export function bingWallpaperDateLabel(date: string) {
  if (!/^\d{8}$/u.test(date)) return '';
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}
