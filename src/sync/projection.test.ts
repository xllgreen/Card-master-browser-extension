import { describe, expect, it, vi } from 'vitest';
import {
  hydrateScript,
  StorageScriptRepository,
  storedScript,
} from '../userscript/application/script-repository';
import { equal, type Json, type SyncEntries } from './model';
import {
  applySyncScriptOrder,
  type SyncPortableAdapter,
  SyncProjection,
  scriptParticipatesInSync,
  syncScriptKey,
} from './projection';

function script(name: string, code = 'console.log(1)', syncEnabled?: boolean) {
  return hydrateScript({
    id: `local-${name}`,
    source: {
      code: `// ==UserScript==\n// @name ${name}\n// @namespace tests\n// @version 1\n// @match https://example.com/*\n// @grant none\n// ==/UserScript==\n${code}`,
      installedAt: 100,
      updatedAt: 100,
    },
    manager: {
      enabled: true,
      checkForUpdates: true,
      userMatches: [],
      userIncludes: [],
      userExcludes: [],
      userExcludeMatches: [],
      ...(syncEnabled === undefined ? {} : { syncEnabled }),
    },
  });
}

function harness() {
  const values = new Map<string, string>();
  const repo = new StorageScriptRepository(
    {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
    },
    'library',
    [script('a')],
  );
  let config: Json = { visible: true };
  const adapter: SyncPortableAdapter = {
    key: 'display',
    name: '显示',
    read: async () => config,
    validate: (value) => {
      if (
        !value ||
        typeof value !== 'object' ||
        !('visible' in value) ||
        typeof value.visible !== 'boolean'
      )
        throw new Error('invalid display');
    },
    apply: async (value, expected) => {
      if (!equal(config, expected)) return false;
      config = value;
      return true;
    },
  };
  const commit = vi.fn(async () => undefined);
  const projection = new SyncProjection(
    repo,
    commit,
    [adapter],
    async () => undefined,
  );
  return {
    repo,
    commit,
    projection,
    config: () => config,
    editConfig: (value: Json) => {
      config = value;
    },
  };
}

describe('sync projection', () => {
  it('applies remote scripts and settings through live services without replacing installation identity', async () => {
    const test = harness();
    const before = await test.projection.readEntries();
    const incoming = script('a', 'console.log(2)');
    const stored = storedScript(incoming);
    const { id: _id, ...value } = stored;
    const next: SyncEntries = {
      ...before,
      [syncScriptKey(incoming)]: { name: 'a', value },
      'settings:display': { name: '显示', value: { visible: false } },
    };
    const applied = await test.projection.applyEntries(next, before);
    expect(applied.skipped.size).toBe(0);
    expect((await test.repo.list())[0]).toMatchObject({
      id: 'local-a',
      source: { installedAt: 100, code: incoming.source.code },
    });
    expect(test.config()).toEqual({ visible: false });
    expect(test.commit).toHaveBeenCalledOnce();
  });

  it('retains edits and newly installed scripts that occur while the network is in flight', async () => {
    const test = harness();
    const before = await test.projection.readEntries();
    const a = script('a');
    const b = script('b');
    await test.repo.upsert(b);
    await test.repo.upsert(script('a', 'console.log("newest")'));
    test.editConfig({ visible: false });
    const result = await test.projection.applyEntries(
      { ...before, [syncScriptKey(a)]: null },
      before,
    );
    expect(result.skipped.has(syncScriptKey(a))).toBe(true);
    expect(await test.repo.list()).toHaveLength(2);
    expect((await test.repo.get('local-a'))?.source.code).toContain('newest');
    expect(test.config()).toEqual({ visible: false });
  });

  it('does not repeatedly rewrite timestamps, register scripts or discard custom artwork', async () => {
    const test = harness();
    const a = script('a');
    a.presentation = {
      accent: '#aabbcc',
      media: { kind: 'image', image: 'data:image/webp;base64,YWJjZA==' },
    };
    await test.repo.upsert(a);
    const before = await test.projection.readEntries();
    expect(JSON.stringify(before)).toContain('data:image/webp;base64,YWJjZA==');
    await test.projection.applyEntries(before, before);
    await test.projection.applyEntries(before, before);
    expect(test.commit).not.toHaveBeenCalled();
    expect((await test.repo.list())[0].source.updatedAt).toBe(100);
  });

  it('rejects invalid remote fields before mutating any domain', async () => {
    const test = harness();
    const before = await test.projection.readEntries();
    await expect(
      test.projection.applyEntries(
        { ...before, 'script:invalid': { name: 'x', value: {} } },
        before,
      ),
    ).rejects.toThrow();
    await expect(
      test.projection.applyEntries(
        {
          ...before,
          'settings:display': { name: '显示', value: { visible: 'invalid' } },
        },
        before,
      ),
    ).rejects.toThrow();
    expect(await test.projection.readEntries()).toEqual(before);
  });
});

