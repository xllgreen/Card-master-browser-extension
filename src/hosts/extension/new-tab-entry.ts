import {
  GLOBAL_LIBRARY_ALIVE_ATTRIBUTE,
  GLOBAL_LIBRARY_DISPOSE_EVENT,
  GLOBAL_LIBRARY_GENERATION_ATTRIBUTE,
  GLOBAL_LIBRARY_HOST_ID,
  GLOBAL_LIBRARY_OPEN_EVENT,
} from '../../features/global-library/lifecycle';
import {
  BING_WALLPAPER_STORAGE_KEY,
  bingWallpaperImageUrl,
  parseBingWallpaperSnapshot,
  todayBingWallpaper,
} from '../../new-tab/application/bing-wallpaper';
import {
  LUMNO_BOOKMARK_VIEW_MODE_STORAGE_KEY,
  LUMNO_LOCAL_WALLPAPER_STORAGE_KEY,
  LUMNO_NEW_TAB_SEARCH_WIDTH_STORAGE_KEY,
  LUMNO_RECENT_MODE_STORAGE_KEY,
  LUMNO_WALLPAPER_EFFECT_STORAGE_KEY,
  LUMNO_WALLPAPER_OVERLAY_STORAGE_KEY,
  LUMNO_WALLPAPER_STORAGE_KEY,
  NEW_TAB_PREFERENCES_STORAGE_KEY,
  NEW_TAB_SYNC_STORAGE_KEY,
  type NewTabPreferences,
  NewTabPreferencesRepository,
} from '../../new-tab/application/preferences';
import { resolveNewTabWallpaperVisual } from '../../new-tab/application/wallpaper-visual';
import {
  type ExtensionApi,
  type ExtensionMessageListener,
  requireExtensionApi,
  sendExtensionTransportRequest,
} from './api';
import { reportExtensionFailure } from './diagnostics';
import { EXTENSION_CHANNEL } from './extension-channel';
import { extensionOverridesNewTab } from './extension-runtime-api';
import {
  isExtensionPageGlobalLibraryDeliveryMessage,
  markGlobalLibraryInjection,
  signalInjectedGlobalLibraryHost,
} from './global-library-host';

const NEW_TAB_TITLE = '新标签页';
const CARD_MASTER_BRAND_NAME = '万象星核';
const CARD_MASTER_LOGO_PATH =
  'project-assets/userscript-deck/visual/action-icons/novabay-icon-128.png';
const WORDMARK_ICON_PATH =
  'project-assets/userscript-deck/visual/action-icons/novabay-icon.svg';
const WORDMARK_LOGO_PATH =
  'project-assets/userscript-deck/visual/action-icons/novabay-logo.svg';
const DOCUMENT_ICON_ATTRIBUTE = 'data-card-master-new-tab-icon';
const EMBEDDED_BRANDING_STYLE_ID = 'card-master-new-tab-branding';
const EMBEDDED_WORDMARK_ID = '_x_extension_newtab_wordmark_2026_unique_';
const EMBEDDED_RECENT_SECTION_ID =
  '_x_extension_newtab_recent_sites_2024_unique_';
const EMBEDDED_BOOKMARK_SECTION_ID =
  '_x_extension_newtab_bookmarks_2024_unique_';
const WORDMARK_MUTED_ATTRIBUTE = 'data-novabay-wordmark-muted';
const SECTION_VISIBILITY_STYLE_ID = 'novabay-new-tab-section-visibility';
const SECTION_VISIBILITY_ATTRIBUTE = 'data-novabay-hidden-sections';
const BING_WALLPAPER_BODY_ATTRIBUTE = 'data-novabay-bing-wallpaper';
const UPSTREAM_VISIBLE_SELECTORS = [
  '.x-nt-feedback-control',
  '.x-lumno-feature-hint--update-notice-newtab',
  '.x-lumno-feature-hint--engagement-notice',
].join(',');
const UPSTREAM_HOSTS = new Set([
  'lumno.kubai.design',
  'github.com',
  'x.com',
  'chromewebstore.google.com',
]);

