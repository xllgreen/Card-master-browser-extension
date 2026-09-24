import { describe, expect, it } from 'vitest';
import {
  buildFailureEvidenceReport,
  FAILURE_EVIDENCE_KEY_PREFIX,
  FAILURE_EVIDENCE_LIMIT,
  FAILURE_EVIDENCE_SHOT_KEY_PREFIX,
  FAILURE_EVIDENCE_SHOT_LIMIT,
  type FailureEvidence,
  failureEvidenceFilename,
  failureEvidenceReproduction,
  failureEvidenceShotStorageKey,
  failureEvidenceStorageKey,
  normalizeFailureEvidence,
  parseFailureEvidenceRecords,
  shouldCaptureEvidenceShot,
  summarizeFailureEvidence,
  toFailureEvidenceListItem,
} from './failure-evidence';

const failedAt = new Date(2026, 0, 5, 9, 8, 30).getTime();

function evidence(overrides: Partial<FailureEvidence> = {}): FailureEvidence {
  return {
    evidenceId: 'evidence-1',
    scriptId: 'script-1',
    scriptName: '视频倍速',
    tabId: 7,
    frameId: 0,
    pageUrl: 'https://www.bilibili.com/video/BV1xx',
    error: 'TypeError: cannot read properties of null',
    menuCommands: 3,
    failedAt,
    screenshot: 'available',
    ...overrides,
  };
}

function stored(item: FailureEvidence) {
  return [failureEvidenceStorageKey(item.evidenceId), { ...item }] as const;
}

