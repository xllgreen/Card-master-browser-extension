import { describe, expect, it } from 'vitest';
import type { StoredScript } from './script-repository';
import {
  clearScriptTrash,
  normalizeScriptTrash,
  pushScriptTrash,
  removeScriptTrash,
  ScriptTrashStore,
  TRASH_LIMIT,
  TRASH_RETENTION_MS,
  takeScriptTrash,
  trashedScriptName,
  trashRemainingDays,
} from './script-trash';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

function stored(name: string): StoredScript {
  return {
    id: `installed-userscript-${name}`,
    source: {
      code: `// ==UserScript==\n// @name ${name}\n// ==/UserScript==\n`,
      installedAt: 1,
      updatedAt: 2,
    },
    manager: {
      enabled: true,
      checkForUpdates: false,
      userMatches: [],
      userIncludes: [],
      userExcludeMatches: [],
      userExcludes: [],
    },
  };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    async getItem(key: string) {
      return values.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

const empty = { version: 1 as const, records: [] };

describe('回收站', () => {
  it('新删除的卡牌排在最前且同名片牌只留最新', () => {
    let trash = pushScriptTrash(empty, [stored('a')], NOW - DAY);
    trash = pushScriptTrash(trash, [stored('b')], NOW);
    expect(trash.records.map((item) => item.script.id)).toEqual([
      'installed-userscript-b',
      'installed-userscript-a',
    ]);
    trash = pushScriptTrash(trash, [stored('a')], NOW + 1);
    expect(trash.records).toHaveLength(2);
    expect(trash.records[0]?.removedAt).toBe(NOW + 1);
  });

  it('超出上限时丢弃最旧的记录', () => {
    const many = Array.from({ length: TRASH_LIMIT + 10 }, (_item, index) =>
      stored(`card-${index}`),
    );
    const trash = pushScriptTrash(empty, many, NOW);
    expect(trash.records).toHaveLength(TRASH_LIMIT);
    expect(trash.records[0]?.script.id).toBe(
      `installed-userscript-card-${TRASH_LIMIT + 9}`,
    );
  });

  it('读取时清理过期、损坏与未来的记录', () => {
    const trash = {
      version: 1,
      records: [
        { removedAt: NOW - TRASH_RETENTION_MS - 1, script: stored('old') },
        { removedAt: NOW + 1, script: stored('future') },
        { removedAt: NOW - DAY, script: { nope: true } },
        { removedAt: 'x', script: stored('bad-time') },
        { removedAt: NOW - 2 * DAY, script: stored('keep') },
      ],
    };
    expect(
      normalizeScriptTrash(trash, NOW).records.map((item) => item.script.id),
    ).toEqual(['installed-userscript-keep']);
    expect(normalizeScriptTrash(null, NOW)).toEqual(empty);
    expect(normalizeScriptTrash({ records: 'x' }, NOW)).toEqual(empty);
  });

  it('恢复与彻底删除都会移出回收站', () => {
    const trash = pushScriptTrash(empty, [stored('a'), stored('b')], NOW);
    const taken = takeScriptTrash(trash, 'installed-userscript-a');
    expect(taken.trashed?.script.id).toBe('installed-userscript-a');
    expect(taken.trash.records.map((item) => item.script.id)).toEqual([
      'installed-userscript-b',
    ]);
    expect(takeScriptTrash(trash, 'missing').trashed).toBeNull();
    expect(
      removeScriptTrash(trash, 'installed-userscript-b').records,
    ).toHaveLength(1);
    expect(clearScriptTrash()).toEqual(empty);
  });

  it('显示名取自脚本注释，剩余天数按 30 天计算', () => {
    expect(trashedScriptName(stored('视频助手'))).toBe('视频助手');
    expect(
      trashedScriptName({
        ...stored('x'),
        source: { code: '', installedAt: 1, updatedAt: 1 },
        id: 'short-id',
      }),
    ).toBe('short-id');
    expect(trashRemainingDays(NOW, NOW)).toBe(30);
    expect(trashRemainingDays(NOW - 29 * DAY, NOW)).toBe(1);
    expect(trashRemainingDays(NOW - 40 * DAY, NOW)).toBe(0);
  });

  it('存储层可以记录、列出、恢复与清空', async () => {
    const storage = memoryStorage();
    const store = new ScriptTrashStore(
      storage,
      'card-master.trash.v1',
      () => NOW,
    );
    expect(await store.list()).toEqual([]);
    await store.record([stored('a'), stored('b')]);
    expect((await store.list()).map((item) => item.script.id)).toEqual([
      'installed-userscript-b',
      'installed-userscript-a',
    ]);
    expect(await store.restore('installed-userscript-a')).toMatchObject({
      id: 'installed-userscript-a',
    });
    expect(await store.restore('installed-userscript-a')).toBeNull();
    expect(await store.discard('installed-userscript-b')).toBe(true);
    await store.record([stored('c')]);
    expect(await store.clear()).toBe(1);
    expect(await store.list()).toEqual([]);
  });

  it('损坏的存储内容不会让回收站打不开', async () => {
    const storage = memoryStorage({ 'card-master.trash.v1': '{not json' });
    const store = new ScriptTrashStore(
      storage,
      'card-master.trash.v1',
      () => NOW,
    );
    expect(await store.read()).toEqual(empty);
    await store.record([stored('a')]);
    expect((await store.list()).map((item) => item.script.id)).toEqual([
      'installed-userscript-a',
    ]);
  });
});
