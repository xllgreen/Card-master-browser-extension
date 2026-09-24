import { describe, expect, it } from 'vitest';
import {
  RUNTIME_DIAGNOSTIC_KEY_PREFIX,
  runtimeDiagnosticStorageKey,
} from '../../diagnostics/bundle';
import { ExtensionDiagnosticBundleController } from './diagnostic-bundle-controller';

const installedScript = {
  kind: 'userscript',
  id: 'script-1',
  source: {
    code: "const apiKey = 'sk-live-abcdef'; console.log('hidden body');",
    origin: 'https://example.test/clean.user.js',
    installedAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_500,
  },
  metadata: {
    name: '页面清理助手',
    namespace: 'tests',
    version: '1.2.0',
    matches: ['https://example.test/*'],
    includes: [],
    grants: ['GM_setValue', 'GM_addStyle'],
    runAt: 'document-end',
  },
  manager: {
    enabled: true,
    checkForUpdates: false,
    userMatches: [],
    userIncludes: [],
  },
  runtime: {
    tabId: 7,
    frameId: 0,
    instanceId: 'instance-1',
    status: 'error',
    commands: [],
    error: 'ReferenceError: helper is not defined',
    pendingRefresh: false,
  },
} as never;

function controllerWith(
  session: Record<string, unknown> = {},
  overrides: Record<string, unknown> = {},
) {
  const api = {
    runtime: {
      id: 'abcdefghijklmnop',
      getManifest: () => ({ version: '2.4.0' }),
    },
    storage: { session: { get: async () => session } },
  } as never;
  const sources = {
    repository: { list: async () => [installedScript] },
    userscriptSettings: {
      read: async () => ({ theme: 'system', apiKey: 'sk-live-abcdef' }),
    },
    sync: {
      request: async () => ({
        connected: true,
        status: 'synced',
        lastSyncedAt: 1_700_000_000_000,
        remoteVersionCount: 3,
        timeline: [
          { id: 'v1', at: 1, device: 'dev-1', head: true, changes: 2 },
        ],
        conflicts: [{ key: 'script:a', name: '页面清理助手', alternatives: 2 }],
      }),
    },
    ...overrides,
  } as never;
  return new ExtensionDiagnosticBundleController(api, sources);
}

describe('ExtensionDiagnosticBundleController', () => {
  it('bundles scripts, preferences, runtime errors and the sync summary', async () => {
    const validKey = runtimeDiagnosticStorageKey('script-1', 7, 0);
    const forgedKey = `${RUNTIME_DIAGNOSTIC_KEY_PREFIX}:forged:7:0`;
    const text = await controllerWith({
      [forgedKey]: {
        scriptId: 'script-1',
        tabId: 7,
        frameId: 0,
        error: '伪造记录不应出现',
        updatedAt: 1,
      },
      [validKey]: {
        scriptId: 'script-1',
        tabId: 7,
        frameId: 0,
        error: 'ReferenceError: helper is not defined',
        commands: [
          { id: 'c1', title: '重新载入', autoClose: true, order: 1 },
          { id: 'c2', title: 'bad-shape' },
        ],
        updatedAt: 2,
      },
    } as never).collect();
    const bundle = JSON.parse(text) as Record<string, unknown>;
    const app = bundle.app as Record<string, unknown>;
    const scripts = bundle.scripts as Record<string, unknown>[];
    const runtime = bundle.runtimeDiagnostics as Record<string, unknown>[];
    const sync = bundle.sync as Record<string, unknown>;

    expect(bundle.format).toBe('novabay-diagnostics');
    expect(app.name).toBe('万象星核');
    expect(app.englishName).toBe('NovaBay');
    expect(app.version).toBe('2.4.0');
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toMatchObject({
      id: 'script-1',
      name: '页面清理助手',
      version: '1.2.0',
      enabled: true,
      grantCount: 2,
      ruleCount: 1,
      codeLength: 60,
    });
    expect(runtime).toHaveLength(1);
    expect(runtime[0]).toMatchObject({
      scriptId: 'script-1',
      tabId: 7,
      commands: ['重新载入'],
    });
    expect(sync).toMatchObject({
      connected: true,
      status: 'synced',
      remoteVersionCount: 3,
      timelineEntries: 1,
      pendingConflicts: 1,
    });
    expect(text).not.toContain('sk-live-abcdef');
    expect(text).not.toContain('hidden body');
    expect(text).not.toContain('伪造记录不应出现');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('still returns a readable bundle when every source fails', async () => {
    const failing = {
      repository: {
        list: async () => {
          throw new Error('storage unavailable');
        },
      },
      userscriptSettings: {
        read: async () => {
          throw new Error('settings unavailable');
        },
      },
      sync: {
        request: async () => {
          throw new Error('sync unavailable');
        },
      },
    };
    const api = { runtime: { id: 'abcdefghijklmnop' }, storage: {} } as never;
    const text = await new ExtensionDiagnosticBundleController(
      api,
      failing as never,
    ).collect();
    const bundle = JSON.parse(text) as Record<string, unknown>;

    expect(bundle.scripts).toEqual([]);
    expect(bundle.preferences).toBeNull();
    expect(bundle.sync).toBeNull();
    expect(bundle.runtimeDiagnostics).toEqual([]);
    expect((bundle.notes as unknown[]).length).toBeGreaterThan(0);
  });
});
