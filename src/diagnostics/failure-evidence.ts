/**
 * 脚本失败留证：卡牌运行报错时，把“哪张卡、哪个页面、什么错、当时有几个菜单项”
 * 连同一次可视区截图记进扩展会话存储，供用户下载给作者复现。
 *
 * 这里只做纯数据整理，不接触扩展 API。截图体积大，单独存放在另一把键里。
 */
export const FAILURE_EVIDENCE_LIMIT = 12;
export const FAILURE_EVIDENCE_KEY_PREFIX = 'userscript-failure-evidence';
export const FAILURE_EVIDENCE_SHOT_KEY_PREFIX =
  'userscript-failure-evidence-shot';
export const FAILURE_EVIDENCE_SHOT_LIMIT = 3;
export const FAILURE_EVIDENCE_CAPTURE_INTERVAL_MS = 5_000;
export const FAILURE_EVIDENCE_MAX_SHOT_CHARS = 4_000_000;
export const FAILURE_EVIDENCE_MAX_ERROR_CHARS = 4_000;
export const FAILURE_EVIDENCE_MAX_URL_CHARS = 2_000;

export type FailureEvidenceScreenshotState = 'available' | 'skipped' | 'failed';

export type FailureEvidence = {
  evidenceId: string;
  scriptId: string;
  scriptName: string;
  tabId: number;
  frameId: number;
  pageUrl: string;
  error: string;
  menuCommands: number;
  failedAt: number;
  screenshot: FailureEvidenceScreenshotState;
};

export type FailureEvidenceInput = {
  scriptId: string;
  scriptName: string;
  tabId: number;
  frameId: number;
  pageUrl: string;
  error: string;
  menuCommands: number;
};

export interface FailureEvidenceRecorder {
  record(input: FailureEvidenceInput): Promise<unknown>;
}

