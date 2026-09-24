import { readdirSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const assetsRoot = fileURLToPath(new URL('../assets/', import.meta.url));

function assetFiles(directory = assetsRoot) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...assetFiles(absolutePath));
    else if (entry.isFile())
      files.push(relative(assetsRoot, absolutePath).split(sep).join('/'));
  }
  return files.sort();
}

const allAssetFiles = assetFiles();

/**
 * 卡面只作静态图片展示：userscript-deck/video 里的卡面视频留在仓库里当历史素材，
 * 但一律不随扩展分发，打包清单校验也按同样的前缀跳过它们。
 */
export const excludedRuntimeAssetPrefixes = ['userscript-deck/video/'];

export function isExcludedRuntimeAsset(asset) {
  return excludedRuntimeAssetPrefixes.some((prefix) =>
    asset.startsWith(prefix),
  );
}

// WebM plays everywhere except Safari, which ships the paired QuickTime movie.
const packagedForChromium = allAssetFiles.filter(
  (asset) => !asset.endsWith('.mov') && !isExcludedRuntimeAsset(asset),
);

export function extensionRuntimeAssetsFor(target) {
  if (target !== 'safari') return packagedForChromium;
  return packagedForChromium.map((asset) => asset.replace(/\.webm$/, '.mov'));
}

export const extensionRuntimeAssets = extensionRuntimeAssetsFor(
  process.env.EXTENSION_TARGET === 'safari' ? 'safari' : 'chromium',
);
