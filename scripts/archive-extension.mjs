import { basename } from 'node:path';

import {
  assertArchiveListingClean,
  assertReleaseDirectoryClean,
} from './release-artifacts.mjs';
import { createZipArchiveFromDirectory } from './zip-tree.mjs';

/**
 * 生成发布用的 ZIP。早期实现调用 macOS 的 ditto，在 Windows 与 Linux 上无法运行，
 * 现在改用纯 Node 写出，行为在各平台一致，也不会混入 AppleDouble 与 .DS_Store。
 */
export async function archiveExtension(source, destination) {
  await assertReleaseDirectoryClean(source);
  const listing = await createZipArchiveFromDirectory(source, destination);
  assertArchiveListingClean(listing.join('\n'), basename(destination));
  if (!listing.includes('manifest.json')) {
    throw new Error(
      `${basename(destination)} must contain manifest.json at its root.`,
    );
  }
  return listing;
}
