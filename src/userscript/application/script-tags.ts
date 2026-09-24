const SCRIPT_TAG_LIMIT = 12;
const SCRIPT_TAG_MAX_CHARS = 24;
const SCRIPT_TAG_SPLIT = /[、,，;；\n\r\t|/]+/u;

/** 把用户输入的一行标签整理成去重、去空的短标签列表。 */
export function parseScriptTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return parseScriptTags(value.map((item) => String(item ?? '')).join('、'));
  }
  if (typeof value !== 'string' || !value.trim()) return [];
  const tags: string[] = [];
  for (const part of value.split(SCRIPT_TAG_SPLIT)) {
    const tag = part
      .trim()
      .replace(/\s+/gu, ' ')
      .slice(0, SCRIPT_TAG_MAX_CHARS);
    if (!tag || tags.includes(tag)) continue;
    tags.push(tag);
    if (tags.length >= SCRIPT_TAG_LIMIT) break;
  }
  return tags;
}

export function formatScriptTags(tags: readonly string[] | undefined): string {
  return (tags ?? []).join('、');
}

/** 只在有标签时写入字段，避免旧数据出现空数组造成无意义的变更。 */
export function scriptTagsField(tags: readonly string[]): { tags?: string[] } {
  return tags.length > 0 ? { tags: [...tags] } : {};
}

export type ScriptTagOption = { tag: string; count: number };

export function collectScriptTags(
  scripts: readonly { manager: { tags?: string[] } }[],
): ScriptTagOption[] {
  const counts = new Map<string, number>();
  for (const script of scripts) {
    for (const tag of new Set(parseScriptTags(script.manager.tags))) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.tag.localeCompare(right.tag, 'zh-CN'),
    );
}

export function scriptMatchesTag(
  tags: readonly string[] | undefined,
  tag: string | null,
) {
  if (!tag) return true;
  return parseScriptTags(tags).includes(tag);
}