function cardMasterLogoUrl(api: ExtensionApi) {
  return api.runtime.getURL(CARD_MASTER_LOGO_PATH);
}

function wordmarkAssetUrl(api: ExtensionApi, path: string) {
  return api.runtime.getURL(path);
}

function applyDocumentBranding(document: Document, logoUrl: string) {
  if (document.title !== NEW_TAB_TITLE) document.title = NEW_TAB_TITLE;
  const relations = ['icon', 'shortcut icon'] as const;
  document.head
    .querySelectorAll<HTMLLinkElement>(
      `link[rel~="icon"]:not([${DOCUMENT_ICON_ATTRIBUTE}])`,
    )
    .forEach((icon) => {
      icon.remove();
    });
  for (const relation of relations) {
    let icon = document.head.querySelector<HTMLLinkElement>(
      `link[${DOCUMENT_ICON_ATTRIBUTE}="${relation}"]`,
    );
    if (!icon) {
      icon = document.createElement('link');
      icon.setAttribute(DOCUMENT_ICON_ATTRIBUTE, relation);
      document.head.append(icon);
    }
    if (icon.rel !== relation) icon.rel = relation;
    if (icon.type !== 'image/png') icon.type = 'image/png';
    if (icon.hasAttribute('sizes')) icon.removeAttribute('sizes');
    if (icon.href !== logoUrl) icon.href = logoUrl;
  }
}

function applyEmbeddedWordmark(
  document: Document,
  iconUrl: string,
  logoUrl: string,
) {
  let style = document.getElementById(EMBEDDED_BRANDING_STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = EMBEDDED_BRANDING_STYLE_ID;
    style.textContent = `
      #${EMBEDDED_WORDMARK_ID} > .x-nt-wordmark-brand {
        width: 92px !important;
        height: 92px !important;
        gap: 0 !important;
        color: transparent !important;
        cursor: default !important;
        font-size: 0 !important;
        font-weight: 400 !important;
        letter-spacing: 0 !important;
        line-height: 1 !important;
      }
      #${EMBEDDED_WORDMARK_ID}[data-visible="true"]:has(> .x-nt-wordmark-brand) {
        height: 92px !important;
        max-height: 92px !important;
        overflow: visible !important;
      }
      #${EMBEDDED_WORDMARK_ID} > .x-nt-wordmark-brand::before {
        width: 92px;
        height: 92px;
        flex: 0 0 92px;
        background: url("${iconUrl}") center / contain no-repeat;
        content: "";
      }
      /*
       * 悬停只在方形字标本身触发，换成横版字标，不加任何过渡动效。
       * 横版字标按宽度驱动等比缩放：100% 就是字标框的宽度，也就是方形
       * icon 的边长，高度由图片自身比例换算，因此不会拉伸也不会裁切。
       */
      #${EMBEDDED_WORDMARK_ID} > .x-nt-wordmark-brand:hover::before {
        background-image: url("${logoUrl}") !important;
        background-size: 100% auto !important;
        background-position: center !important;
        background-repeat: no-repeat !important;
      }
      #${EMBEDDED_WORDMARK_ID} .x-nt-wordmark-image,
      #${EMBEDDED_WORDMARK_ID} .x-nt-wordmark-solid {
        display: none !important;
      }
:root,
[data-theme],
.x-nt-page {
  --x-nt-panel-blur: 38px !important;
  --x-nt-panel-saturate: 190% !important;
  --x-nt-panel-border: rgba(255, 255, 255, 0.16) !important;
  --x-nt-panel-shadow: 0 24px 64px rgba(0, 0, 0, 0.3) !important;
  --x-nt-panel-shadow-focus: 0 28px 72px rgba(0, 0, 0, 0.34) !important;
  --x-nt-search-shell-radius: 30px !important;
  --x-nt-search-shell-top-radius: 26px !important;
  --x-nt-bookmark-card-blur: 26px !important;
  --x-nt-bookmark-card-blur-hover: 34px !important;
  --x-nt-bookmarks-topbar-blur: 30px !important;
  --x-nt-bookmarks-topbar-saturate: 180% !important;
  --x-nt-bookmarks-topbar-border: rgba(255, 255, 255, 0.14) !important;
}
:root:not([data-theme="dark"]) {
  --x-nt-panel-bg: rgba(255, 255, 255, 0.58) !important;
  --x-nt-bookmarks-topbar-surface: rgba(255, 255, 255, 0.46) !important;
  --x-nt-bookmarks-topbar-terminal-surface: rgba(255, 255, 255, 0.52) !important;
}
:root[data-theme="dark"] {
  --x-nt-panel-bg: rgba(18, 20, 24, 0.5) !important;
  --x-nt-bookmarks-topbar-surface: rgba(18, 20, 24, 0.42) !important;
  --x-nt-bookmarks-topbar-terminal-surface: rgba(18, 20, 24, 0.48) !important;
}
.x-nt-shortcut-tile,
.x-nt-bookmark-card,
.x-nt-recent-card {
  border-radius: 22px !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
}
      ${UPSTREAM_VISIBLE_SELECTORS},
      a[href*="lumno.kubai.design"],
      a[href*="github.com/kubai087/lumno-extension"],
      a[href*="x.com/kubai087"],
      a[href*="chromewebstore.google.com/detail/lumno-"] {
        display: none !important;
      }
    `;
    document.head.append(style);
  }
  const wordmark = document.querySelector<HTMLElement>(
    `#${EMBEDDED_WORDMARK_ID} > .x-nt-wordmark-brand`,
  );
  if (wordmark?.getAttribute('aria-label') !== CARD_MASTER_BRAND_NAME) {
    wordmark?.setAttribute('aria-label', CARD_MASTER_BRAND_NAME);
  }
  if (wordmark && wordmark.tabIndex !== -1) wordmark.tabIndex = -1;
  if (wordmark && !wordmark.hasAttribute(WORDMARK_MUTED_ATTRIBUTE)) {
    wordmark.setAttribute(WORDMARK_MUTED_ATTRIBUTE, '1');
    const muteActivation = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    wordmark.addEventListener('click', muteActivation, true);
    wordmark.addEventListener('auxclick', muteActivation, true);
  }
}

