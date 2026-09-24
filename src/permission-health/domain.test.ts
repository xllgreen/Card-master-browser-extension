import { describe, expect, it } from 'vitest';
import {
  formatPermissionHealthReport,
  permissionHealthProblems,
  summarizePermissionHealth,
} from './domain';

const base = {
  checkedAt: 1_800_000_000_000,
  capability: { status: 'available' } as const,
  siteGranted: true,
  siteOrigin: 'https://example.com',
  failingScripts: [],
  storageBlocked: false,
};

describe('权限自检', () => {
  it('全部正常时报告为 ok', () => {
    const report = summarizePermissionHealth(base);
    expect(report.ok).toBe(true);
    expect(report.items.map((item) => item.id)).toEqual([
      'execution',
      'site-access',
      'runtime-errors',
      'storage',
    ]);
    expect(permissionHealthProblems(report)).toEqual([]);
  });

  it('浏览器开关关闭时给出可操作提示', () => {
    const report = summarizePermissionHealth({
      ...base,
      capability: {
        status: 'browser-setting-required',
        message: '请在扩展详情页开启“允许运行用户脚本”。',
      },
    });
    const execution = report.items.find((item) => item.id === 'execution');
    expect(execution?.status).toBe('error');
    expect(execution?.actionLabel).toBe('打开扩展详情页');
    expect(report.ok).toBe(false);
  });

  it('站点授权失效与运行报错都会被列出', () => {
    const report = summarizePermissionHealth({
      ...base,
      siteGranted: false,
      failingScripts: [{ name: '视频助手', message: 'boom' }],
    });
    expect(permissionHealthProblems(report).map((item) => item.id)).toEqual([
      'site-access',
      'runtime-errors',
    ]);
    const text = formatPermissionHealthReport(report);
    expect(text).toContain('失效 · 当前站点授权');
    expect(text).toContain('1 张卡牌最近运行失败：视频助手');
  });

  it('非网站页面与读不到状态时不误报', () => {
    const report = summarizePermissionHealth({
      ...base,
      capability: null,
      siteOrigin: null,
      siteGranted: null,
      storageBlocked: true,
    });
    expect(report.items.find((item) => item.id === 'execution')?.status).toBe(
      'warning',
    );
    expect(report.items.find((item) => item.id === 'site-access')?.status).toBe(
      'ok',
    );
    expect(report.items.find((item) => item.id === 'storage')?.status).toBe(
      'error',
    );
  });

  it('失败卡牌过多时只展示前三张名称', () => {
    const report = summarizePermissionHealth({
      ...base,
      failingScripts: Array.from({ length: 6 }, (_item, index) => ({
        name: `卡${index}`,
        message: 'x',
      })),
    });
    const detail = report.items.find(
      (item) => item.id === 'runtime-errors',
    )?.detail;
    expect(detail).toContain('6 张卡牌最近运行失败：卡0、卡1、卡2');
  });
});
