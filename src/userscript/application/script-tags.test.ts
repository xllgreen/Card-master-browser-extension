import { describe, expect, it } from 'vitest';
import {
  collectScriptTags,
  formatScriptTags,
  parseScriptTags,
  scriptMatchesTag,
  scriptTagsField,
} from './script-tags';

describe('卡牌标签', () => {
  it('支持多种分隔符并去重限量', () => {
    expect(parseScriptTags('视频、AI ，同步;AI  ; 视频\n下载')).toEqual([
      '视频',
      'AI',
      '同步',
      '下载',
    ]);
    expect(parseScriptTags('')).toEqual([]);
    expect(parseScriptTags(undefined)).toEqual([]);
    expect(parseScriptTags([' 下载 ', '下载', 123])).toEqual(['下载', '123']);
    expect(
      parseScriptTags(Array.from({ length: 30 }, (_i, n) => `标签${n}`)),
    ).toHaveLength(12);
    expect(
      parseScriptTags('很长很长很长很长很长很长很长很长很长很长的标签名')[0],
    ).toHaveLength(24);
  });

  it('字段只在非空时写入', () => {
    expect(scriptTagsField([])).toEqual({});
    expect(scriptTagsField(['视频'])).toEqual({ tags: ['视频'] });
    expect(formatScriptTags(['视频', 'AI'])).toBe('视频、AI');
    expect(formatScriptTags(undefined)).toBe('');
  });

  it('统计牌库标签并按数量排序', () => {
    expect(
      collectScriptTags([
        { manager: { tags: ['视频', '视频'] } },
        { manager: { tags: ['视频'] } },
        { manager: {} },
        { manager: { tags: ['AI'] } },
      ]),
    ).toEqual([
      { tag: '视频', count: 2 },
      { tag: 'AI', count: 1 },
    ]);
  });

  it('筛选时未选中标签一律放行', () => {
    expect(scriptMatchesTag(['视频'], null)).toBe(true);
    expect(scriptMatchesTag(['视频'], '视频')).toBe(true);
    expect(scriptMatchesTag([], '视频')).toBe(false);
    expect(scriptMatchesTag(undefined, '视频')).toBe(false);
  });
});
