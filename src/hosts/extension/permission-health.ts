import { parseRuntimeDiagnosticRecords } from '../../diagnostics/bundle';
import {
  type PermissionHealthFailingScript,
  type PermissionHealthReport,
  summarizePermissionHealth,
} from '../../permission-health/domain';
import type { InstalledUserscript } from '../../userscript/domain/types';
import type { ExtensionBackgroundApi } from './api';
import { userscriptExecutionCapability } from './userscript-permission';

/**
 * 站点授权只对普通网页有意义，扩展页、本地文件与内部页面一律不判定。
 */
function pageOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function failingScripts(
  diagnostics: ReturnType<typeof parseRuntimeDiagnosticRecords>,
  scripts: readonly InstalledUserscript[],
): PermissionHealthFailingScript[] {
  const names = new Map(
    scripts.map((script) => [script.id, script.metadata.name]),
  );
  const seen = new Set<string>();
  const result: PermissionHealthFailingScript[] = [];
  for (const item of diagnostics) {
    if (seen.has(item.scriptId)) continue;
    seen.add(item.scriptId);
    result.push({
      name: names.get(item.scriptId) ?? item.scriptId.slice(0, 18),
      message: item.error.split('\n')[0] ?? '',
    });
  }
  return result;
}

export async function readPermissionHealth(
  api: ExtensionBackgroundApi,
  sender: chrome.runtime.MessageSender,
  dependencies: {
    scripts: readonly InstalledUserscript[];
    storageBlocked: boolean;
    checkedAt?: number;
  },
): Promise<PermissionHealthReport> {
  const origin = pageOrigin(sender.tab?.url);
  const [capability, granted] = await Promise.all([
    userscriptExecutionCapability(api).catch(() => null),
    origin && api.permissions
      ? api.permissions.contains({ origins: [origin] }).catch(() => null)
      : Promise.resolve(null),
  ]);
  const stored = (await api.storage.session.get(null).catch(() => ({}))) ?? {};
  return summarizePermissionHealth({
    checkedAt: dependencies.checkedAt ?? Date.now(),
    capability,
    siteGranted: granted,
    siteOrigin: origin,
    failingScripts: failingScripts(
      parseRuntimeDiagnosticRecords(stored),
      dependencies.scripts,
    ),
    storageBlocked: dependencies.storageBlocked,
  });
}