describe('选择性同步', () => {
  it('默认参与同步，关掉开关的卡牌只留在本机', async () => {
    const test = harness();
    const localOnly = script('local-only', 'console.log(1)', false);
    await test.repo.upsert(localOnly);
    expect(scriptParticipatesInSync(script('a'))).toBe(true);
    expect(scriptParticipatesInSync(localOnly)).toBe(false);
    const syncEntries = await test.projection.readEntries();
    expect(Object.hasOwn(syncEntries, syncScriptKey(localOnly))).toBe(false);
    expect(syncEntries['settings:script-order']?.value).toEqual(
      expect.arrayContaining([syncScriptKey(localOnly)]),
    );
    const fullEntries = await test.projection.readEntries('full');
    expect(fullEntries[syncScriptKey(localOnly)]?.value).toMatchObject({
      manager: { syncEnabled: false },
    });
    expect(await test.projection.excludedScriptKeys()).toEqual(
      new Set([syncScriptKey(localOnly)]),
    );
  });

  it('远端改动与远端删除都不会碰到只留在本机的卡牌', async () => {
    const test = harness();
    const localOnly = script('local-only', 'console.log(1)', false);
    await test.repo.upsert(localOnly);
    const key = syncScriptKey(localOnly);
    const before = await test.projection.readEntries();
    const remote = script('local-only', 'console.log(999)', false);
    const { id: _id, ...value } = storedScript(remote);
    const changed = await test.projection.applyEntries(
      { ...before, [key]: { name: 'local-only', value } },
      before,
    );
    expect(changed.pinned.has(key)).toBe(true);
    expect((await test.repo.get('local-local-only'))?.source.code).toContain(
      'console.log(1)',
    );
    const deleted = await test.projection.applyEntries(
      { ...before, [key]: null },
      before,
    );
    expect(deleted.pinned.has(key)).toBe(true);
    expect(await test.repo.get('local-local-only')).not.toBeNull();
    expect(test.commit).not.toHaveBeenCalled();
  });

  it('本机完整备份导入不受同步开关限制', async () => {
    const test = harness();
    const localOnly = script('local-only', 'console.log(1)', false);
    await test.repo.upsert(localOnly);
    const full = await test.projection.readEntries('full');
    const applied = await test.projection.applyEntries(
      { ...full, [syncScriptKey(localOnly)]: null },
      full,
      'full',
    );
    expect(applied.pinned.size).toBe(0);
    expect(applied.skipped.size).toBe(0);
    expect(await test.repo.get('local-local-only')).toBeNull();
  });

  it('只留在本机的卡牌在远端排序后仍待在原来的位置', () => {
    const a = script('a');
    const localOnly = script('local-only', 'console.log(1)', false);
    const c = script('c');
    const current = [a, localOnly, c];
    const result = applySyncScriptOrder(
      current,
      current,
      [syncScriptKey(c), syncScriptKey(a)],
      new Set([syncScriptKey(localOnly)]),
    );
    expect(result.map((item) => item.metadata.name)).toEqual([
      'c',
      'local-only',
      'a',
    ]);
  });
});
