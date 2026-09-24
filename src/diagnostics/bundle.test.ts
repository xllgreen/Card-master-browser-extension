import { describe, expect, it } from 'vitest';
import type { InstalledUserscript } from '../userscript/domain/types';
import {
  buildDiagnosticBundle,
  diagnosticBundleFilename,
  parseRuntimeDiagnosticRecords,
  redactDiagnosticValue,
  runtimeDiagnosticStorageKey,
  summarizeDiagnosticScripts,
} from './bundle';

function script(
  overrides: Partial<InstalledUserscript> = {},
): InstalledUserscript {
  return {
    kind: 'userscript',
    id: 'script-1',
    source: {
      code: `// ==UserScript==
// @name 页面清理助手
// ==/UserScript==
const apiKey = 'sk-secret-value';`,
      origin: 'https://example.test/clean.user.js',
      installedAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_500,
    },
    metadata: {
      name: '页面清理助手',
      namespace: 'tests',
      version: '1.2.0',
      description: '',
      author: '',
      contributors: [],
      copyright: '',
      license: '',
      matches: ['https://example.test/*'],
      includes: [],
      excludeMatches: [],
      excludes: [],
      grants: ['GM_setValue'],
      requires: [],
      resources: {},
      connects: [],
      antifeatures: [],
      compatible: [],
      incompatible: [],
      tags: [],
      runAt: 'document-end',
      noframes: false,
      localized: {},
      entries: [],
      unknown: [],
      raw: {},
    },
    manager: {
      enabled: true,
      checkForUpdates: false,
      userMatches: [],
      userIncludes: [],
      userExcludeMatches: [],
      userExcludes: [],
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
    ...overrides,
  } as InstalledUserscript;
}

function diagnostic(overrides: Record<string, unknown> = {}) {
  const merged = {
    scriptId: 'script-1',
    tabId: 7,
    frameId: 0,
    documentId: 'doc-1',
    error: 'ReferenceError: helper is not defined',
    commands: [
      { id: 'c1', title: '重新载入', autoClose: true, order: 1 },
      { id: 'c2', title: 'bad-shape' },
    ],
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
  const scriptId = String(merged.scriptId);
  return {
    key: runtimeDiagnosticStorageKey(
      scriptId,
      Number(merged.tabId),
      Number(merged.frameId),
    ),
    value: merged,
  };
}

describe('parseRuntimeDiagnosticRecords', () => {
  it('按时间倒序返回可诊断记录，并丢弃损坏项', () => {
    const older = diagnostic();
    const newer = diagnostic({ tabId: 8, updatedAt: 1_700_000_000_900 });
    const stolen = diagnostic();
    const stored = {
      [older.key]: older.value,
      [newer.key]: newer.value,
      [runtimeDiagnosticStorageKey('attacker', 1, 0)]: stolen.value,
      'userscript-runtime-diagnostic:broken': { scriptId: 'broken' },
      'card-master.values:script-1': { token: 'raw' },
    };
    const records = parseRuntimeDiagnosticRecords(stored);
    expect(records.map((item) => item.updatedAt)).toEqual([
      newer.value.updatedAt,
      older.value.updatedAt,
    ]);
    expect(records[0]?.commands).toHaveLength(1);
    expect(records[0]?.documentId).toBe('doc-1');
  });

  it('数量上限为 50 条，并按最新时间保留', () => {
    const stored: Record<string, unknown> = {};
    for (let index = 0; index < 60; index++) {
      const item = diagnostic({
        scriptId: `s${index}`,
        tabId: index,
        updatedAt: index,
      });
      stored[item.key] = item.value;
    }
    const records = parseRuntimeDiagnosticRecords(stored);
    expect(records).toHaveLength(50);
    expect(records[0]?.updatedAt).toBe(59);
    expect(records.at(-1)?.updatedAt).toBe(10);
  });
});

describe('redactDiagnosticValue', () => {
  it('隐藏凭据字段并省略内嵌资源', () => {
    const value = redactDiagnosticValue({
      apiKey: 'sk-live-abcdef',
      nested: { accessToken: 'x', GM_data: { theme: 'dark' } },
      cover: 'data:image/webp;base64,AAAABBBBCCCC',
      list: [1, '2', true],
    });
    expect(value).toEqual({
      apiKey: '[已隐藏]',
      nested: { accessToken: '[已隐藏]', GM_data: { theme: 'dark' } },
      cover: expect.stringContaining('内嵌资源'),
      list: [1, '2', true],
    });
  });

  it('截断超长字符串、限制数组长度与嵌套深度', () => {
    const deep = redactDiagnosticValue('x'.repeat(5_000)) as string;
    expect(deep.length).toBeLessThan(1_600);
    expect(deep).toContain('已截断');
    const wide = redactDiagnosticValue(
      Array.from({ length: 300 }, (_, i) => i),
    );
    expect(Array.isArray(wide) && wide).toHaveLength(100);
    let nested: unknown = 'deep';
    for (let index = 0; index < 8; index++) nested = { next: nested };
    expect(JSON.stringify(redactDiagnosticValue(nested))).toContain('层级过深');
  });
});

describe('summarizeDiagnosticScripts', () => {
  it('只保留元信息，不输出脚本源码', () => {
    const [summary] = summarizeDiagnosticScripts([
      script({
        runtime: { ...script().runtime, status: 'ready', error: undefined },
      }),
    ]);
    expect(summary).toMatchObject({
      id: 'script-1',
      name: '页面清理助手',
      version: '1.2.0',
      enabled: true,
      runAt: 'document-end',
      grantCount: 1,
      ruleCount: 1,
      origin: 'https://example.test/clean.user.js',
      runtime: { status: 'ready', error: '', commandCount: 0 },
    });
    expect(summary?.codeLength).toBeGreaterThan(0);
  });
});

describe('buildDiagnosticBundle', () => {
  const item = diagnostic();

  it('输出可解析的 JSON，并过滤密钥与源码', () => {
    const text = buildDiagnosticBundle({
      generatedAt: 1_700_000_000_000,
      app: { name: '万象星核', version: '1.0.0' },
      environment: {
        userAgent: 'TestBrowser/1.0',
        pageUrl: 'https://example.test/',
      },
      preferences: { reloadAfterScriptChange: true, apiKey: 'sk-live-abcdef' },
      scripts: [script()],
      runtimeDiagnostics: parseRuntimeDiagnosticRecords({
        [item.key]: item.value,
      }),
      sync: { connected: true, status: 'synced', remoteVersionCount: 4 },
      notes: ['诊断包不包含脚本源码。'],
    });
    const bundle = JSON.parse(text) as Record<string, unknown>;
    expect(text.endsWith('\n')).toBe(true);
    expect(bundle.format).toBe('novabay-diagnostics');
    expect(bundle.version).toBe(1);
    expect(bundle.generatedAt).toBe(new Date(1_700_000_000_000).toISOString());
    expect(JSON.stringify(bundle)).not.toContain('sk-live-abcdef');
    expect(JSON.stringify(bundle)).not.toContain('UserScript==');
    expect((bundle.scripts as unknown[]).length).toBe(1);
    expect(
      (bundle.runtimeDiagnostics as { commands: string[] }[])[0]?.commands,
    ).toEqual(['重新载入']);
    expect(bundle.notes).toEqual(['诊断包不包含脚本源码。']);
  });

  it('缺省字段生成空集合而不是报错', () => {
    const bundle = JSON.parse(
      buildDiagnosticBundle({
        generatedAt: Number.NaN,
        app: {},
        environment: {},
      }),
    ) as Record<string, unknown>;
    expect(bundle.generatedAt).toBe('');
    expect(bundle.scripts).toEqual([]);
    expect(bundle.runtimeDiagnostics).toEqual([]);
    expect(bundle.sync).toBeNull();
    expect(bundle.preferences).toBeNull();
  });

  it('文件名带上本地日期与时间', () => {
    const name = diagnosticBundleFilename(
      new Date(2026, 8, 23, 9, 5).getTime(),
    );
    expect(name).toBe('novabay-diagnostics-20260923-0905.json');
  });
});