function upstreamUrl(value: string) {
  try {
    const url = new URL(value);
    if (!UPSTREAM_HOSTS.has(url.hostname)) return false;
    if (url.hostname === 'github.com') {
      return url.pathname.startsWith('/kubai087/lumno-extension');
    }
    if (url.hostname === 'x.com') return url.pathname.startsWith('/kubai087');
    if (url.hostname === 'chromewebstore.google.com') {
      return url.pathname.includes('/lumno-');
    }
    return true;
  } catch {
    return false;
  }
}

function replaceVisibleUpstreamBranding(document: Document) {
  for (const element of document.querySelectorAll<HTMLElement>(
    '[aria-label],[title],[data-tooltip],[alt]',
  )) {
    for (const attribute of ['aria-label', 'title', 'data-tooltip', 'alt']) {
      const value = element.getAttribute(attribute);
      if (!value || !/lumno/iu.test(value)) continue;
      element.setAttribute(
        attribute,
        value.replace(/lumno/giu, CARD_MASTER_BRAND_NAME),
      );
    }
  }
  if (!document.body) return;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (
      parent &&
      parent.tagName !== 'SCRIPT' &&
      parent.tagName !== 'STYLE' &&
      /lumno/iu.test(node.textContent ?? '')
    ) {
      node.textContent = (node.textContent ?? '').replace(
        /lumno/giu,
        CARD_MASTER_BRAND_NAME,
      );
    }
    node = walker.nextNode();
  }
}

function removeVisibleUpstreamTraces(document: Document) {
  document.querySelectorAll(UPSTREAM_VISIBLE_SELECTORS).forEach((element) => {
    element.remove();
  });
  document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((anchor) => {
    if (upstreamUrl(anchor.href)) anchor.remove();
  });
  replaceVisibleUpstreamBranding(document);
}

