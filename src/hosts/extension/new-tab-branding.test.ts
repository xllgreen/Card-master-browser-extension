import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const LOGO_PATH =
  'project-assets/userscript-deck/visual/action-icons/novabay-icon-128.png';

async function source(path: string) {
  return readFile(resolve(process.cwd(), path), 'utf8');
}

describe('new tab document branding', () => {
  it('uses neutral tab titles and the extension logo favicon', async () => {
    const [newTab, settings, runtime, client] = await Promise.all([
      source('extension/new-tab.html'),
      source('extension/new-tab-settings.html'),
      source('src/hosts/extension/new-tab-entry.ts'),
      source('src/hosts/extension/new-tab-client.ts'),
    ]);

    expect(newTab).toContain('<title>新标签页</title>');
    expect(settings).toContain('<title>新标签页设置</title>');
    expect(newTab).not.toContain('<title>万象星核</title>');
    expect(settings).not.toContain('新标签页设置 - 万象星核');
    expect(newTab).toContain(`href="${LOGO_PATH}"`);
    expect(settings).toContain(`href="${LOGO_PATH}"`);
    expect(client).toContain("type: 'new-tab-settings-open'");
    expect(runtime).toContain("const CARD_MASTER_BRAND_NAME = '万象星核';");
    expect(runtime).toContain("const NEW_TAB_TITLE = '新标签页';");
    expect(runtime).toContain('const CARD_MASTER_LOGO_PATH');
    expect(runtime).toContain(LOGO_PATH);
  });

  it('hovers the new tab wordmark from the icon onto the wide logo', async () => {
    const runtime = await source('src/hosts/extension/new-tab-entry.ts');
    expect(runtime).toContain('novabay-icon.svg');
    expect(runtime).toContain('novabay-logo.svg');
    expect(runtime).toContain('applyEmbeddedWordmark');
    expect(runtime).toContain('EMBEDDED_WORDMARK_ID');
    expect(runtime).toContain('> .x-nt-wordmark-brand:hover::before');
    expect(runtime).toContain('background-image: url(');
    expect(runtime).toContain(
      "addEventListener('click', muteActivation, true)",
    );
    expect(runtime).not.toContain('transition:');
    expect(runtime).not.toContain('animation:');
    // 悬停字标按宽度等比缩放：100% 就是方形 icon 的边长，不拉伸也不裁切。
    expect(runtime).toContain('background-size: 100% auto !important');
  });

  it('keeps the wide logo canvas tight to its artwork', async () => {
    const logo = await source(
      'assets/userscript-deck/visual/action-icons/novabay-logo.svg',
    );
    const box = logo.match(/viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/);
    expect(box).not.toBeNull();
    const ratio = Number(box?.[1]) / Number(box?.[2]);
    // 画布比例过宽说明又出现了大片透明留白，横版字标会缩得比 icon 还小。
    expect(ratio).toBeLessThanOrEqual(2.6);
  });

  it('hides the embedded recent sites and bookmark sections on demand', async () => {
    const runtime = await source('src/hosts/extension/new-tab-entry.ts');
    expect(runtime).toContain('EMBEDDED_RECENT_SECTION_ID');
    expect(runtime).toContain('EMBEDDED_BOOKMARK_SECTION_ID');
    expect(runtime).toContain('applyEmbeddedSectionVisibility');
    expect(runtime).toContain('display: none !important');
  });
});
