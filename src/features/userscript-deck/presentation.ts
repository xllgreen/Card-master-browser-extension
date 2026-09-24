import {
  BILIBILI_CAPABILITIES,
  bilibiliCapabilityCardId,
} from '../../bilibili-capabilities/registry';
import { CONTENT_BLOCKER_CARD_ID } from '../../content-blocking/domain/types';
import { GAMEPAD_CONTROL_CARD_ID } from '../../gamepad-control/domain/types';
import { cardMediaAccent } from '../../generated/card-media-accents.generated';
import { projectAssetUrl } from '../../lib/project-assets';
import {
  bundledCardMediaForVideo,
  type CardMedia,
  presetCardMedia,
} from '../../lib/userscript-deck-media';
import { MEDIA_RESOURCES_CARD_ID } from '../../media-resources/domain/types';
import { MEDIA_SPEED_CARD_ID } from '../../media-speed/domain/types';
import { PAGE_THEME_CARD_ID } from '../../page-theme/domain/types';
import {
  DECK_STEWARD_CARD_ID,
  NEW_TAB_CARD_ID,
} from '../../system-cards/domain/catalog';
import {
  DEFAULT_USERSCRIPT_MEDIA,
  DEFAULT_USERSCRIPT_PRESENTATION,
} from '../../userscript/application/presentation';
import {
  type InstalledUserscript,
  isUserscriptCoverImageDataUrl,
  isUserscriptCoverVideoDataUrl,
  type UserscriptPresentationMedia,
} from '../../userscript/domain/types';
import type { DeckCard } from './cards';

type CardPresentation = {
  accent: string;
  media: {
    kind: 'image';
    imageUrl: string;
  };
};

function stillImageUrl(image: string) {
  return image.startsWith('userscript-deck/') ? projectAssetUrl(image) : image;
}

// 卡面只作静态图片展示：预置素材直接取静图封面，不再输出视频地址。
function presentationMedia(media: CardMedia): CardPresentation {
  return {
    accent: media.accent,
    media: {
      kind: 'image',
      imageUrl: projectAssetUrl(media.poster),
    },
  };
}

const DEFAULT_PRESENTATION = presentationMedia(DEFAULT_USERSCRIPT_MEDIA);
const GAMEPAD_CONTROL_CARD_ART =
  'userscript-deck/card-art/preset-cards/08-gamepad-control.svg';
const NEW_TAB_CARD_ART = 'userscript-deck/card-art/system-cards/new-tab.svg';

const PRESENTATIONS: Readonly<Record<string, CardPresentation>> = {
  [DECK_STEWARD_CARD_ID]: presentationMedia(presetCardMedia('04-deck-steward')),
  [GAMEPAD_CONTROL_CARD_ID]: {
    accent: cardMediaAccent(GAMEPAD_CONTROL_CARD_ART),
    media: {
      kind: 'image',
      imageUrl: projectAssetUrl(GAMEPAD_CONTROL_CARD_ART),
    },
  },
  [CONTENT_BLOCKER_CARD_ID]: presentationMedia(
    presetCardMedia('01-content-blocking'),
  ),
  [PAGE_THEME_CARD_ID]: presentationMedia(presetCardMedia('02-page-theme')),
  [MEDIA_SPEED_CARD_ID]: presentationMedia(presetCardMedia('03-media-speed')),
  [MEDIA_RESOURCES_CARD_ID]: presentationMedia(
    presetCardMedia('09-media-resources'),
  ),
  [NEW_TAB_CARD_ID]: {
    accent: cardMediaAccent(NEW_TAB_CARD_ART),
    media: {
      kind: 'image',
      imageUrl: projectAssetUrl(NEW_TAB_CARD_ART),
    },
  },
  ...Object.fromEntries(
    BILIBILI_CAPABILITIES.map((definition) => [
      bilibiliCapabilityCardId(definition.id),
      presentationMedia(presetCardMedia(definition.mediaId)),
    ]),
  ),
};

function userscriptPresentationMedia(
  media: UserscriptPresentationMedia | undefined,
): CardPresentation['media'] {
  if (media?.kind === 'image') {
    return { kind: 'image', imageUrl: stillImageUrl(media.image) };
  }
  if (media?.kind === 'video') {
    // 早期数据里的自定义视频卡面：显示入库时抽好的那一帧静图。
    if (isUserscriptCoverVideoDataUrl(media.video)) {
      return {
        kind: 'image',
        imageUrl:
          media.poster && isUserscriptCoverImageDataUrl(media.poster)
            ? media.poster
            : stillImageUrl(DEFAULT_USERSCRIPT_MEDIA.poster),
      };
    }
    // 早期数据里的预置动态卡面：回到同一张预置静图。
    return presentationMedia(
      bundledCardMediaForVideo(media.video) ?? DEFAULT_USERSCRIPT_MEDIA,
    ).media;
  }
  return presentationMedia(DEFAULT_USERSCRIPT_MEDIA).media;
}

function cardPresentation(card: DeckCard) {
  if (card.kind === 'userscript') {
    const bundled =
      card.presentation?.media.kind === 'video'
        ? bundledCardMediaForVideo(card.presentation.media.video)
        : null;
    return {
      accent:
        bundled?.accent ??
        card.presentation?.accent ??
        DEFAULT_USERSCRIPT_PRESENTATION.accent,
      media: userscriptPresentationMedia(card.presentation?.media),
    };
  }
  return PRESENTATIONS[card.id] ?? DEFAULT_PRESENTATION;
}

export function cardAccent(card: DeckCard) {
  return cardPresentation(card).accent;
}

export function cardMedia(card: DeckCard) {
  return cardPresentation(card).media;
}

export function scriptPrimaryScope(card: InstalledUserscript) {
  return (
    card.manager.userMatches[0] ??
    card.manager.userIncludes[0] ??
    card.metadata.matches[0] ??
    card.metadata.includes[0] ??
    '未声明匹配范围'
  );
}
