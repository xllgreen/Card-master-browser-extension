import {
  BILIBILI_CAPABILITIES,
  bilibiliCapabilityCardId,
} from '../../bilibili-capabilities/registry';
import { CONTENT_BLOCKER_CARD_ID } from '../../content-blocking/domain/types';
import { GAMEPAD_CONTROL_CARD_ID } from '../../gamepad-control/domain/types';
import { MEDIA_RESOURCES_CARD_ID } from '../../media-resources/domain/types';
import { MEDIA_SPEED_CARD_ID } from '../../media-speed/domain/types';
import { PAGE_THEME_CARD_ID } from '../../page-theme/domain/types';

export const DECK_STEWARD_CARD_ID = 'system-deck-steward' as const;
export const NEW_TAB_CARD_ID = 'system-new-tab' as const;

export type SystemCardKind =
  | 'steward'
  | 'new-tab'
  | 'gamepad-control'
  | 'content-blocker'
  | 'page-theme'
  | 'media-speed'
  | 'media-resources'
  | 'bilibili-capability';

export type SystemCardDefinition = Readonly<{
  id: string;
  kind: SystemCardKind;
  title: string;
  description: string;
  hideable: boolean;
  order: number;
}>;

const CORE_SYSTEM_CARDS: readonly SystemCardDefinition[] = [
  {
    id: DECK_STEWARD_CARD_ID,
    kind: 'steward',
    title: '脚本管理',
    description: '管理已安装的脚本，搜索和创建新脚本。',
    hideable: true,
    order: 0,
  },
  {
    id: NEW_TAB_CARD_ID,
    kind: 'new-tab',
    title: '新标签页',
    description: '自定义新标签页的壁纸与搜索设置。',
    hideable: true,
    order: 10,
  },
  {
    id: GAMEPAD_CONTROL_CARD_ID,
    kind: 'gamepad-control',
    title: '手柄控制',
    description: '使用手柄操作网页和扩展界面。',
    hideable: true,
    order: 20,
  },
  {
    id: CONTENT_BLOCKER_CARD_ID,
    kind: 'content-blocker',
    title: '内容过滤',
    description: '隐藏网页上的广告或指定内容。',
    hideable: true,
    order: 30,
  },
  {
    id: PAGE_THEME_CARD_ID,
    kind: 'page-theme',
    title: '深色主题',
    description: '调整网页的明暗与配色。',
    hideable: true,
    order: 40,
  },
  {
    id: MEDIA_SPEED_CARD_ID,
    kind: 'media-speed',
    title: '倍速播放',
    description: '调节网页中视频和音频的播放速度。',
    hideable: true,
    order: 50,
  },
  {
    id: MEDIA_RESOURCES_CARD_ID,
    kind: 'media-resources',
    title: '媒体资源',
    description: '查看和下载当前页面中的音视频资源。',
    hideable: true,
    order: 60,
  },
];

const PLATFORM_SYSTEM_CARDS: readonly SystemCardDefinition[] =
  BILIBILI_CAPABILITIES.map((capability, index) => ({
    id: bilibiliCapabilityCardId(capability.id),
    kind: 'bilibili-capability',
    title: capability.title,
    description: capability.description,
    hideable: true,
    order: 100 + index,
  }));

export const SYSTEM_CARD_CATALOG: readonly SystemCardDefinition[] = [
  ...CORE_SYSTEM_CARDS,
  ...PLATFORM_SYSTEM_CARDS,
];

const SYSTEM_CARD_BY_ID = new Map(
  SYSTEM_CARD_CATALOG.map((definition) => [definition.id, definition]),
);

export function systemCardDefinition(cardId: string) {
  const definition = SYSTEM_CARD_BY_ID.get(cardId);
  if (!definition) throw new Error(`Unknown system card: ${cardId}`);
  return definition;
}

export function systemCardCopy(cardId: string) {
  const { title, description } = systemCardDefinition(cardId);
  return { title, description };
}

export function isSystemCardId(cardId: string) {
  return SYSTEM_CARD_BY_ID.has(cardId);
}

const SAFARI_EXCLUDED_SYSTEM_CARD_IDS = new Set<string>([
  MEDIA_RESOURCES_CARD_ID,
  NEW_TAB_CARD_ID,
]);

export function systemCardOfferedOnTarget(
  cardId: string,
  target: 'chromium' | 'firefox' | 'safari',
) {
  return target !== 'safari' || !SAFARI_EXCLUDED_SYSTEM_CARD_IDS.has(cardId);
}
