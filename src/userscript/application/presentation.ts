import { cardMediaAccent } from '../../generated/card-media-accents.generated';
import {
  bundledCardMediaForVideo,
  currentCardArtPath,
  USERSCRIPT_CARD_VARIANTS,
  type UserscriptCardVariant,
  userscriptCardMedia,
  userscriptCardVariantForMedia,
} from '../../lib/userscript-deck-media';
import {
  isUserscriptCoverImageDataUrl,
  type UserscriptPresentation,
} from '../domain/types';

export const DEFAULT_USERSCRIPT_MEDIA = userscriptCardMedia('1');

export const DEFAULT_USERSCRIPT_PRESENTATION = {
  accent: DEFAULT_USERSCRIPT_MEDIA.accent,
  media: {
    kind: 'image',
    image: DEFAULT_USERSCRIPT_MEDIA.poster,
  },
} as const satisfies UserscriptPresentation;

function bundledPresentation(
  variant: UserscriptCardVariant,
): UserscriptPresentation {
  const media = userscriptCardMedia(variant);
  return {
    accent: media.accent,
    media: { kind: 'image', image: media.poster },
  };
}

const USERSCRIPT_PRESENTATION_POOL =
  USERSCRIPT_CARD_VARIANTS.map(bundledPresentation);

/**
 * 卡面一律回到静图：内置卡面用它自己的封面，早期版本写成的动态卡面按视频路径
 * 对应回同一张封面，用户上传的动态封面则用入库时抽好的那一帧静图。
 * 实在认不出来的退回默认卡面，不留空白。
 */
export function presentationStillImage(
  presentation: UserscriptPresentation,
): string {
  const { media } = presentation;
  if (media.kind === 'image') {
    return media.image.startsWith('userscript-deck/card-art/')
      ? currentCardArtPath(media.image)
      : media.image;
  }
  const bundled = bundledCardMediaForVideo(media.video);
  if (bundled) return bundled.poster;
  return isUserscriptCoverImageDataUrl(media.poster)
    ? media.poster
    : DEFAULT_USERSCRIPT_MEDIA.poster;
}

export function resolveUserscriptPresentation(
  presentation: UserscriptPresentation,
): UserscriptPresentation {
  const image = presentationStillImage(presentation);
  return {
    accent: image.startsWith('userscript-deck/card-art/')
      ? cardMediaAccent(image)
      : presentation.accent,
    media: { kind: 'image', image },
  };
}

/** 对应回内置卡面变体，用于统计每套卡面被用了几次。 */
function bundledVariantOf(
  presentation: UserscriptPresentation,
): UserscriptCardVariant | null {
  return userscriptCardVariantForMedia(presentationStillImage(presentation));
}

export function allocateUserscriptPresentation(
  current: readonly UserscriptPresentation[] = [],
  random: () => number = Math.random,
): UserscriptPresentation {
  const usage = new Map<string, number>(
    USERSCRIPT_CARD_VARIANTS.map((variant) => [variant, 0] as const),
  );
  for (const presentation of current) {
    const variant = bundledVariantOf(presentation);
    if (variant && usage.has(variant)) {
      usage.set(variant, (usage.get(variant) ?? 0) + 1);
    }
  }
  const minimum = Math.min(...usage.values());
  const candidates = USERSCRIPT_PRESENTATION_POOL.filter((presentation) => {
    const variant = bundledVariantOf(presentation);
    return variant !== null && usage.get(variant) === minimum;
  });
  const index = Math.max(
    0,
    Math.min(candidates.length - 1, Math.floor(random() * candidates.length)),
  );
  const chosen = candidates[index] ?? bundledPresentation('1');
  return resolveUserscriptPresentation(chosen);
}
