/**
 * 新标签页壁纸的渲染值推导。
 *
 * 内置的新标签页用 CSS 变量描述壁纸，这里把它换算成可以直接写入行内样式的
 * 背景声明，供必应每日壁纸与预设壁纸共用。
 */

export type NewTabWallpaperVisual = {
  backgroundColor: string;
  imageCss: string;
  imageUrl: string;
  position: string;
  size: string;
};

function cssUrlValue(url: string) {
  const safe = url
    .replace(/\\/gu, '\\\\')
    .replace(/"/gu, '\\"')
    .replace(/\n|\r/gu, '');
  return `url("${safe}")`;
}

export function wallpaperUrlFromCssImage(value: string) {
  const pattern = /url\((?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'|([^)]*))\)/gu;
  let result = '';
  let match = pattern.exec(value);
  while (match) {
    result = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    match = pattern.exec(value);
  }
  return result.replace(/\\(["\\])/gu, '$1');
}

export function resolveNewTabWallpaperVisual(
  rootStyle: CSSStyleDeclaration,
  bodyStyle: CSSStyleDeclaration,
  preferredImageUrl = '',
): NewTabWallpaperVisual | null {
  const imageVariable = rootStyle
    .getPropertyValue('--x-nt-wallpaper-image')
    .trim();
  const imageUrl =
    preferredImageUrl.trim() ||
    wallpaperUrlFromCssImage(
      imageVariable && imageVariable !== 'none'
        ? imageVariable
        : bodyStyle.backgroundImage,
    );
  if (!imageUrl) return null;
  return {
    backgroundColor: bodyStyle.backgroundColor || '#111111',
    imageCss: cssUrlValue(imageUrl),
    imageUrl,
    position:
      rootStyle.getPropertyValue('--x-nt-wallpaper-position').trim() ||
      bodyStyle.backgroundPosition.split(',').at(-1)?.trim() ||
      'center center',
    size:
      rootStyle.getPropertyValue('--x-nt-wallpaper-size').trim() ||
      bodyStyle.backgroundSize.split(',').at(-1)?.trim() ||
      'cover',
  };
}
