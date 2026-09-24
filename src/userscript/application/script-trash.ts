import {
  hydrateScript,
  isStoredScript,
  type StoredScript,
  type StringStorage,
} from './script-repository';

export const SCRIPT_TRASH_STORAGE_KEY = 'card-master.trash.v1';
export const TRASH_RETENTION_DAYS = 30;
export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
export const TRASH_LIMIT = 30;

export type TrashedScript = {
  removedAt: number;
  script: StoredScript;
};

export type ScriptTrash = {
  version: 1;
  records: TrashedScript[];
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/** 只读元数据注释里的名字，避免为了一行列表去解析整份脚本源码。 */
export function trashedScriptName(script: StoredScript) {
  const name = /\/\/\s*@name(?:display)?\s+(.+)$/mu.exec(
    script.source.code,
  )?.[1];
  return (
    (name ?? '').trim().slice(0, 80) || script.id.slice(0, 24) || '未命名脚本'
  );
}

export function emptyScriptTrash(): ScriptTrash {
  return { version: 1, records: [] };
}

export function normalizeScriptTrash(
  value: unknown,
  now: number = Date.now(),
): ScriptTrash {
  if (!record(value) || !Array.isArray(value.records))
    return emptyScriptTrash();
  const records: TrashedScript[] = [];
  for (const candidate of value.records) {
    if (!record(candidate)) continue;
    const { removedAt, script } = candidate;
    if (
      typeof removedAt !== 'number' ||
      !Number.isFinite(removedAt) ||
      removedAt > now
    )
      continue;
    if (now - removedAt > TRASH_RETENTION_MS) continue;
    if (!isStoredScript(script)) continue;
    if (records.some((item) => item.script.id === script.id)) continue;
    records.push({ removedAt, script });
  }
  records.sort((left, right) => right.removedAt - left.removedAt);
  return { version: 1, records: records.slice(0, TRASH_LIMIT) };
}

export function readScriptTrash(value: unknown, now: number = Date.now()) {
  return normalizeScriptTrash(value, now);
}

export function pushScriptTrash(
  trash: ScriptTrash,
  scripts: readonly StoredScript[],
  now: number = Date.now(),
): ScriptTrash {
  if (scripts.length === 0) return trash;
  const records = trash.records.filter(
    (item) => !scripts.some((script) => script.id === item.script.id),
  );
  for (const script of scripts) {
    records.unshift({ removedAt: now, script: structuredClone(script) });
  }
  return { version: 1, records: records.slice(0, TRASH_LIMIT) };
}

export function takeScriptTrash(
  trash: ScriptTrash,
  scriptId: string,
): { trash: ScriptTrash; trashed: TrashedScript | null } {
  const trashed =
    trash.records.find((item) => item.script.id === scriptId) ?? null;
  if (!trashed) return { trash, trashed: null };
  return {
    trash: {
      version: 1,
      records: trash.records.filter((item) => item.script.id !== scriptId),
    },
    trashed,
  };
}

export function clearScriptTrash(): ScriptTrash {
  return emptyScriptTrash();
}

export function removeScriptTrash(trash: ScriptTrash, scriptId: string) {
  return takeScriptTrash(trash, scriptId).trash;
}

export function trashRemainingDays(
  removedAt: number,
  now: number = Date.now(),
) {
  const elapsed = Math.max(0, now - removedAt);
  return Math.max(
    0,
    Math.ceil((TRASH_RETENTION_MS - elapsed) / (24 * 60 * 60 * 1000)),
  );
}

export class ScriptTrashStore {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly storage: StringStorage,
    private readonly key: string = SCRIPT_TRASH_STORAGE_KEY,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async read(): Promise<ScriptTrash> {
    const stored = await this.storage.getItem(this.key);
    if (typeof stored !== 'string' || !stored) return emptyScriptTrash();
    try {
      return normalizeScriptTrash(JSON.parse(stored), this.now());
    } catch {
      return emptyScriptTrash();
    }
  }

  private async write(trash: ScriptTrash) {
    await this.storage.setItem(this.key, JSON.stringify(trash));
    return trash;
  }

  private mutate<Result>(
    operate: (
      trash: ScriptTrash,
      now: number,
    ) => {
      trash: ScriptTrash;
      result: Result;
    },
  ): Promise<Result> {
    const pending = this.queue.then(async () => {
      const next = operate(await this.read(), this.now());
      await this.write(next.trash);
      return next.result;
    });
    this.queue = pending.catch(() => undefined);
    return pending;
  }

  list(): Promise<TrashedScript[]> {
    return this.read().then((trash) => trash.records);
  }

  record(scripts: readonly StoredScript[]): Promise<ScriptTrash> {
    if (scripts.length === 0) return this.read();
    return this.mutate((trash, now) => {
      const next = pushScriptTrash(trash, scripts, now);
      return { trash: next, result: next };
    });
  }

  /** 取出并移除：恢复一次即从回收站消失，避免重复恢复。 */
  restore(scriptId: string): Promise<StoredScript | null> {
    return this.mutate((trash) => {
      const { trash: next, trashed } = takeScriptTrash(trash, scriptId);
      return { trash: next, result: trashed?.script ?? null };
    });
  }

  discard(scriptId: string): Promise<boolean> {
    return this.mutate((trash) => {
      const { trash: next, trashed } = takeScriptTrash(trash, scriptId);
      return { trash: next, result: trashed !== null };
    });
  }

  clear(): Promise<number> {
    return this.mutate((trash) => ({
      trash: emptyScriptTrash(),
      result: trash.records.length,
    }));
  }
}

/** 回收站里的脚本必须仍然可以水合成卡牌，否则不显示。 */
export function trashedScripts(trash: ScriptTrash): StoredScript[] {
  return trash.records.flatMap((item) => {
    try {
      hydrateScript(item.script);
      return [item.script];
    } catch {
      return [];
    }
  });
}
export type ScriptTrashListItem = {
  scriptId: string;
  name: string;
  removedAt: number;
  remainingDays: number;
};

export interface ScriptTrashController {
  list(): Promise<ScriptTrashListItem[]>;
  restore(scriptId: string): Promise<void>;
  discard(scriptId: string): Promise<void>;
  clear(): Promise<number>;
}
