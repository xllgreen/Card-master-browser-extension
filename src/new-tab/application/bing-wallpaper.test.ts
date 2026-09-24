import { describe, expect, it } from 'vitest';
import {
  BING_WALLPAPER_MAX_IMAGES,
  BING_WALLPAPER_STORAGE_KEY,
  type BingWallpaperSnapshot,
  bingWallpaperDateLabel,
  bingWallpaperForDate,
  bingWallpaperImageUrl,
  bingWallpaperIsFresh,
  bingWallpaperQualityLabel,
  normalizeBingWallpaperPayload,
  parseBingWallpaperSnapshot,
  todayBingWallpaper,
} from './bing-wallpaper';

const payload = {
  images: [
    {
      startdate: '20260921',
      enddate: '20260922',
      url: '/th?id=OHR.FallAspens_ZH-CN7235054933_1920x1080.jpg&rf=LaDigue_1920x1080.jpg&pid=hp',
      urlbase: '/th?id=OHR.FallAspens_ZH-CN7235054933',
      copyright: '瓜兹曼山口附近的秋日山杨林 (© Test)',
      title: '金色时节',
    },
    {
      startdate: '20260920',
      url: '/th?id=OHR.Yesterday_ZH-CN1111111111_UHD.jpg&pid=hp',
      copyright: '昨日 (© Test)',
      title: '昨日',
    },
    { startdate: '20260919', urlbase: '../etc/passwd', title: '非法' },
    { urlbase: '/th?id=OHR.NoDate', title: '缺日期' },
  ],
};

describe('bing-wallpaper', () => {
  it(' exposes a stable storage key', () => {
    expect(BING_WALLPAPER_STORAGE_KEY).toBe(
      'card-master.new-tab.bing-wallpaper.v1',
    );
  });

  it('normalizes the archive payload and drops unusable entries', () => {
    const images = normalizeBingWallpaperPayload(payload);
    expect(images).toHaveLength(3);
    expect(images[0]).toEqual({
      copyright: '瓜兹曼山口附近的秋日山杨林 (© Test)',
      date: '20260921',
      title: '金色时节',
      urlBase: '/th?id=OHR.FallAspens_ZH-CN7235054933',
    });
    expect(images[1].urlBase).toBe('/th?id=OHR.Yesterday_ZH-CN1111111111');
    expect(images[2].date).toBe('');
  });

  it('ignores malformed payloads', () => {
    expect(normalizeBingWallpaperPayload(null)).toEqual([]);
    expect(normalizeBingWallpaperPayload({ images: 'nope' })).toEqual([]);
    expect(normalizeBingWallpaperPayload({ images: [1, 2, 3] })).toEqual([]);
  });

  it('caps the archive at the maximum number of images', () => {
    const images = normalizeBingWallpaperPayload({
      images: Array.from({ length: 20 }, (_unused, index) => ({
        startdate: `202601${String(index).padStart(2, '0')}`,
        urlbase: `/th?id=OHR.Item${index}`,
      })),
    });
    expect(images).toHaveLength(BING_WALLPAPER_MAX_IMAGES);
  });

  it('builds quality urls without splitting the query string', () => {
    const [image] = normalizeBingWallpaperPayload(payload);
    expect(bingWallpaperImageUrl(image, 'hd')).toBe(
      'https://cn.bing.com/th?id=OHR.FallAspens_ZH-CN7235054933_1920x1080.jpg',
    );
    expect(bingWallpaperImageUrl(image, 'uhd')).toBe(
      'https://cn.bing.com/th?id=OHR.FallAspens_ZH-CN7235054933_UHD.jpg',
    );
    expect(bingWallpaperImageUrl(image)).toBe(
      bingWallpaperImageUrl(image, 'hd'),
    );
  });

  it('labels qualities for the settings page', () => {
    expect(bingWallpaperQualityLabel('hd')).toContain('1080P');
    expect(bingWallpaperQualityLabel('uhd')).toContain('4K');
  });

  it('round-trips stored snapshots and rejects bad ones', () => {
    const snapshot: BingWallpaperSnapshot = {
      fetchedAt: 1_700_000_000_000,
      images: normalizeBingWallpaperPayload(payload),
      version: 1,
    };
    expect(
      parseBingWallpaperSnapshot(JSON.parse(JSON.stringify(snapshot))),
    ).toEqual(snapshot);
    expect(parseBingWallpaperSnapshot({ ...snapshot, version: 2 })).toBeNull();
    expect(
      parseBingWallpaperSnapshot({ ...snapshot, fetchedAt: 'x' }),
    ).toBeNull();
    expect(parseBingWallpaperSnapshot({ ...snapshot, images: [] })).toBeNull();
    expect(
      parseBingWallpaperSnapshot({
        ...snapshot,
        images: [{ urlBase: 'https://evil.test/a.jpg' }],
      }),
    ).toBeNull();
  });

  it('measures freshness against the refresh interval', () => {
    const snapshot: BingWallpaperSnapshot = {
      fetchedAt: 1_000,
      images: [{ copyright: '', date: '', title: '', urlBase: '/th?id=x' }],
      version: 1,
    };
    expect(bingWallpaperIsFresh(snapshot, 1_000)).toBe(true);
    expect(bingWallpaperIsFresh(snapshot, 1_000 + 6 * 60 * 60 * 1_000)).toBe(
      false,
    );
    expect(bingWallpaperIsFresh(null)).toBe(false);
  });

  it('resolves the newest or the requested day', () => {
    const snapshot: BingWallpaperSnapshot = {
      fetchedAt: 1,
      images: normalizeBingWallpaperPayload(payload),
      version: 1,
    };
    expect(todayBingWallpaper(snapshot)?.date).toBe('20260921');
    expect(bingWallpaperForDate(snapshot, '20260920')?.title).toBe('昨日');
    expect(bingWallpaperForDate(snapshot, '19990101')?.title).toBe('金色时节');
    expect(todayBingWallpaper(null)).toBeNull();
  });

  it('formats bing dates for display', () => {
    expect(bingWallpaperDateLabel('20260921')).toBe('2026-09-21');
    expect(bingWallpaperDateLabel('bad')).toBe('');
  });
});
