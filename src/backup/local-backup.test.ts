import { describe, expect, it } from 'vitest';
import { type SyncEntries, validateEntries } from '../sync/model';
import {
  buildLocalBackup,
  expandLocalBackupEntries,
  formatLocalBackupSummary,
  LOCAL_BACKUP_FORMAT,
  LOCAL_BACKUP_VERSION,
  localBackupFilename,
  parseLocalBackup,
  serializeLocalBackup,
  summarizeLocalBackup,
} from './local-backup';

const entries: SyncEntries = {
  'script:https%3A%2F%2Fexample.org%2Fdemo': {
    name: '页面翻译',
    value: { manager: { enabled: true }, source: { code: '// demo' } },
  },
  'settings:script-order': { name: '脚本排序', value: [] },
  'settings:script-preferences': {
    name: '脚本全局设置',
    value: { reloadAfterScriptChange: true },
  },
};

const createdAt = new Date(2026, 0, 5, 9, 8, 30).getTime();

describe('本地完整备份', () => {
  it('构建时保留同步投影的全部内容', () => {
    const file = buildLocalBackup({ createdAt, entries, webdav: null });
    expect(file.format).toBe(LOCAL_BACKUP_FORMAT);
    expect(file.version).toBe(LOCAL_BACKUP_VERSION);
    expect(file.app).toBe('万象星核 NovaBay');
    expect(file.createdAt).toBe(createdAt);
    expect(file.webdav).toBeNull();
    expect(Object.keys(file.entries)).toHaveLength(3);
  });

  it('规范化 WebDAV 目录地址', () => {
    const file = buildLocalBackup({
      createdAt,
      entries,
      webdav: {
        url: 'https://dav.example.org/card-master',
        username: ' xll ',
        password: 'secret',
      },
    });
    expect(file.webdav).toEqual({
      url: 'https://dav.example.org/card-master/',
      username: 'xll',
      password: 'secret',
    });
  });

  it('拒绝无效时间戳与非法条目', () => {
    expect(() =>
      buildLocalBackup({ createdAt: -1, entries, webdav: null }),
    ).toThrow('备份时间戳无效');
    expect(() =>
      buildLocalBackup({
        createdAt,
        entries: { 'bad:key': { name: 'x', value: 1 } },
        webdav: null,
      }),
    ).toThrow('同步内容格式无效');
  });

  it('序列化后可以完整解析回来', () => {
    const file = buildLocalBackup({
      createdAt,
      entries,
      webdav: {
        url: 'https://dav.example.org/nova/',
        username: 'xll',
        password: 'secret',
      },
    });
    const text = serializeLocalBackup(file);
    expect(text).toContain(LOCAL_BACKUP_FORMAT);
    const restored = parseLocalBackup(text);
    expect(restored).toEqual(file);
    validateEntries(restored.entries);
  });

  it('非备份文件不会误改本机数据', () => {
    expect(() => parseLocalBackup('   ')).toThrow('备份文件为空');
    expect(() => parseLocalBackup('not json')).toThrow('不是有效的 JSON');
    expect(() => parseLocalBackup(JSON.stringify({ format: 'other' }))).toThrow(
      '不是万象星核的完整备份文件',
    );
    expect(() =>
      parseLocalBackup(
        JSON.stringify({
          format: LOCAL_BACKUP_FORMAT,
          version: 99,
          app: 'x',
          createdAt,
          webdav: null,
          entries: {},
        }),
      ),
    ).toThrow('暂不支持导入');
    expect(() =>
      parseLocalBackup(
        JSON.stringify({
          format: LOCAL_BACKUP_FORMAT,
          version: LOCAL_BACKUP_VERSION,
          app: 'x',
          createdAt,
          entries: {},
        }),
      ),
    ).toThrow('内容不完整');
    expect(() =>
      parseLocalBackup(
        JSON.stringify({
          format: LOCAL_BACKUP_FORMAT,
          version: LOCAL_BACKUP_VERSION,
          app: 'x',
          createdAt,
          webdav: { url: 'ht%3A%2F%2Fbad', username: 'u', password: 'p' },
          entries: {},
        }),
      ),
    ).toThrow('WebDAV 设置不可用');
    expect(() =>
      parseLocalBackup(
        JSON.stringify({
          format: LOCAL_BACKUP_FORMAT,
          version: LOCAL_BACKUP_VERSION,
          app: 'x',
          createdAt,
          webdav: null,
          entries: { nope: { name: 'x', value: 1 } },
        }),
      ),
    ).toThrow('内容校验失败');
  });

  it('统计备份内容与文字摘要', () => {
    const summary = summarizeLocalBackup(
      buildLocalBackup({ createdAt, entries, webdav: null }),
    );
    expect(summary).toEqual({
      createdAt,
      scriptCount: 1,
      settingCount: 2,
      webdavConfigured: false,
    });
    const text = formatLocalBackupSummary(summary);
    expect(text).toContain('脚本 1 张');
    expect(text).toContain('偏好设置 2 项');
    expect(text).toContain('不含 WebDAV 服务器');
  });

  it('文件名带上本地时间且可预测', () => {
    expect(localBackupFilename(createdAt)).toBe(
      'novabay-backup-20260105-0908.json',
    );
    expect(localBackupFilename(Number.NaN)).toMatch(
      /^novabay-backup-\d{8}-\d{4}\.json$/u,
    );
  });
});

describe('备份恢复的范围', () => {
  it('以备份为准，本机多出来的卡牌会被标记成删除', () => {
    const next = expandLocalBackupEntries({
      backup: { 'script:a': { name: 'A', value: { code: 'a' } } },
      current: {
        'script:a': { name: 'A', value: { code: 'local' } },
        'script:b': { name: 'B', value: { code: 'b' } },
        'settings:script-order': { name: '脚本排序', value: [] },
      },
    });
    expect(Object.keys(next).sort()).toEqual(['script:a', 'script:b']);
    expect(next['script:a']?.value).toEqual({ code: 'a' });
    expect(next['script:b']).toBeNull();
  });

  it('本机独有、备份里没有的偏好设置保持原样', () => {
    const next = expandLocalBackupEntries({
      backup: {},
      current: {
        'settings:display': { name: '显示', value: { visible: true } },
      },
    });
    expect(next).toEqual({});
  });

  it('不会改动传进来的备份对象', () => {
    const backup: SyncEntries = {
      'script:a': { name: 'A', value: { code: 'a' } },
    };
    expandLocalBackupEntries({
      backup,
      current: { 'script:z': { name: 'Z', value: { code: 'z' } } },
    });
    expect(backup).toEqual({ 'script:a': { name: 'A', value: { code: 'a' } } });
  });
});
