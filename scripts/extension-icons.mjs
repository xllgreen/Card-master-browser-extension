import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** 唯一的项目图标母图：仓库里只保留这一份 SVG，其余尺寸在打包时现场生成。 */
export const EXTENSION_ICON_MASTER_ASSET =
  'userscript-deck/visual/action-icons/novabay-icon.svg';

export const EXTENSION_ICON_MASTER = resolve(
  root,
  'assets',
  EXTENSION_ICON_MASTER_ASSET,
);

export const EXTENSION_ICON_SIZES = Object.freeze([16, 32, 48, 128]);

/** Manifest V3 的 icons 与 default_icon 不接受 SVG，所以产物里写的是栅格化 PNG。 */
export function extensionIconAsset(size) {
  return `userscript-deck/visual/action-icons/novabay-icon-${size}.png`;
}

export function extensionIconManifest() {
  return Object.fromEntries(
    EXTENSION_ICON_SIZES.map((size) => [
      String(size),
      `project-assets/${extensionIconAsset(size)}`,
    ]),
  );
}

export async function renderExtensionIcon(size) {
  const master = await readFile(EXTENSION_ICON_MASTER);
  return sharp(master, { density: 576 })
    .resize(size, size, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export async function writeExtensionIcons(outputRoot) {
  for (const size of EXTENSION_ICON_SIZES) {
    const destination = resolve(
      outputRoot,
      'project-assets',
      extensionIconAsset(size),
    );
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, await renderExtensionIcon(size));
  }
  return EXTENSION_ICON_SIZES.map(extensionIconAsset);
}
