import type { UserscriptExecutionCapability } from '../userscript/runtime/capabilities';

export type PermissionHealthItemId =
  | 'execution'
  | 'site-access'
  | 'runtime-errors'
  | 'storage';

export type PermissionHealthStatus = 'ok' | 'warning' | 'error';

export type PermissionHealthItem = {
  id: PermissionHealthItemId;
  label: string;
  status: PermissionHealthStatus;
  detail: string;
  actionLabel?: string;
};

export type PermissionHealthReport = {
  ok: boolean;
  checkedAt: number;
  items: PermissionHealthItem[];
};

export type PermissionHealthFailingScript = {
  name: string;
  message: string;
};

export type PermissionHealthInputs = {
  checkedAt: number;
  capability: UserscriptExecutionCapability | null;
  siteGranted: boolean | null;
  siteOrigin: string | null;
  failingScripts: PermissionHealthFailingScript[];
  storageBlocked: boolean;
};

const LABELS: Record<PermissionHealthItemId, string> = {
  execution: '脚本执行能力',
  'site-access': '当前站点授权',
  'runtime-errors': '卡牌运行状态',
  storage: '扩展存储',
};

function executionItem(
  capability: UserscriptExecutionCapability | null,
): PermissionHealthItem {
  if (!capability) {
    return {
      id: 'execution',
      label: LABELS.execution,
      status: 'warning',
      detail: '暂时读不到执行能力，重新加载扩展后可再试。',
    };
  }
  if (capability.status === 'available') {
    return {
      id: 'execution',
      label: LABELS.execution,
      status: 'ok',
      detail: '浏览器允许万象星核注入用户脚本。',
    };
  }
  const setting = capability.status === 'browser-setting-required';
  return {
    id: 'execution',
    label: LABELS.execution,
    status: 'error',
    detail: capability.message,
    actionLabel: setting ? '打开扩展详情页' : '重新授权',
  };
}

function siteItem(inputs: PermissionHealthInputs): PermissionHealthItem {
  if (!inputs.siteOrigin) {
    return {
      id: 'site-access',
      label: LABELS['site-access'],
      status: 'ok',
      detail: '当前页面不是普通网站，跳过站点授权检查。',
    };
  }
  if (inputs.siteGranted === null) {
    return {
      id: 'site-access',
      label: LABELS['site-access'],
      status: 'warning',
      detail: `${inputs.siteOrigin} 的授权状态无法确认，可在扩展菜单里选择“仅在此网站”。`,
    };
  }
  if (inputs.siteGranted) {
    return {
      id: 'site-access',
      label: LABELS['site-access'],
      status: 'ok',
      detail: `${inputs.siteOrigin} 已允许万象星核运行。`,
    };
  }
  return {
    id: 'site-access',
    label: LABELS['site-access'],
    status: 'error',
    detail: `${inputs.siteOrigin} 的站点授权已失效，卡牌不会在该页面出现。`,
    actionLabel: '重新授权该站点',
  };
}

function runtimeItem(
  failingScripts: PermissionHealthFailingScript[],
): PermissionHealthItem {
  if (failingScripts.length === 0) {
    return {
      id: 'runtime-errors',
      label: LABELS['runtime-errors'],
      status: 'ok',
      detail: '最近的页面里没有卡牌报错。',
    };
  }
  const names = failingScripts
    .slice(0, 3)
    .map((item) => item.name)
    .join('、');
  return {
    id: 'runtime-errors',
    label: LABELS['runtime-errors'],
    status: 'warning',
    detail: `${failingScripts.length} 张卡牌最近运行失败：${names}。可在“失败留证”里下载诊断包。`,
  };
}

function storageItem(blocked: boolean): PermissionHealthItem {
  return blocked
    ? {
        id: 'storage',
        label: LABELS.storage,
        status: 'error',
        detail: '扩展存储空间不足，牌库可能无法保存，请先清理脚本或导出数据。',
      }
    : {
        id: 'storage',
        label: LABELS.storage,
        status: 'ok',
        detail: '扩展存储可正常读写。',
      };
}

export function summarizePermissionHealth(
  inputs: PermissionHealthInputs,
): PermissionHealthReport {
  const items = [
    executionItem(inputs.capability),
    siteItem(inputs),
    runtimeItem(inputs.failingScripts.slice(0, 10)),
    storageItem(inputs.storageBlocked),
  ];
  return {
    ok: items.every((item) => item.status === 'ok'),
    checkedAt: inputs.checkedAt,
    items,
  };
}

export function permissionHealthProblems(report: PermissionHealthReport) {
  return report.items.filter((item) => item.status !== 'ok');
}

export function formatPermissionHealthReport(report: PermissionHealthReport) {
  const statusLabel = (status: PermissionHealthStatus) => {
    if (status === 'ok') return '正常';
    if (status === 'warning') return '注意';
    return '失效';
  };
  return [
    `万象星核权限自检 · ${new Date(report.checkedAt).toLocaleString('zh-CN', { hour12: false })}`,
    ...report.items.map(
      (item) => `${statusLabel(item.status)} · ${item.label} · ${item.detail}`,
    ),
  ].join('\n');
}

export interface PermissionHealthController {
  read(): Promise<PermissionHealthReport>;
}
