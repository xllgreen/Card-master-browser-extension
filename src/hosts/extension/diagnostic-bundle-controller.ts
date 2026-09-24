import {
  buildDiagnosticBundle,
  type DiagnosticBundleController,
  parseRuntimeDiagnosticRecords,
} from '../../diagnostics/bundle';
import type { SyncController } from '../../sync/model';
import type { ScriptRepository } from '../../userscript/application/script-repository';
import type { UserscriptSettingsController } from '../../userscript/application/settings';
import type { InstalledUserscript } from '../../userscript/domain/types';
import type { ExtensionApi } from './api';
import { extensionDiagnostics } from './diagnostics';
import { extensionTarget } from './platform';

const BUNDLE_NOTES = [
  '诊断包不含脚本源码、GM 存储内容、API 密钥与 WebDAV 凭据。',
  '运行时错误只保留最近 50 条，浏览器重启后会自动清空。',
  '反馈问题时请补充发生时间、所在网站与操作步骤。',
];

export type DiagnosticBundleSources = {
  repository: ScriptRepository;
  userscriptSettings: UserscriptSettingsController;
  sync?: SyncController;
};

type SessionArea = {
  get: (keys: null) => Promise<Record<string, unknown>>;
};

function read<T>(evaluate: () => T, fallback: T): T {
  try {
    return evaluate();
  } catch {
    return fallback;
  }
}

function mediaMatches(query: string) {
  return read(() => globalThis.matchMedia(query).matches, false);
}

function environmentDetails() {
  const scope = globalThis as typeof globalThis & {
    location?: { origin?: string; pathname?: string };
    top?: typeof globalThis;
    innerWidth?: number;
    innerHeight?: number;
    devicePixelRatio?: number;
  };
  return {
    userAgent: read(() => globalThis.navigator.userAgent, ''),
    language: read(() => globalThis.navigator.language, ''),
    online: read(() => globalThis.navigator.onLine, true),
    timezone: read(() => Intl.DateTimeFormat().resolvedOptions().timeZone, ''),
    page: read(
      () => `${scope.location?.origin ?? ''}${scope.location?.pathname ?? ''}`,
      '',
    ),
    topFrame: read(() => scope.top === globalThis, true),
    viewport: read(
      () => `${scope.innerWidth ?? 0}x${scope.innerHeight ?? 0}`,
      '0x0',
    ),
    devicePixelRatio: read(() => scope.devicePixelRatio ?? 1, 1),
    reducedMotion: mediaMatches('(prefers-reduced-motion: reduce)'),
    darkScheme: mediaMatches('(prefers-color-scheme: dark)'),
  };
}

async function runtimeDiagnostics(api: ExtensionApi) {
  const session = (api.storage as unknown as { session?: SessionArea }).session;
  if (!session || typeof session.get !== 'function') return [];
  try {
    return parseRuntimeDiagnosticRecords(await session.get(null));
  } catch (error) {
    extensionDiagnostics.warn(
      'diagnostic-bundle',
      'runtime-diagnostics-unavailable',
      error,
    );
    return [];
  }
}

function manifestVersion(api: ExtensionApi) {
  const runtime = api.runtime as typeof api.runtime & {
    getManifest?: () => { version?: string };
  };
  return read(() => runtime.getManifest?.()?.version ?? '', '');
}

function syncDetails(snapshot: Awaited<ReturnType<SyncController['request']>>) {
  return {
    connected: snapshot.connected,
    status: snapshot.status,
    lastSyncedAt: snapshot.lastSyncedAt,
    remoteVersionCount: snapshot.remoteVersionCount,
    timelineEntries: snapshot.timeline.length,
    pendingConflicts: snapshot.conflicts.length,
  };
}

/**
 * 汇总“装了哪些卡牌、当前运行到哪一步、报了什么错”，生成可直接发送的诊断包。
 *
 * 只读取元信息与运行时快照，不读取脚本源码、GM 存储与任何凭据。
 */
export class ExtensionDiagnosticBundleController
  implements DiagnosticBundleController
{
  constructor(
    private readonly api: ExtensionApi,
    private readonly sources: DiagnosticBundleSources,
  ) {}

  async collect(): Promise<string> {
    const { repository, userscriptSettings, sync } = this.sources;
    const emptyScripts = (): InstalledUserscript[] => [];
    const [scripts, settings, diagnostics, snapshot] = await Promise.all([
      repository.list().catch(emptyScripts),
      readPromise(userscriptSettings.read(), null),
      runtimeDiagnostics(this.api),
      sync ? readPromise(sync.request({ type: 'read' }), null) : null,
    ]);
    return buildDiagnosticBundle({
      generatedAt: Date.now(),
      app: {
        name: '万象星核',
        englishName: 'NovaBay',
        buildTarget: extensionTarget(),
        extensionId: read(() => this.api.runtime.id ?? '', ''),
        version: manifestVersion(this.api),
      },
      environment: environmentDetails(),
      preferences: settings,
      scripts,
      runtimeDiagnostics: diagnostics,
      sync: snapshot ? syncDetails(snapshot) : null,
      notes: BUNDLE_NOTES,
    });
  }
}

function readPromise<T>(promise: Promise<T>, fallback: T): Promise<T | null> {
  return promise.catch(() => fallback);
}
