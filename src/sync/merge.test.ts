import { describe, expect, it } from 'vitest';
import { anchorSyncScope, mergeEntries } from './merge';
import type { SyncEntries } from './model';

const entry = (name: string, value: unknown) => ({
  name,
  value: value as never,
});

describe('sync entry merge', () => {
  it('merges independent changes and propagates deletions', () => {
    const base: SyncEntries = {
      'script:a': entry('A', { code: 'a' }),
      'script:b': entry('B', { code: 'b' }),
    };
    const local: SyncEntries = {
      'script:a': entry('A', { code: 'local' }),
      'script:b': null,
    };
    const remote: SyncEntries = {
      'script:a': entry('A', { code: 'a' }),
      'script:b': entry('B', { code: 'b' }),
      'script:c': entry('C', { code: 'c' }),
    };

    const result = mergeEntries(base, local, remote);

    expect(result.unresolved).toHaveLength(0);
    expect(result.entries['script:a']?.value).toEqual({ code: 'local' });
    expect(result.entries['script:b']).toBeNull();
    expect(result.entries['script:c']?.value).toEqual({ code: 'c' });
  });

  it('requires an explicit choice when both devices changed one item', () => {
    const base: SyncEntries = { 'script:a': entry('A', { code: 'base' }) };
    const local: SyncEntries = { 'script:a': entry('A', { code: 'local' }) };
    const remote: SyncEntries = { 'script:a': entry('A', { code: 'remote' }) };

    const conflict = mergeEntries(base, local, remote);
    expect(conflict.unresolved.map(({ key }) => key)).toEqual(['script:a']);
    expect(
      mergeEntries(base, local, remote, { 'script:a': 'remote' }).entries[
        'script:a'
      ]?.value,
    ).toEqual({ code: 'remote' });
  });
});

describe('选择性同步的上传锚定', () => {
  const excluded = new Set(['script:private']);

  it('本机新增且不参与同步的卡牌不会出现在上传内容里', () => {
    const base: SyncEntries = { 'script:a': entry('A', { code: 'a' }) };
    const local: SyncEntries = {
      'script:a': entry('A', { code: 'a' }),
      'script:private': entry('本机专用', { code: 'p' }),
    };
    const anchored = anchorSyncScope(local, base, excluded);
    expect(Object.hasOwn(anchored, 'script:private')).toBe(false);
    expect(anchored['script:a']?.value).toEqual({ code: 'a' });
  });

  it('本机改过的排除卡牌会退回上次同步的样子，不会被当成新内容', () => {
    const base: SyncEntries = {
      'script:private': entry('本机专用', { code: 'old' }),
    };
    const local: SyncEntries = {
      'script:private': entry('本机专用', { code: 'new' }),
    };
    expect(
      anchorSyncScope(local, base, excluded)['script:private']?.value,
    ).toEqual({ code: 'old' });
  });

  it('本机与远端内容一致时原样保留', () => {
    const base: SyncEntries = {
      'script:private': entry('本机专用', { code: 'same' }),
    };
    const local: SyncEntries = {
      'script:private': entry('本机专用', { code: 'same' }),
    };
    expect(anchorSyncScope(local, base, excluded)).toEqual(local);
  });

  it('本机删掉的排除卡牌不会被读成一次远端删除', () => {
    const base: SyncEntries = {
      'script:private': entry('本机专用', { code: 'old' }),
    };
    expect(
      anchorSyncScope({}, base, excluded)['script:private']?.value,
    ).toEqual({ code: 'old' });
  });

  it('远端已删除的排除卡牌不会被本机复活', () => {
    const base: SyncEntries = { 'script:private': null };
    const local: SyncEntries = {
      'script:private': entry('本机专用', { code: 'x' }),
    };
    expect(
      anchorSyncScope(local, base, excluded)['script:private'],
    ).toBeUndefined();
  });

  it('没有排除项时不做任何拷贝', () => {
    const local: SyncEntries = { 'script:a': entry('A', { code: 'a' }) };
    expect(anchorSyncScope(local, {}, new Set())).toBe(local);
  });

  it('锚定后的结果并入合并时不会把排除卡牌推给远端', () => {
    const base: SyncEntries = { 'script:a': entry('A', { code: 'a' }) };
    const local: SyncEntries = {
      'script:a': entry('A', { code: 'local' }),
      'script:private': entry('本机专用', { code: 'p' }),
    };
    const remote: SyncEntries = { 'script:a': entry('A', { code: 'a' }) };
    const result = mergeEntries(
      base,
      anchorSyncScope(local, base, excluded),
      remote,
    );
    expect(Object.hasOwn(result.entries, 'script:private')).toBe(false);
    expect(result.entries['script:a']?.value).toEqual({ code: 'local' });
    expect(result.unresolved).toHaveLength(0);
  });
});
