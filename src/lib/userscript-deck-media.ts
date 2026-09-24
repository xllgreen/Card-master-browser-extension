import { cardMediaAccent } from '../generated/card-media-accents.generated';

const USERSCRIPT_CARD_COLLECTION = 'userscript-cards';
const PRESET_CARD_COLLECTION = 'preset-cards';
const PREINSTALLED_CARD_COLLECTION = 'preinstalled-cards';

export const PRESET_CARD_VARIANTS = [
  '01-content-blocking',
  '02-page-theme',
  '03-media-speed',
  '04-deck-steward',
  '05-bilibili-recommendation',
  '06-bilibili-danmaku',
  '07-bilibili-segments',
  '08-gamepad-control',
  '09-media-resources',
] as const;

export type PresetCardVariant = (typeof PRESET_CARD_VARIANTS)[number];

export const PREINSTALLED_CARD_VARIANTS = [
  '01-bilikit-core',
  '02-bilikit-feed',
  '03-bilibili-favorites-fix',
  '04-copying-lifted',
] as const;

export type PreinstalledCardVariant =
  (typeof PREINSTALLED_CARD_VARIANTS)[number];

/** 第一套自定义卡封面。 */
export const USERSCRIPT_CARD_THEME_ONE_VARIANTS = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
] as const;

/** 第二套自定义卡封面。 */
export const USERSCRIPT_CARD_THEME_TWO_VARIANTS = [
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
] as const;

export const USERSCRIPT_CARD_VARIANTS = [
  ...USERSCRIPT_CARD_THEME_ONE_VARIANTS,
  ...USERSCRIPT_CARD_THEME_TWO_VARIANTS,
] as const;

export type UserscriptCardVariant = (typeof USERSCRIPT_CARD_VARIANTS)[number];

export type CardMedia = Readonly<{
  /**
   * 卡面只作静态图片展示，界面不再播放视频。
   * 这里保留视频路径，是为了把早期版本写进数据的卡面对应回同一张静图。
   */
  video: string;
  poster: string;
  accent: string;
}>;

function cardArtPath(collection: string, variant: string) {
  return `userscript-deck/card-art/${collection}/${variant}.svg`;
}

function cardVideoPath(collection: string, variant: string) {
  return `userscript-deck/video/${collection}/${variant}.mp4`;
}

function cardMedia(
  collection: string,
  variant: string,
  video: string,
): CardMedia {
  const poster = cardArtPath(collection, variant);
  return {
    video,
    poster,
    accent: cardMediaAccent(poster),
  };
}

export function userscriptCardMedia(variant: UserscriptCardVariant): CardMedia {
  const legacyVideo = (
    USERSCRIPT_CARD_THEME_ONE_VARIANTS as readonly string[]
  ).includes(variant);
  return cardMedia(
    USERSCRIPT_CARD_COLLECTION,
    variant,
    legacyVideo
      ? cardVideoPath(USERSCRIPT_CARD_COLLECTION, variant.padStart(2, '0'))
      : '',
  );
}

export function presetCardMedia(variant: PresetCardVariant): CardMedia {
  return cardMedia(
    PRESET_CARD_COLLECTION,
    variant,
    cardVideoPath(PRESET_CARD_COLLECTION, variant),
  );
}

export function preinstalledCardMedia(
  variant: PreinstalledCardVariant,
): CardMedia {
  return cardMedia(
    PREINSTALLED_CARD_COLLECTION,
    variant,
    cardVideoPath(PREINSTALLED_CARD_COLLECTION, variant),
  );
}

/**
 * 早期版本把封面写成 .webp，自定义卡还是 01-06 编号。
 * 读取旧数据时就地改写成当前文件名，避免卡面空白。
 */
export function currentCardArtPath(path: string): string {
  const legacy = /^userscript-deck\/card-art\/([^/]+)\/(.+)\.webp$/.exec(path);
  if (!legacy) return path;
  const [, collection, variant] = legacy;
  const numeric = Number(variant);
  return cardArtPath(
    collection,
    collection === USERSCRIPT_CARD_COLLECTION && Number.isInteger(numeric)
      ? String(numeric)
      : variant,
  );
}

const BUNDLED_CARD_MEDIA_BY_VIDEO = new Map<string, CardMedia>();
const USERSCRIPT_VARIANT_BY_MEDIA_PATH = new Map<
  string,
  UserscriptCardVariant
>();

for (const variant of USERSCRIPT_CARD_VARIANTS) {
  const media = userscriptCardMedia(variant);
  USERSCRIPT_VARIANT_BY_MEDIA_PATH.set(media.poster, variant);
  if (media.video) {
    USERSCRIPT_VARIANT_BY_MEDIA_PATH.set(media.video, variant);
  }
}

for (const media of [
  ...USERSCRIPT_CARD_VARIANTS.map(userscriptCardMedia),
  ...PRESET_CARD_VARIANTS.map(presetCardMedia),
  ...PREINSTALLED_CARD_VARIANTS.map(preinstalledCardMedia),
]) {
  if (media.video) {
    BUNDLED_CARD_MEDIA_BY_VIDEO.set(media.video, media);
  }
}

export function bundledCardMediaForVideo(
  video: string | null | undefined,
): CardMedia | null {
  if (!video) return null;
  return BUNDLED_CARD_MEDIA_BY_VIDEO.get(video) ?? null;
}

export function userscriptCardVariantForMedia(
  mediaPath: string,
): UserscriptCardVariant | null {
  return USERSCRIPT_VARIANT_BY_MEDIA_PATH.get(mediaPath) ?? null;
}
