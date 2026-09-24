import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { LocalBackupController } from '../../backup/local-backup';
import type { FailureEvidenceController } from '../../diagnostics/failure-evidence';
import type { PermissionHealthController } from '../../permission-health/domain';
import type { ScriptRepository } from '../../userscript/application/script-repository';
import type { ScriptTrashController } from '../../userscript/application/script-trash';
import {
  FailureEvidenceBoard,
  LocalBackupBoard,
  PermissionHealthBoard,
  ScriptTrashBoard,
  SyncScopeNote,
} from './DataBoards';

const source = () =>
  readFileSync(new URL('./DataBoards.tsx', import.meta.url), 'utf8');

const noop = async () => undefined;

describe('DataBoards', () => {
  it('本机备份给出导出与导入入口，并提醒文件含敏感信息', () => {
    const markup = renderToStaticMarkup(
      <LocalBackupBoard controller={{} as LocalBackupController} />,
    );

    expect(markup).toContain('本机备份');
    expect(markup).toContain('导出到本机');
    expect(markup).toContain('导入备份文件');
    expect(markup).toContain('备份文件包含敏感信息');
    expect(markup).toContain('不要发到群里或网盘公开链接');
    // 没有真正执行导入导出时，不显示结果与错误。
    expect(markup).not.toContain('备份结果');
    expect(markup).not.toContain('备份操作未完成');
  });

  it('导入的 WebDAV 连接交回上层复用，不重复填表', () => {
    expect(source()).toContain('if (result.webdav && onRestoreWebdav)');
    expect(source()).toContain('controller.import(text)');
    expect(source()).toContain('accept=".json,application/json"');
  });

  it('回收站首屏显示读取中，并说明保留 30 天', () => {
    const markup = renderToStaticMarkup(
      <ScriptTrashBoard controller={{} as ScriptTrashController} />,
    );

    expect(markup).toContain('回收站');
    expect(markup).toContain('保留 30 天');
    expect(markup).toContain('正在读取回收站');
    expect(markup).not.toContain('回收站是空的');
    expect(markup).not.toContain('彻底删除');
  });

  it('回收站提供放回、彻底删除、清空与重读四类动作', () => {
    const text = source();

    expect(text).toContain('controller.restore(item.scriptId)');
    expect(text).toContain('controller.discard(item.scriptId)');
    expect(text).toContain('controller.clear()');
    expect(text).toContain('还剩');
    expect(text).toContain('remainingDays');
  });

  it('权限自检首屏只给检查入口，报告未回来前不下结论', () => {
    const markup = renderToStaticMarkup(
      <PermissionHealthBoard controller={{} as PermissionHealthController} />,
    );

    expect(markup).toContain('权限与运行条件');
    expect(markup).toContain('重新检查');
    expect(markup).not.toContain('全部正常');
    expect(markup).not.toContain('有项目需要你处理');
    expect(markup).not.toContain('复制自检结果');
  });

  it('失败留证无记录时给出明确空态，不假装在读数据', () => {
    const markup = renderToStaticMarkup(
      <FailureEvidenceBoard controller={{} as FailureEvidenceController} />,
    );

    expect(markup).toContain('脚本失败留证');
    expect(markup).toContain('只保留最近 12');
    expect(markup).toContain('目前没有留证记录');
    expect(markup).toContain('脚本正常运行时不会留下任何内容');
    expect(markup).not.toContain('导出留证');
  });

  it('没有排除卡牌时，选择性同步提示不占位', () => {
    const repository = { list: noop } as unknown as ScriptRepository;

    expect(
      renderToStaticMarkup(<SyncScopeNote repository={repository} />),
    ).toBe('');
  });

  it('数据面板保持安静：不引入音频、动效与画布', () => {
    const text = source();

    for (const banned of [
      'gsap',
      'AudioDirector',
      'useInstallCardAnimation',
      'requestAnimationFrame',
      'media-speed-projectile-effect',
      '<canvas',
      '@keyframes',
    ]) {
      expect(text).not.toContain(banned);
    }
  });

  it('五个数据面板统一挂在设置页，不散落到牌组里', () => {
    const settings = readFileSync(
      new URL('./SettingsBoard.tsx', import.meta.url),
      'utf8',
    );

    expect(settings).toContain('<LocalBackupBoard');
    expect(settings).toContain('<ScriptTrashBoard');
    expect(settings).toContain('<PermissionHealthBoard');
    expect(settings).toContain('<FailureEvidenceBoard');
    expect(settings).toContain('<SyncScopeNote');
  });
});
