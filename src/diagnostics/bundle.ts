/**
 * 脚本诊断包：把「装了哪些卡牌、当前运行状态、报了什么错」整理成一份可直接发送的 JSON。
 *
 * 这里只做纯数据整理，不接触扩展 API，也不包含脚本源码、密钥与同步凭据。
 */
import type {
  InstalledUserscript,
  RuntimeMenuCommand,
} from '../userscript/domain/types';

export const RUNTIME_DIAGNOSTIC_KEY_PREFIX = 'userscript-runtime-diagnostic';
export const DIAGNOSTIC_BUNDLE_FORMAT = 'novabay-diagnostics';
export const DIAGNOSTIC_BUNDLE_VERSION = 1;

const MAX_RUNTIME_DIAGNOSTICS = 50;
const MAX_SCRIPTS = 200;
const MAX_STRING_LENGTH = 1_500;
const MAX_ARRAY_ITEMS = 100;
const MAX_DEPTH = 6;
const MAX_COMMAND_ITEMS = 30;
const REDACTED_VALUE = '[已隐藏]';
const DEPTH_LIMIT_VALUE = '[层级过深，已省略]';
const SENSITIVE_KEY =
  /api[-_]?key|token|secret|pass(?:word|wd)|authorization|credential|cookie|session[-_]?id|access[-_]?key/i;

export interface DiagnosticBundleController {
  collect(): Promise<string>;
}