function installEmbeddedNewTabBranding(
  frame: HTMLIFrameElement,
  api: ExtensionApi,
) {
  let observer: MutationObserver | null = null;
  frame.addEventListener('load', () => {
    observer?.disconnect();
    const document = frame.contentDocument;
    if (!document?.head || !document.documentElement) return;
    const faviconUrl = cardMasterLogoUrl(api);
    const iconUrl = wordmarkAssetUrl(api, WORDMARK_ICON_PATH);
    const wordmarkLogoUrl = wordmarkAssetUrl(api, WORDMARK_LOGO_PATH);
    const apply = () => {
      applyDocumentBranding(document, faviconUrl);
      applyEmbeddedWordmark(document, iconUrl, wordmarkLogoUrl);
      removeVisibleUpstreamTraces(document);
    };
    apply();
    observer = new MutationObserver(apply);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['aria-label', 'href'],
      childList: true,
      subtree: true,
    });
  });
}

type WallpaperLayout = Pick<
  NewTabPreferences,
  'wallpaperFit' | 'wallpaperPosition'
>;

function wallpaperPositionValue(
  position: WallpaperLayout['wallpaperPosition'],
) {
  switch (position) {
    case 'top':
      return 'center top';
    case 'bottom':
      return 'center bottom';
    case 'left':
      return 'left center';
    case 'right':
      return 'right center';
    default:
      return 'center center';
  }
}

function applyWallpaperLayout(
  embeddedDocument: Document,
  layout: WallpaperLayout,
) {
  const root = embeddedDocument.documentElement;
  root.style.setProperty('--x-nt-wallpaper-size', layout.wallpaperFit);
  root.style.setProperty(
    '--x-nt-wallpaper-position',
    wallpaperPositionValue(layout.wallpaperPosition),
  );
}

function setImportantStyle(element: HTMLElement, name: string, value: string) {
  element.style.setProperty(name, value, 'important');
}

function applyBingWallpaper(
  embeddedDocument: Document,
  embeddedWindow: Window,
  imageUrl: string,
) {
  const root = embeddedDocument.documentElement;
  const body = embeddedDocument.body;
  const visual = resolveNewTabWallpaperVisual(
    embeddedWindow.getComputedStyle(root),
    embeddedWindow.getComputedStyle(body),
    imageUrl,
  );
  if (!visual) {
    throw new Error('必应每日壁纸无法转换为新标签页背景。');
  }
  setImportantStyle(root, 'background-image', visual.imageCss);
  setImportantStyle(root, 'background-size', visual.size);
  setImportantStyle(root, 'background-position', visual.position);
  setImportantStyle(root, 'background-repeat', 'no-repeat');
  setImportantStyle(root, 'background-attachment', 'fixed');
  setImportantStyle(body, 'background-color', 'transparent');
  setImportantStyle(
    body,
    'background-image',
    'var(--x-nt-wallpaper-overlay, none)',
  );
  setImportantStyle(body, 'background-size', 'cover');
  setImportantStyle(body, 'background-position', 'center center');
  setImportantStyle(body, 'background-repeat', 'no-repeat');
  setImportantStyle(body, 'background-attachment', 'fixed');
  body.setAttribute(BING_WALLPAPER_BODY_ATTRIBUTE, 'true');
  root.dataset.wallpaperActive = 'true';
  body.dataset.wallpaperActive = 'true';
}

function clearBingWallpaper(embeddedDocument: Document) {
  const root = embeddedDocument.documentElement;
  const body = embeddedDocument.body;
  for (const name of [
    'background-image',
    'background-size',
    'background-position',
    'background-repeat',
    'background-attachment',
  ]) {
    root.style.removeProperty(name);
  }
  for (const name of [
    'background-color',
    'background-image',
    'background-size',
    'background-position',
    'background-repeat',
    'background-attachment',
  ]) {
    body.style.removeProperty(name);
  }
  body.removeAttribute(BING_WALLPAPER_BODY_ATTRIBUTE);
}

function requestBingWallpaperRefresh(api: ExtensionApi) {
  void sendExtensionTransportRequest(api, {
    channel: EXTENSION_CHANNEL,
    type: 'new-tab-bing-wallpaper-refresh',
  }).catch(() => {
    // 后台暂不可用：保留上一次的壁纸，下次打开新标签页会再试。
  });
}

