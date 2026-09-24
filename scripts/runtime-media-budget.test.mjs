import { readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  EXTENSION_ICON_MASTER,
  EXTENSION_ICON_SIZES,
  renderExtensionIcon,
} from './extension-icons.mjs';
import { extensionRuntimeAssetsFor } from './extension-runtime-assets.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const cardArtRoot = resolve(root, 'assets/userscript-deck/card-art');

async function filesRecursively(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? filesRecursively(path) : [path];
    }),
  );
  return files.flat();
}

describe('runtime media budget', () => {
  it('ships every card cover as a vector master inside the size budget', async () => {
    const files = await filesRecursively(cardArtRoot);
    const posters = files.filter((path) => path.endsWith('.svg'));
    expect(posters).toHaveLength(26);
    for (const poster of posters) {
      expect((await stat(poster)).size).toBeLessThanOrEqual(64 * 1024);
    }
  });

  it('has retired every legacy webp card cover', async () => {
    const files = await filesRecursively(cardArtRoot);
    expect(files.filter((path) => path.endsWith('.webp'))).toEqual([]);
  });

  it('renders each manifest icon size from the single SVG master', async () => {
    const master = await sharp(EXTENSION_ICON_MASTER).metadata();
    expect(master.format).toBe('svg');
    for (const size of EXTENSION_ICON_SIZES) {
      const rendered = await renderExtensionIcon(size);
      const metadata = await sharp(rendered).metadata();
      expect(metadata.format).toBe('png');
      expect(metadata.width).toBe(size);
      expect(metadata.height).toBe(size);
    }
  });

  it('keeps every card cover video out of the packaged runtime', () => {
    const packaged = extensionRuntimeAssetsFor('chromium');

    expect(
      packaged.filter((asset) => asset.startsWith('userscript-deck/video/')),
    ).toEqual([]);
    expect(packaged.some((asset) => asset.endsWith('.svg'))).toBe(true);
  });
});
