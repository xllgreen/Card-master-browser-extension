import {
  buildFailureEvidenceReport,
  FAILURE_EVIDENCE_LIMIT,
  FAILURE_EVIDENCE_MAX_SHOT_CHARS,
  type FailureEvidence,
  type FailureEvidenceInput,
  type FailureEvidenceRecorder,
  type FailureEvidenceScreenshotState,
  failureEvidenceFilename,
  failureEvidenceShotStorageKey,
  failureEvidenceStorageKey,
  parseFailureEvidenceRecords,
  shouldCaptureEvidenceShot,
} from '../../diagnostics/failure-evidence';
import type { ExtensionBackgroundApi } from './api';

type CapturedShot = {
  shot: string | null;
  state: FailureEvidenceScreenshotState;
};

/**
 * 把脚本运行现场写进扩展会话存储：记录本身很小，截图单独存放并节流，
 * 浏览器重启即清空，不会长期留下页面影像。
 */
export class ExtensionFailureEvidenceService
  implements FailureEvidenceRecorder
{
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly api: ExtensionBackgroundApi) {}

  private async all(): Promise<Record<string, unknown>> {
    try {
      return (await this.api.storage.session.get(null)) ?? {};
    } catch {
      return {};
    }
  }

  async list(): Promise<FailureEvidence[]> {
    return parseFailureEvidenceRecords(await this.all());
  }

  private async latestShotAt(records: readonly FailureEvidence[]) {
    const stored = await this.all();
    for (const record of records) {
      if (record.screenshot !== 'available') continue;
      const shot = stored[failureEvidenceShotStorageKey(record.evidenceId)];
      if (typeof shot === 'string' && shot) return record.failedAt;
    }
    return null;
  }

  private async capture(tabId: number): Promise<CapturedShot> {
    const tabs = this.api.tabs;
    if (!tabs?.captureVisibleTab) return { shot: null, state: 'skipped' };
    const tab = await Promise.resolve(tabs.get(tabId)).catch(() => null);
    if (!tab?.active || typeof tab.windowId !== 'number')
      return { shot: null, state: 'skipped' };
    const shot = await Promise.resolve(
      tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 55 }),
    ).catch(() => null);
    if (typeof shot !== 'string' || !shot)
      return { shot: null, state: 'failed' };
    if (shot.length > FAILURE_EVIDENCE_MAX_SHOT_CHARS)
      return { shot: null, state: 'skipped' };
    return { shot, state: 'available' };
  }

  private async resolvePageUrl(input: FailureEvidenceInput) {
    if (input.pageUrl) return input.pageUrl;
    const tabs = this.api.tabs;
    if (!tabs?.get) return '';
    const tab = await Promise.resolve(tabs.get(input.tabId)).catch(() => null);
    return typeof tab?.url === 'string' ? tab.url : '';
  }

  record(input: FailureEvidenceInput): Promise<unknown> {
    const pending = this.queue.then(async () => {
      const now = Date.now();
      const evidenceId = crypto.randomUUID();
      const records = await this.list();
      const pageUrl = await this.resolvePageUrl(input);
      const shots = records.filter(
        (item) => item.screenshot === 'available',
      ).length;
      const wanted = shouldCaptureEvidenceShot({
        now,
        lastShotAt: await this.latestShotAt(records),
        storedShots: shots,
      });
      const captured: CapturedShot = wanted
        ? await this.capture(input.tabId)
        : { shot: null, state: 'skipped' };
      const evidence: FailureEvidence = {
        evidenceId,
        scriptId: input.scriptId,
        scriptName: input.scriptName.slice(0, 200),
        tabId: input.tabId,
        frameId: input.frameId,
        pageUrl: pageUrl.slice(0, 2_000),
        error: input.error.slice(0, 4_000),
        menuCommands: Math.max(0, Math.floor(input.menuCommands)),
        failedAt: now,
        screenshot: captured.state,
      };
      const update: Record<string, unknown> = {
        [failureEvidenceStorageKey(evidenceId)]: evidence,
      };
      if (captured.shot)
        update[failureEvidenceShotStorageKey(evidenceId)] = captured.shot;
      await this.api.storage.session.set(update).catch(() => undefined);
      const overflow = [evidence, ...records].slice(FAILURE_EVIDENCE_LIMIT);
      if (overflow.length > 0) {
        const keys = overflow.flatMap((item) => [
          failureEvidenceStorageKey(item.evidenceId),
          failureEvidenceShotStorageKey(item.evidenceId),
        ]);
        await this.api.storage.session.remove(keys).catch(() => undefined);
      }
    });
    this.queue = pending.catch(() => undefined);
    return pending;
  }

  async report(
    evidenceId: string,
  ): Promise<{ filename: string; text: string }> {
    const records = await this.list();
    const evidence = records.find((item) => item.evidenceId === evidenceId);
    if (!evidence) throw new Error('这条失败留证已经不在了。');
    const stored = await this.all();
    const shot = stored[failureEvidenceShotStorageKey(evidenceId)];
    return {
      filename: failureEvidenceFilename(evidence),
      text: buildFailureEvidenceReport(
        evidence,
        typeof shot === 'string' && shot ? shot : null,
      ),
    };
  }
}