function embeddedNewTabDocument(frame: HTMLIFrameElement) {
  const embeddedDocument = frame.contentDocument;
  const embeddedWindow = frame.contentWindow;
  if (
    !embeddedDocument?.body ||
    !embeddedDocument.documentElement ||
    !embeddedWindow
  ) {
    return null;
  }
  return { document: embeddedDocument, window: embeddedWindow };
}

function installBingWallpaper(
  frame: HTMLIFrameElement,
  api: ExtensionApi,
  preferencesRepository: NewTabPreferencesRepository,
) {
  let destroyed = false;
  let applying = Promise.resolve();

  const apply = () => {
    applying = applying
      .then(async () => {
        const target = embeddedNewTabDocument(frame);
        if (!target || destroyed) return;
        const preferences = await preferencesRepository.read();
        if (!preferences.wallpaperSource) return;
        applyWallpaperLayout(target.document, preferences);
        if (preferences.wallpaperSource !== 'bing') {
          clearBingWallpaper(target.document);
          return;
        }
        const stored = await api.storage.local.get(BING_WALLPAPER_STORAGE_KEY);
        const snapshot = parseBingWallpaperSnapshot(
          stored[BING_WALLPAPER_STORAGE_KEY],
        );
        const image = todayBingWallpaper(snapshot);
        if (!image) {
          requestBingWallpaperRefresh(api);
          return;
        }
        applyBingWallpaper(
          target.document,
          target.window,
          bingWallpaperImageUrl(image, preferences.bingWallpaperQuality),
        );
      })
      .catch((error) =>
        reportExtensionFailure(
          'new-tab-entry',
          'bing-wallpaper-apply-failed',
          error,
        ),
      );
    return applying;
  };

  const onLoad = () => {
    void apply();
  };
  frame.addEventListener('load', onLoad);

  const bingStorageKeys = new Set([
    BING_WALLPAPER_STORAGE_KEY,
    NEW_TAB_PREFERENCES_STORAGE_KEY,
    NEW_TAB_SYNC_STORAGE_KEY,
  ]);
  const onStorageChanged = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== 'local' && areaName !== 'sync') return;
    if (Object.keys(changes).some((key) => bingStorageKeys.has(key))) {
      void apply();
    }
  };
  api.storage.onChanged.addListener(onStorageChanged);
  requestBingWallpaperRefresh(api);

  window.addEventListener(
    'pagehide',
    () => {
      destroyed = true;
      frame.removeEventListener('load', onLoad);
      api.storage.onChanged.removeListener(onStorageChanged);
    },
    { once: true },
  );
}

function applyEmbeddedSectionVisibility(
  embeddedDocument: Document,
  preferences: NewTabPreferences,
) {
  const hidden: string[] = [];
  if (preferences.recentMode === 'hidden')
    hidden.push(EMBEDDED_RECENT_SECTION_ID);
  if (preferences.bookmarkMode === 'hidden')
    hidden.push(EMBEDDED_BOOKMARK_SECTION_ID);
  const signature = hidden.join(' ');
  const root = embeddedDocument.documentElement;
  if (root.getAttribute(SECTION_VISIBILITY_ATTRIBUTE) === signature) return;
  root.setAttribute(SECTION_VISIBILITY_ATTRIBUTE, signature);
  let style = embeddedDocument.getElementById(SECTION_VISIBILITY_STYLE_ID);
  if (!style) {
    style = embeddedDocument.createElement('style');
    style.id = SECTION_VISIBILITY_STYLE_ID;
    embeddedDocument.head?.append(style);
  }
  style.textContent = hidden
    .map((id) => `#${id} { display: none !important; }`)
    .join('\n');
}