export type FailureEvidenceSummary = {
  total: number;
  withScreenshot: number;
  latestAt: number | null;
  scripts: string[];
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function failureEvidenceStorageKey(evidenceId: string) {
  return `${FAILURE_EVIDENCE_KEY_PREFIX}:${evidenceId}`;
}

export function failureEvidenceShotStorageKey(evidenceId: string) {
  return `${FAILURE_EVIDENCE_SHOT_KEY_PREFIX}:${evidenceId}`;
}

function bounded(value: unknown, max: number) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

const SCREENSHOT_STATES: FailureEvidenceScreenshotState[] = [
  'available',
  'skipped',
  'failed',
];

export function normalizeFailureEvidence(
  value: unknown,
  key: string,
): FailureEvidence | null {
  if (!record(value)) return null;
  const {
    evidenceId,
    scriptId,
    scriptName,
    tabId,
    frameId,
    pageUrl,
    error,
    menuCommands,
    failedAt,
    screenshot,
  } = value;
  if (
    typeof evidenceId !== 'string' ||
    !evidenceId ||
    failureEvidenceStorageKey(evidenceId) !== key ||
    typeof scriptId !== 'string' ||
    !scriptId ||
    typeof tabId !== 'number' ||
    !Number.isSafeInteger(tabId) ||
    typeof frameId !== 'number' ||
    !Number.isSafeInteger(frameId) ||
    typeof failedAt !== 'number' ||
    !Number.isFinite(failedAt) ||
    typeof menuCommands !== 'number' ||
    !Number.isInteger(menuCommands) ||
    menuCommands < 0
  ) {
    return null;
  }
  if (typeof error !== 'string' || !error) return null;
  if (typeof scriptName !== 'string') return null;
  if (
    typeof screenshot !== 'string' ||
    !SCREENSHOT_STATES.includes(screenshot as FailureEvidenceScreenshotState)
  ) {
    return null;
  }
  return {
    evidenceId,
    scriptId,
    scriptName: scriptName.slice(0, 200),
    tabId,
    frameId,
    pageUrl: bounded(pageUrl, FAILURE_EVIDENCE_MAX_URL_CHARS),
    error: error.slice(0, FAILURE_EVIDENCE_MAX_ERROR_CHARS),
    menuCommands,
    failedAt,
    screenshot: screenshot as FailureEvidenceScreenshotState,
  };
}

export function parseFailureEvidenceRecords(
  stored: Record<string, unknown>,
): FailureEvidence[] {
  const records: FailureEvidence[] = [];
  const shotPrefix = `${FAILURE_EVIDENCE_SHOT_KEY_PREFIX}:`;
  for (const [key, value] of Object.entries(stored)) {
    if (key.startsWith(shotPrefix)) continue;
    if (!key.startsWith(`${FAILURE_EVIDENCE_KEY_PREFIX}:`)) continue;
    const evidence = normalizeFailureEvidence(value, key);
    if (evidence) records.push(evidence);
  }
  return records
    .sort((left, right) => right.failedAt - left.failedAt)
    .slice(0, FAILURE_EVIDENCE_LIMIT);
}

/**
 * 截图会打断用户视线，同一张卡、同一个页面在节流窗口内只留一张，
 * 并且整体也限制张数，避免会话存储被图片塞满。
 */
export function shouldCaptureEvidenceShot(input: {
  now: number;
  lastShotAt: number | null;
  storedShots: number;
  intervalMs?: number;
  shotLimit?: number;
}) {
  const interval = input.intervalMs ?? FAILURE_EVIDENCE_CAPTURE_INTERVAL_MS;
  const limit = input.shotLimit ?? FAILURE_EVIDENCE_SHOT_LIMIT;
  if (input.storedShots >= limit) return false;
  if (input.lastShotAt === null) return true;
  return input.now - input.lastShotAt >= interval;
}

export function summarizeFailureEvidence(
  records: readonly FailureEvidence[],
): FailureEvidenceSummary {
  const scripts: string[] = [];
  for (const item of records) {
    if (!scripts.includes(item.scriptName)) scripts.push(item.scriptName);
  }
  return {
    total: records.length,
    withScreenshot: records.filter((item) => item.screenshot === 'available')
      .length,
    latestAt: records.length > 0 ? records[0].failedAt : null,
    scripts: scripts.slice(0, 8),
  };
}

/** 用一句人话把复现路径讲清楚，用户直接复制给作者就能上手。 */
export function failureEvidenceReproduction(evidence: FailureEvidence) {
  const page = evidence.pageUrl || '（未知页面）';
  const menu =
    evidence.menuCommands > 0
      ? `当时卡牌菜单里有 ${evidence.menuCommands} 个命令`
      : '当时卡牌菜单里没有任何命令';
  return [
    `在 ${page}`,
    `等「${evidence.scriptName}」这张卡牌出现`,
    menu,
    `报错时间 ${new Date(evidence.failedAt).toLocaleString('zh-CN', { hour12: false })}`,
  ].join(' → ');
}

export function failureEvidenceFilename(evidence: FailureEvidence) {
  const stamp = new Date(evidence.failedAt);
  const pad = (value: number) => String(value).padStart(2, '0');
  const name = evidence.scriptName.replace(/[\\/:*?"<>|\s]+/g, '').slice(0, 24);
  return `novabay-failure-${name || 'script'}-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}.json`;
}

export function buildFailureEvidenceReport(
  evidence: FailureEvidence,
  screenshot: string | null,
) {
  return JSON.stringify(
    {
      format: 'novabay-failure-evidence',
      version: 1,
      reproduction: failureEvidenceReproduction(evidence),
      evidence,
      screenshotDataUrl: screenshot,
    },
    null,
    2,
  );
}
export type FailureEvidenceListItem = {
  evidenceId: string;
  scriptName: string;
  pageUrl: string;
  failedAt: number;
  error: string;
  screenshot: FailureEvidenceScreenshotState;
  reproduction: string;
};

export type FailureEvidenceListResult = {
  records: FailureEvidenceListItem[];
  summary: FailureEvidenceSummary;
};

export type FailureEvidenceReportResult = {
  filename: string;
  text: string;
};

export function toFailureEvidenceListItem(
  evidence: FailureEvidence,
): FailureEvidenceListItem {
  return {
    evidenceId: evidence.evidenceId,
    scriptName: evidence.scriptName,
    pageUrl: evidence.pageUrl,
    failedAt: evidence.failedAt,
    error: evidence.error,
    screenshot: evidence.screenshot,
    reproduction: failureEvidenceReproduction(evidence),
  };
}

export interface FailureEvidenceController {
  list(): Promise<FailureEvidenceListResult>;
  download(evidenceId: string): Promise<FailureEvidenceReportResult>;
}