describe('脚本失败留证', () => {
  it('记录与截图分两把键存放', () => {
    expect(failureEvidenceStorageKey('a1')).toBe(
      `${FAILURE_EVIDENCE_KEY_PREFIX}:a1`,
    );
    expect(failureEvidenceShotStorageKey('a1')).toBe(
      `${FAILURE_EVIDENCE_SHOT_KEY_PREFIX}:a1`,
    );
  });

  it('收下合法记录并裁掉超长文本', () => {
    const item = normalizeFailureEvidence(
      {
        ...evidence({
          error: 'x'.repeat(9_000),
          pageUrl: 'https://example.com/'.concat('p'.repeat(3_000)),
          scriptName: '名'.repeat(300),
        }),
      },
      failureEvidenceStorageKey('evidence-1'),
    );
    expect(item?.error).toHaveLength(4_000);
    expect(item?.pageUrl).toHaveLength(2_000);
    expect(item?.scriptName).toHaveLength(200);
  });

  it('键与身份不一致或字段畸形时整条丢弃', () => {
    const key = failureEvidenceStorageKey('evidence-1');
    expect(
      normalizeFailureEvidence(evidence(), 'userscript-failure-evidence:x'),
    ).toBeNull();
    expect(normalizeFailureEvidence(null, key)).toBeNull();
    expect(
      normalizeFailureEvidence(evidence({ evidenceId: '' }), key),
    ).toBeNull();
    expect(
      normalizeFailureEvidence(evidence({ scriptId: '' }), key),
    ).toBeNull();
    expect(normalizeFailureEvidence(evidence({ error: '' }), key)).toBeNull();
    expect(
      normalizeFailureEvidence(
        evidence({ screenshot: 'pending' as never }),
        key,
      ),
    ).toBeNull();
    expect(
      normalizeFailureEvidence(evidence({ menuCommands: -1 }), key),
    ).toBeNull();
    expect(
      normalizeFailureEvidence(evidence({ menuCommands: 1.5 }), key),
    ).toBeNull();
    expect(normalizeFailureEvidence(evidence({ tabId: 1.5 }), key)).toBeNull();
    expect(
      normalizeFailureEvidence(evidence({ failedAt: Number.NaN }), key),
    ).toBeNull();
  });

  it('读回时跳过截图与无关键，按时间倒序并限量', () => {
    const many = Array.from(
      { length: FAILURE_EVIDENCE_LIMIT + 3 },
      (_u, index) =>
        stored(
          evidence({
            evidenceId: `evidence-${index}`,
            failedAt: failedAt + index * 1_000,
          }),
        ),
    );
    const records = parseFailureEvidenceRecords({
      ...Object.fromEntries(many),
      [failureEvidenceShotStorageKey('evidence-0')]:
        'data:image/png;base64,AAA',
      'wallpaper-cache': { ignore: true },
    });
    expect(records).toHaveLength(FAILURE_EVIDENCE_LIMIT);
    expect(records[0].failedAt).toBe(failedAt + (many.length - 1) * 1_000);
    expect(records.map((item) => item.failedAt)).toEqual(
      [...records.map((item) => item.failedAt)].sort((a, b) => b - a),
    );
  });

  it('截图按节流窗口与总量限制', () => {
    expect(
      shouldCaptureEvidenceShot({
        now: 10_000,
        lastShotAt: null,
        storedShots: 0,
      }),
    ).toBe(true);
    expect(
      shouldCaptureEvidenceShot({
        now: 10_000,
        lastShotAt: null,
        storedShots: FAILURE_EVIDENCE_SHOT_LIMIT - 1,
      }),
    ).toBe(true);
    expect(
      shouldCaptureEvidenceShot({
        now: 10_000,
        lastShotAt: 8_000,
        storedShots: 0,
      }),
    ).toBe(false);
    expect(
      shouldCaptureEvidenceShot({
        now: 15_000,
        lastShotAt: 10_000,
        storedShots: 2,
      }),
    ).toBe(true);
    expect(
      shouldCaptureEvidenceShot({
        now: 15_000,
        lastShotAt: 10_000,
        storedShots: 2,
        intervalMs: 6_000,
      }),
    ).toBe(false);
  });

  it('汇总出张数、带图数量与涉及卡牌', () => {
    const summary = summarizeFailureEvidence([
      evidence({ evidenceId: 'a', screenshot: 'available' }),
      evidence({
        evidenceId: 'b',
        screenshot: 'skipped',
        scriptName: '网页净化',
      }),
      evidence({
        evidenceId: 'c',
        screenshot: 'failed',
        scriptName: '视频倍速',
      }),
    ]);
    expect(summary.total).toBe(3);
    expect(summary.withScreenshot).toBe(1);
    expect(summary.latestAt).toBe(failedAt);
    expect(summary.scripts).toEqual(['视频倍速', '网页净化']);
    expect(
      summarizeFailureEvidence(
        Array.from({ length: 12 }, (_u, index) =>
          evidence({ evidenceId: `e-${index}`, scriptName: `卡${index}` }),
        ),
      ).scripts,
    ).toHaveLength(8);
    expect(summarizeFailureEvidence([]).latestAt).toBeNull();
  });

  it('复现说明能直接看懂', () => {
    const text = failureEvidenceReproduction(evidence());
    expect(text).toContain('https://www.bilibili.com/video/BV1xx');
    expect(text).toContain('等「视频倍速」这张卡牌出现');
    expect(text).toContain('当时卡牌菜单里有 3 个命令');
    expect(failureEvidenceReproduction(evidence({ pageUrl: '' }))).toContain(
      '（未知页面）',
    );
    expect(
      failureEvidenceReproduction(evidence({ menuCommands: 0 })),
    ).toContain('当时卡牌菜单里没有任何命令');
  });

  it('文件名去掉非法字符并带上本地时间', () => {
    expect(failureEvidenceFilename(evidence())).toBe(
      'novabay-failure-视频倍速-20260105-0908.json',
    );
    expect(
      failureEvidenceFilename(evidence({ scriptName: 'a/b:c*d?e "f"<g>|h ' })),
    ).toContain('novabay-failure-abcdefg');
    expect(failureEvidenceFilename(evidence({ scriptName: '   ' }))).toContain(
      'novabay-failure-script-',
    );
  });

  it('报告里带复现说明与截图，供作者直接上手', () => {
    const parsed = JSON.parse(
      buildFailureEvidenceReport(evidence(), 'data:image/png;base64,AAA'),
    );
    expect(parsed.format).toBe('novabay-failure-evidence');
    expect(parsed.version).toBe(1);
    expect(parsed.evidence.evidenceId).toBe('evidence-1');
    expect(parsed.screenshotDataUrl).toBe('data:image/png;base64,AAA');
    expect(parsed.reproduction).toContain('视频倍速');
    expect(
      JSON.parse(buildFailureEvidenceReport(evidence(), null))
        .screenshotDataUrl,
    ).toBeNull();
  });

  it('列表项只带界面需要的字段', () => {
    const item = toFailureEvidenceListItem(evidence());
    expect(item).toEqual({
      evidenceId: 'evidence-1',
      scriptName: '视频倍速',
      pageUrl: 'https://www.bilibili.com/video/BV1xx',
      failedAt,
      error: 'TypeError: cannot read properties of null',
      screenshot: 'available',
      reproduction: failureEvidenceReproduction(evidence()),
    });
  });
});