function installNewTabSectionVisibility(
  frame: HTMLIFrameElement,
  api: ExtensionApi,
  preferencesRepository: NewTabPreferencesRepository,
) {
  let destroyed = false;
  let applying = Promise.resolve();

  const apply = () => {
    applying = applying
      .then(async () => {
        const target = embeddedNewTabDocument(frame);
        if (!target || destroyed) return;
        const preferences = await preferencesRepository.read();
        applyEmbeddedSectionVisibility(target.document, preferences);
      })
      .catch((error) =>
        reportExtensionFailure(
          'new-tab-entry',
          'section-visibility-apply-failed',
          error,
        ),
      );
    return applying;
  };

  const onLoad = () => {
    void apply();
  };
  frame.addEventListener('load', onLoad);

  const preferenceKeys = new Set([
    NEW_TAB_PREFERENCES_STORAGE_KEY,
    NEW_TAB_SYNC_STORAGE_KEY,
  ]);
  const onStorageChanged = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== 'local' && areaName !== 'sync') return;
    if (Object.keys(changes).some((key) => preferenceKeys.has(key))) {
      void apply();
    }
  };
  api.storage.onChanged.addListener(onStorageChanged);

  window.addEventListener(
    'pagehide',
    () => {
      destroyed = true;
      frame.removeEventListener('load', onLoad);
      api.storage.onChanged.removeListener(onStorageChanged);
    },
    { once: true },
  );
}

async function openConfiguredNewTab(api: ExtensionApi) {
  const frame = document.getElementById('card-master-new-tab-frame');
  if (!(frame instanceof HTMLIFrameElement)) {
    throw new Error('新标签页缺少内置页面挂载节点。');
  }
  installEmbeddedNewTabBranding(frame, api);
  installBingWallpaper(frame, api, preferencesRepository);
  installNewTabSectionVisibility(frame, api, preferencesRepository);
  const preferences = await preferencesRepository.read();
  if (extensionOverridesNewTab() && preferences.destinationUrl) {
    location.replace(preferences.destinationUrl);
    return;
  }
  try {
    await preferencesRepository.synchronize(preferences);
  } catch (error) {
    reportExtensionFailure(
      'new-tab-entry',
      'runtime-preferences-sync-failed',
      error,
    );
  }
  const embeddedUrl = new URL(api.runtime.getURL('src/newtab/newtab.html'));
  if (new URL(location.href).searchParams.get('focus') === '1') {
    embeddedUrl.searchParams.set('focus', '1');
  }
  frame.src = embeddedUrl.toString();
}

function installRuntimeWallpaperPreferenceSync(
  repository: NewTabPreferencesRepository,
) {
  let wallpaperSyncTimer = 0;
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== 'local' && areaName !== 'sync') return;
    const wallpaper = changes[LUMNO_WALLPAPER_STORAGE_KEY];
    const localWallpaper = changes[LUMNO_LOCAL_WALLPAPER_STORAGE_KEY];
    const overlay = changes[LUMNO_WALLPAPER_OVERLAY_STORAGE_KEY];
    const effect = changes[LUMNO_WALLPAPER_EFFECT_STORAGE_KEY];
    const searchWidth = changes[LUMNO_NEW_TAB_SEARCH_WIDTH_STORAGE_KEY];
    const recentMode = changes[LUMNO_RECENT_MODE_STORAGE_KEY];
    const bookmarkMode = changes[LUMNO_BOOKMARK_VIEW_MODE_STORAGE_KEY];
    const operations = [
      ...(recentMode || bookmarkMode
        ? [
            repository.adoptRuntimeSectionModes({
              recent: recentMode?.newValue,
              bookmark: bookmarkMode?.newValue,
            }),
          ]
        : []),
      ...(overlay?.newValue === undefined
        ? []
        : [repository.adoptRuntimeWallpaperOverlay(overlay.newValue)]),
      ...(effect?.newValue === undefined
        ? []
        : [repository.adoptRuntimeWallpaperEffect(effect.newValue)]),
      ...(searchWidth?.newValue === undefined
        ? []
        : [repository.adoptRuntimeSearchWidth(searchWidth.newValue)]),
    ];
    if (wallpaper || localWallpaper) {
      if (wallpaperSyncTimer) window.clearTimeout(wallpaperSyncTimer);
      wallpaperSyncTimer = window.setTimeout(() => {
        wallpaperSyncTimer = 0;
        void repository
          .adoptRuntimeWallpaperState()
          .catch((error) =>
            reportExtensionFailure(
              'new-tab-entry',
              'wallpaper-preference-sync-failed',
              error,
            ),
          );
      });
    }
    if (operations.length === 0) return;
    void Promise.all(operations).catch((error) =>
      reportExtensionFailure(
        'new-tab-entry',
        'wallpaper-preference-sync-failed',
        error,
      ),
    );
  };
  chrome.storage.onChanged.addListener(listener);
  window.addEventListener(
    'pagehide',
    () => {
      chrome.storage.onChanged.removeListener(listener);
      if (wallpaperSyncTimer) window.clearTimeout(wallpaperSyncTimer);
    },
    { once: true },
  );
}