export type RuntimeDiagnosticRecord = {
  scriptId: string;
  tabId: number;
  frameId: number;
  documentId: string;
  error: string;
  commands: RuntimeMenuCommand[];
  updatedAt: number;
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function finiteTime(value: number) {
  return Number.isFinite(value) ? new Date(value).toISOString() : '';
}

export function runtimeDiagnosticStorageKey(
  scriptId: string,
  tabId: number,
  frameId: number,
) {
  return `${RUNTIME_DIAGNOSTIC_KEY_PREFIX}:${encodeURIComponent(scriptId)}:${tabId}:${frameId}`;
}

function boundedText(value: string) {
  if (value.startsWith('data:') || value.startsWith('blob:')) {
    return `[内嵌资源 ${(value.length / 1024).toFixed(1)} KB，已省略]`;
  }
  if (value.length <= MAX_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_STRING_LENGTH)}…[已截断，共 ${value.length} 字符]`;
}

function menuCommands(value: unknown): RuntimeMenuCommand[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((command): command is RuntimeMenuCommand => {
      if (!record(command)) return false;
      return (
        typeof command.id === 'string' &&
        typeof command.title === 'string' &&
        (command.description === undefined ||
          typeof command.description === 'string') &&
        typeof command.autoClose === 'boolean' &&
        typeof command.order === 'number'
      );
    })
    .slice(0, MAX_COMMAND_ITEMS);
}

/**
 * 读取扩展会话存储里的脚本运行时快照，按时间倒序返回可诊断记录。
 *
 * 键名必须与内容自身声明的脚本、标签页、帧号一致，避免被伪造的存储项指认其他卡牌。
 */
export function parseRuntimeDiagnosticRecords(
  stored: Record<string, unknown>,
): RuntimeDiagnosticRecord[] {
  const parsed: RuntimeDiagnosticRecord[] = [];
  for (const [key, value] of Object.entries(stored)) {
    if (!record(value)) continue;
    const { scriptId, tabId, frameId, error, updatedAt, documentId } = value;
    if (
      typeof scriptId !== 'string' ||
      !scriptId ||
      typeof tabId !== 'number' ||
      !Number.isSafeInteger(tabId) ||
      typeof frameId !== 'number' ||
      !Number.isSafeInteger(frameId) ||
      typeof error !== 'string' ||
      typeof updatedAt !== 'number' ||
      !Number.isFinite(updatedAt) ||
      runtimeDiagnosticStorageKey(scriptId, tabId, frameId) !== key
    ) {
      continue;
    }
    if (documentId !== undefined && typeof documentId !== 'string') continue;
    parsed.push({
      scriptId,
      tabId,
      frameId,
      documentId: typeof documentId === 'string' ? documentId : '',
      error: boundedText(error),
      commands: menuCommands(value.commands),
      updatedAt,
    });
  }
  return parsed
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_RUNTIME_DIAGNOSTICS);
}

export function redactDiagnosticValue(value: unknown, depth = 0): unknown {
  if (depth >= MAX_DEPTH) return DEPTH_LIMIT_VALUE;
  if (typeof value === 'string') return boundedText(value);
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => redactDiagnosticValue(item, depth + 1));
  }
  if (record(value)) {
    const safe: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      safe[key] = SENSITIVE_KEY.test(key)
        ? REDACTED_VALUE
        : redactDiagnosticValue(item, depth + 1);
    }
    return safe;
  }
  if (typeof value === 'bigint') return value.toString();
  if (
    value === null ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  if (typeof value === 'number') return null;
  return undefined;
}

export type DiagnosticScriptSummary = {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  checkForUpdates: boolean;
  runAt: string;
  grantCount: number;
  ruleCount: number;
  codeLength: number;
  origin: string;
  installedAt: number;
  updatedAt: number;
  runtime: {
    status: string;
    error: string;
    commandCount: number;
    pendingRefresh: boolean;
  };
};

/** 只保留排障需要的卡牌元信息，脚本源码仅记录长度。 */
export function summarizeDiagnosticScripts(
  scripts: readonly InstalledUserscript[],
): DiagnosticScriptSummary[] {
  return scripts.slice(0, MAX_SCRIPTS).map((script) => {
    const { metadata, manager, runtime, source } = script;
    return {
      id: script.id,
      name: metadata.name || '未命名卡牌',
      version: metadata.version || '0.0.0',
      enabled: manager.enabled,
      checkForUpdates: manager.checkForUpdates,
      runAt: metadata.runAt,
      grantCount: metadata.grants.length,
      ruleCount:
        metadata.matches.length +
        metadata.includes.length +
        manager.userMatches.length +
        manager.userIncludes.length,
      codeLength: source.code.length,
      origin: source.origin ?? '',
      installedAt: source.installedAt,
      updatedAt: source.updatedAt,
      runtime: {
        status: runtime.status,
        error: runtime.error ? boundedText(runtime.error) : '',
        commandCount: runtime.commands.length,
        pendingRefresh: runtime.pendingRefresh,
      },
    };
  });
}

export type DiagnosticBundleInput = {
  generatedAt: number;
  app: Readonly<Record<string, unknown>>;
  environment: Readonly<Record<string, unknown>>;
  preferences?: unknown;
  scripts?: readonly InstalledUserscript[];
  runtimeDiagnostics?: readonly RuntimeDiagnosticRecord[];
  sync?: Readonly<Record<string, unknown>> | null;
  notes?: readonly string[];
};

export function buildDiagnosticBundle(input: DiagnosticBundleInput): string {
  const bundle = {
    format: DIAGNOSTIC_BUNDLE_FORMAT,
    version: DIAGNOSTIC_BUNDLE_VERSION,
    generatedAt: finiteTime(input.generatedAt),
    app: input.app,
    environment: input.environment,
    preferences: input.preferences ?? null,
    scripts: summarizeDiagnosticScripts(input.scripts ?? []),
    runtimeDiagnostics: (input.runtimeDiagnostics ?? []).map((item) => ({
      scriptId: item.scriptId,
      tabId: item.tabId,
      frameId: item.frameId,
      documentId: item.documentId,
      at: finiteTime(item.updatedAt),
      error: item.error,
      commands: item.commands.map((command) => command.title),
    })),
    sync: input.sync ?? null,
    notes: [...(input.notes ?? [])],
  };
  return `${JSON.stringify(redactDiagnosticValue(bundle), null, 2)}\n`;
}

export function diagnosticBundleFilename(at: number) {
  const date = new Date(Number.isFinite(at) ? at : Date.now());
  const pad = (value: number) => `${value}`.padStart(2, '0');
  return `novabay-diagnostics-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.json`;
}
