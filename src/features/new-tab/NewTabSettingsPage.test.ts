import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  NewTabModeNotice,
  newTabSettingsCapabilities,
  visibleNewTabSettingsSections,
} from './NewTabSettingsPage';

describe('new tab ownership copy', () => {
  it('explains the standard package and provides an actual release link', () => {
    const html = renderToStaticMarkup(
      createElement(NewTabModeNotice, { overridesBrowserNewTab: true }),
    );
    expect(html).toContain('当前使用万象星核新标签页');
    expect(html).toContain('保留浏览器新标签页版');
    expect(html).toContain(
      'https://github.com/LYiHub/Card-master-browser-extension-public/releases/latest',
    );
    expect(html).toContain('不要卸载扩展或清除数据');
  });

  it('makes it clear that the browser-managed package does not own new tabs', () => {
    const html = renderToStaticMarkup(
      createElement(NewTabModeNotice, { overridesBrowserNewTab: false }),
    );
    expect(html).toContain('当前版本不接管浏览器新标签页');
    expect(html).toContain('手动打开的万象星核页面');
    expect(html).not.toContain('当前使用万象星核新标签页');
  });
});

describe('new tab wallpaper mode readiness', () => {
  const source = readFileSync(
    new URL('./NewTabSettingsPage.tsx', import.meta.url),
    'utf8',
  );
  const styles = readFileSync(
    new URL('./new-tab-settings.css', import.meta.url),
    'utf8',
  );

  it('offers only the default and Bing wallpaper sources', () => {
    const tabs = source.slice(
      source.indexOf('aria-label="壁纸来源" role="tablist"'),
    );
    expect(tabs.indexOf('默认壁纸')).toBeLessThan(tabs.indexOf('必应每日壁纸'));
    expect(tabs).toContain("selectWallpaperSource('default')");
    expect(tabs).toContain("selectWallpaperSource('bing')");
    expect(tabs).toContain('wallpaperSourcePanel ===');
    expect(tabs).not.toContain('daily-review');
    expect(source).not.toContain('每日回顾');
    expect(source).not.toContain('dailyReview');
  });

  it('reports the Bing wallpaper state with an immediate refresh action', () => {
    const panel = source.slice(source.indexOf('aria-label="必应每日壁纸设置"'));
    expect(panel).toContain('bingWallpaperQuality');
    expect(panel).toContain('立即更新');
    expect(panel).toContain('refreshBingWallpaper');
    expect(panel).toContain('bingError');
    expect(source).toContain('todayBingWallpaper(bingSnapshot)');
    expect(source).toContain('bingWallpaper.subscribe(load)');
    expect(source).toContain('BING_WALLPAPER_QUALITY_OPTIONS.map');
  });

  it('exposes the model service, credential and WebDAV sync controls', () => {
    const panel = source.slice(
      source.indexOf('<SettingsContentSection id="ai" label="AI 服务">'),
    );
    expect(panel).toContain('API 请求地址');
    expect(panel).toContain('API 密钥');
    expect(panel).toContain('MODEL_SERVICE_BASE_URL_PRESETS.map');
    expect(panel).toContain('MODEL_SERVICE_PRESETS.map');
    expect(panel).toContain('推理强度');
    expect(panel).toContain('接口协议');
    expect(panel).toContain('API 密钥随 WebDAV 同步');
    expect(panel).toContain('saveAiServices');
    expect(panel).toContain('testAiServices');
    expect(panel).toContain('clearAiCredential');
    expect(source).toContain('aiSecretsSync');
    expect(panel).toContain('updateSyncSecrets');
    expect(source).toContain('.readServices()');
    expect(source).toContain('AI_PROTOCOL_OPTIONS.map');
    expect(source).toContain('AI_REASONING_OPTIONS.map');
  });

  it('keeps the Bing panel inside the shared wallpaper state styling', () => {
    expect(styles).toContain('.cm-new-tab-wallpaper-mode-state');
    expect(styles).toContain('overflow-anchor: none;');
  });

  it('keeps AI setup messages out of the default wallpaper panel', () => {
    expect(source).toContain("wallpaperSourcePanel === 'default'");
    expect(source).toContain('aria-label="默认壁纸设置"');
    expect(source).toContain('aria-label="壁纸颜色模式"');
    expect(source).toContain('NEW_TAB_BUILTIN_WALLPAPERS.map');
    expect(source).not.toContain('无壁纸');
    expect(source).toContain('className="cm-new-tab-wallpaper-check"');
    expect(source).toContain('localWallpapers.map');
    expect(source).toContain('wallpaper.thumbnailDataUrl');
    expect(source).toContain('.readAll()');
    expect(source).not.toContain("'local'");
    expect(source).not.toContain('每日回顾图片规格');
  });

  it('uses the upstream wallpaper control hierarchy for filters', () => {
    expect(source).toContain('className="cm-new-tab-wallpaper-effect-tabs"');
    expect(source).toContain("preferences.wallpaperEffect !== 'none'");
    expect(source).toContain("preferences.wallpaperEffect === 'halftone'");
    expect(styles).toContain(
      'grid-template-columns: repeat(3, minmax(0, 1fr));',
    );
    expect(styles).toMatch(
      /\.cm-new-tab-wallpaper-picker\s+\[data-selected="true"\]/u,
    );
    expect(styles).toMatch(
      /\.cm-new-tab-wallpaper-tone-tab\[data-selected="true"\]/u,
    );
    expect(styles).toContain('.cm-new-tab-wallpaper-current');
  });

  it('gives the active settings category an unmistakable filled state', () => {
    expect(styles).toContain(
      '.cm-new-tab-settings-layout > nav button[data-selected="true"]',
    );
    expect(styles).toContain('background: var(--cm-nt-accent);');
    expect(styles).toContain('color: #fff;');
  });

  it('hides bookmark, favicon and history home settings on Safari', () => {
    const safari = visibleNewTabSettingsSections(
      newTabSettingsCapabilities('safari'),
    ).map((item) => item.id);
    expect(safari).toEqual([
      'general',
      'ai',
      'appearance',
      'wallpaper',
      'search',
      'engines',
      'blacklist',
      'shortcuts',
      'about',
    ]);
    expect(
      visibleNewTabSettingsSections(newTabSettingsCapabilities('firefox')).map(
        (item) => item.id,
      ),
    ).not.toContain('favicons');
    expect(
      visibleNewTabSettingsSections(newTabSettingsCapabilities('chromium')).map(
        (item) => item.id,
      ),
    ).toContain('favicons');
  });

  it('renders one continuous settings document with linked scroll navigation', () => {
    expect(source).toContain(
      '<SettingsContentSection id="general" label="常规">',
    );
    expect(source).toContain(
      '<SettingsContentSection id="wallpaper" label="壁纸">',
    );
    expect(source).toContain(
      '<SettingsContentSection id="favicons" label="图标与主题色">',
    );
    expect(source).not.toContain("{section === 'general'");
    expect(source).not.toContain("{section === 'wallpaper'");
    expect(source).toContain('scrollIntoView({');
    expect(source).toContain('window.location.hash ===');
    expect(source).toContain('settingsSectionDomId(item.id)');
    expect(source).toContain("behavior: 'auto'");
    expect(source).toContain('new ResizeObserver(scheduleUpdate)');
    expect(source).toContain('onClick={() => scrollToSection(item.id)}');
    expect(styles).toContain('scroll-margin-top: 104px;');
    expect(styles).toMatch(
      /body,\s*#new-tab-settings-root\s*\{[^}]*overflow: visible;/u,
    );
    expect(styles).toContain(
      '.cm-new-tab-settings-section[data-settings-section="wallpaper"]',
    );
  });

  it('offers a hidden display mode for the recent sites and bookmarks', () => {
    expect(source.split('label="显示模式"')).toHaveLength(3);
    expect(source.split('<option value="hidden">不显示</option>')).toHaveLength(
      3,
    );
    const home = source.slice(
      source.indexOf('<SettingsContentSection id="home" label="首页内容">'),
    );
    expect(home).toContain("'recentMode',");
    const bookmarks = source.slice(
      source.indexOf('<SettingsContentSection id="bookmarks" label="书签">'),
    );
    expect(bookmarks).toContain("'bookmarkMode',");
  });

  it('ends the settings document with the project credits', () => {
    expect(source).toContain(
      '<SettingsContentSection id="about" label="关于">',
    );
    expect(source).toContain('版本 {version}（开发版）');
    expect(source).toContain('一舱统御脚本、AI、视频与同步。');
    expect(source).toContain('https://blog.medicalstu.cn');
    expect(source).toContain('XLL Studio 官网');
    expect(source).toContain('查看原项目');
    expect(
      source.indexOf('<SettingsContentSection id="about"'),
    ).toBeGreaterThan(source.indexOf('<SettingsContentSection id="favicons"'));
    expect(styles).toContain(
      'data-settings-section="about"] {\n  order: 12;\n}',
    );
    expect(styles).toContain('max-height: calc(100vh - 112px);');
    expect(styles).toContain('overflow-y: auto;');
  });
});