function loadExtensionScript(url: string) {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.addEventListener(
      'load',
      () => {
        script.remove();
        resolve();
      },
      { once: true },
    );
    script.addEventListener(
      'error',
      () => {
        script.remove();
        reject(new Error('全局牌库资源加载失败。'));
      },
      { once: true },
    );
    document.documentElement.append(script);
  });
}

async function prepareGlobalLibraryHost(api: ExtensionApi, generation: string) {
  if (
    signalInjectedGlobalLibraryHost(
      GLOBAL_LIBRARY_HOST_ID,
      GLOBAL_LIBRARY_GENERATION_ATTRIBUTE,
      generation,
      GLOBAL_LIBRARY_ALIVE_ATTRIBUTE,
      GLOBAL_LIBRARY_DISPOSE_EVENT,
      GLOBAL_LIBRARY_OPEN_EVENT,
    )
  ) {
    return;
  }
  markGlobalLibraryInjection(GLOBAL_LIBRARY_GENERATION_ATTRIBUTE, generation);
  const libraryUrl = new URL(api.runtime.getURL('library.js'));
  libraryUrl.searchParams.set('generation', generation);
  await loadExtensionScript(libraryUrl.toString());
}

async function installExtensionPageHost(api: ExtensionApi) {
  const tab = await api.tabs?.getCurrent?.();
  if (typeof tab?.id !== 'number') return;
  const tabId = tab.id;
  const listener: ExtensionMessageListener = (
    message,
    _sender,
    sendResponse,
  ) => {
    if (
      !isExtensionPageGlobalLibraryDeliveryMessage(message) ||
      message.tabId !== tabId
    ) {
      return undefined;
    }
    void prepareGlobalLibraryHost(api, message.generation).then(
      () => sendResponse({ handled: true }),
      (error) => {
        reportExtensionFailure(
          'new-tab-entry',
          'global-library-host-failed',
          error,
        );
        sendResponse({ handled: false });
      },
    );
    return true;
  };
  api.runtime.onMessage.addListener(listener);
}

const api = requireExtensionApi();
const preferencesRepository = new NewTabPreferencesRepository(
  api.storage.local,
  api.storage.sync,
);
installRuntimeWallpaperPreferenceSync(preferencesRepository);
const logoUrl = cardMasterLogoUrl(api);
applyDocumentBranding(document, logoUrl);
const brandingObserver = new MutationObserver(() =>
  applyDocumentBranding(document, logoUrl),
);
brandingObserver.observe(document.head, {
  attributes: true,
  attributeFilter: ['href'],
  childList: true,
  subtree: true,
});
void installExtensionPageHost(api).catch((error) => {
  reportExtensionFailure('new-tab-entry', 'page-host-install-failed', error);
});
void openConfiguredNewTab(api).catch((error) => {
  reportExtensionFailure('new-tab-entry', 'destination-read-failed', error);
  const frame = document.getElementById('card-master-new-tab-frame');
  if (frame instanceof HTMLIFrameElement) {
    frame.src = api.runtime.getURL('src/newtab/newtab.html');
  }
});

window.setTimeout(() => {
  const host = document.getElementById('card-master-host');
  if (host) return;
  reportExtensionFailure(
    'new-tab-entry',
    'deck-host-missing',
    new Error('新标签页未能挂载牌库入口。'),
  );
}, 1_500);
