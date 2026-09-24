import {
  entryEqual as equal,
  type SyncChange,
  type SyncChoices,
  type SyncEntries,
} from './model';

export function mergeEntries(
  base: SyncEntries,
  local: SyncEntries,
  remote: SyncEntries,
  choices: SyncChoices = {},
) {
  const entries: SyncEntries = {};
  const changes: SyncChange[] = [];
  for (const key of new Set([
    ...Object.keys(base),
    ...Object.keys(local),
    ...Object.keys(remote),
  ])) {
    const before = base[key] ?? null;
    const here = local[key] ?? null;
    const there = remote[key] ?? null;
    const conflict =
      !equal(here, there) && !equal(here, before) && !equal(there, before);
    const choice = choices[key];
    const selected = conflict
      ? choice === 'local'
        ? here
        : there
      : equal(there, before)
        ? here
        : there;
    entries[key] = selected;
    if (conflict || !equal(here, there))
      changes.push({
        key,
        name: here?.name ?? there?.name ?? before?.name ?? key,
        kind: conflict
          ? 'conflict'
          : selected === null
            ? 'delete'
            : here === null || there === null
              ? 'add'
              : 'update',
        local: here,
        remote: there,
      });
  }
  return {
    entries,
    changes,
    unresolved: changes.filter(
      (change) => change.kind === 'conflict' && !choices[change.key],
    ),
  };
}

export function restoreEntries(
  current: SyncEntries,
  history: SyncEntries,
): SyncEntries {
  return Object.fromEntries(
    [...new Set([...Object.keys(current), ...Object.keys(history)])].map(
      (key) => [key, history[key] ?? null],
    ),
  );
}

/**
 * 把不参与同步的卡牌在上行视角里“钉”成远端已知的样子：
 * 远端见过的沿用上次同步的值，远端没见过的直接从本次合并里缺席。
 * 少了这一步，勾选“不同步”会被误读成“本机已删除”，进而把删除推到服务器。
 */
export function anchorSyncScope(
  local: SyncEntries,
  base: SyncEntries,
  excluded: ReadonlySet<string>,
): SyncEntries {
  if (excluded.size === 0) return local;
  const anchored: SyncEntries = { ...local };
  for (const key of excluded) {
    const known = anchored[key];
    const previous = Object.hasOwn(base, key) ? base[key] : undefined;
    if (previous === undefined) {
      if (known === undefined) continue;
      delete anchored[key];
      continue;
    }
    if (equal(known, previous)) continue;
    if (previous === null) delete anchored[key];
    else anchored[key] = previous;
  }
  return anchored;
}
