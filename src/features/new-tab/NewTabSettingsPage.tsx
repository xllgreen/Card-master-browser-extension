import {
  AlertCircle,
  ArrowLeft,
  Bookmark,
  Check,
  Compass,
  Globe,
  Home,
  Image,
  Info,
  Link2,
  LoaderCircle,
  MonitorCog,
  PlugZap,
  RotateCcw,
  Save,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import type {
  AiModelProtocol,
  AiReasoningEffort,
  AiServicesConfigView,
  AiServicesController,
} from '../../ai/domain/types';
import {
  MODEL_SERVICE_BASE_URL_PRESETS,
  MODEL_SERVICE_PRESETS,
} from '../../ai/domain/types';
import {
  BING_WALLPAPER_QUALITIES,
  type BingWallpaperQuality,
  type BingWallpaperSettingsController,
  type BingWallpaperSnapshot,
  bingWallpaperDateLabel,
  bingWallpaperQualityLabel,
  todayBingWallpaper,
} from '../../new-tab/application/bing-wallpaper';
import type {
  NewTabLocalWallpaper,
  NewTabLocalWallpaperRepository,
  NewTabWallpaperTone,
} from '../../new-tab/application/local-wallpaper';
import {
  type NewTabPreferences,
  type NewTabPreferencesRepository,
  type NewTabSearchEngine,
  type NewTabWallpaperSource,
  parseNewTabDestinationUrl,
} from '../../new-tab/application/preferences';
import { NEW_TAB_BUILTIN_WALLPAPERS } from '../../new-tab/application/wallpapers';
import type {
  NewTabCapabilities,
  NewTabSearchBlacklistMode,
  NewTabSearchSource,
} from '../../new-tab/domain/types';
import { NEW_TAB_SEARCH_SOURCES } from '../../new-tab/domain/types';

const SECTIONS = [
  { id: 'general', label: '常规', icon: Settings },
  { id: 'ai', label: 'AI 服务', icon: Globe },
  { id: 'appearance', label: '外观', icon: MonitorCog },
  { id: 'wallpaper', label: '壁纸', icon: Image },
  { id: 'home', label: '首页内容', icon: Home },
  { id: 'search', label: '搜索结果', icon: Search },
  { id: 'engines', label: '搜索源', icon: Compass },
  { id: 'blacklist', label: '黑名单', icon: Link2 },
  { id: 'bookmarks', label: '书签', icon: Bookmark },
  { id: 'shortcuts', label: '快捷方式', icon: Sparkles },
  { id: 'favicons', label: '图标与主题色', icon: MonitorCog },
  { id: 'about', label: '关于', icon: Info },
] as const;

type SettingsSection = (typeof SECTIONS)[number]['id'];

const SEARCH_SOURCE_CAPABILITY = {
  'open-tab': 'openTabs',
  bookmark: 'bookmarks',
  history: 'history',
  'top-site': 'topSites',
} as const satisfies Record<NewTabSearchSource, keyof NewTabCapabilities>;

export function newTabSettingsCapabilities(
  target: 'chromium' | 'firefox' | 'safari',
): NewTabCapabilities {
  return {
    history: target !== 'safari',
    bookmarks: target !== 'safari',
    topSites: target !== 'safari',
    openTabs: true,
    browserSearch: target !== 'safari',
    favicon: target === 'chromium',
    storageSync: true,
  };
}

export function visibleNewTabSettingsSections(
  capabilities: NewTabCapabilities,
) {
  return SECTIONS.filter((item) => {
    if (item.id === 'home')
      return capabilities.history || capabilities.topSites;
    if (item.id === 'bookmarks') return capabilities.bookmarks;
    if (item.id === 'favicons') return capabilities.favicon;
    return true;
  });
}

const BING_WALLPAPER_QUALITY_OPTIONS = BING_WALLPAPER_QUALITIES.map(
  (quality) => ({ value: quality, label: bingWallpaperQualityLabel(quality) }),
);

const AI_REASONING_OPTIONS = [
  { value: 'off', label: '关闭' },
  { value: 'low', label: '较低' },
  { value: 'medium', label: '中等' },
  { value: 'high', label: '较高' },
  { value: 'max', label: '最高' },
] as const satisfies readonly {
  value: AiReasoningEffort;
  label: string;
}[];

const AI_PROTOCOL_OPTIONS = [
  { value: 'responses', label: 'Responses API' },
  { value: 'chat-completions', label: 'Chat Completions API' },
] as const satisfies readonly { value: AiModelProtocol; label: string }[];

function settingsSectionDomId(id: SettingsSection) {
  return `new-tab-settings-${id}`;
}

function SettingsContentSection({
  children,
  id,
  label,
}: {
  children: ReactNode;
  id: SettingsSection;
  label: string;
}) {
  const headingId = `${settingsSectionDomId(id)}-heading`;
  return (
    <section
      aria-labelledby={headingId}
      className="cm-new-tab-settings-section"
      data-settings-section={id}
      id={settingsSectionDomId(id)}
    >
      <h1 id={headingId}>{label}</h1>
      {children}
    </section>
  );
}

function Field({
  children,
  description,
  label,
}: {
  children: ReactNode;
  description?: string;
  label: string;
}) {
  return (
    <div className="cm-new-tab-settings-field">
      <div>
        <strong>{label}</strong>
        {description ? <span>{description}</span> : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function NewTabModeNotice({
  overridesBrowserNewTab,
}: {
  overridesBrowserNewTab: boolean;
}) {
  return (
    <Field
      label="浏览器新标签页"
      description={
        overridesBrowserNewTab
          ? '当前使用万象星核新标签页。要恢复浏览器原生页面，请安装“保留浏览器新标签页版”。'
          : '当前版本不接管浏览器新标签页。下方外观等设置仅用于手动打开的万象星核页面。'
      }
    >
      <div className="cm-new-tab-settings-mode">
        <a
          href="https://github.com/LYiHub/Card-master-browser-extension-public/releases/latest"
          rel="noreferrer"
          target="_blank"
        >
          查看安装包与切换说明
        </a>
        <span>
          切换版本需将对应包完整解压并覆盖原安装目录，再重新加载扩展。保留原目录，不要卸载扩展或清除数据。
        </span>
      </div>
    </Field>
  );
}

function Toggle({
  checked,
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange(checked: boolean): void;
}) {
  return (
    <label className="cm-new-tab-settings-toggle">
      <input
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
        type="checkbox"
      />
      <span aria-hidden="true" />
      <b>{label}</b>
    </label>
  );
}

function engineId() {
  return globalThis.crypto?.randomUUID?.() ?? `engine-${Date.now()}`;
}

export function newTabWallpaperToneForTheme(
  mode: NewTabPreferences['themeMode'],
  systemDark: boolean,
): NewTabWallpaperTone {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  return systemDark ? 'dark' : 'light';
}

export function NewTabSettingsPage({
  aiSecretsSync,
  aiServices,
  assetUrl,
  backUrl,
  bingWallpaper,
  capabilities,
  overridesBrowserNewTab,
  localWallpaperRepository,
  preferencesRepository,
  version,
}: {
  aiSecretsSync?: {
    read(): Promise<boolean>;
    write(value: boolean): Promise<void>;
  };
  aiServices?: AiServicesController;
  assetUrl(path: string): string;
  backUrl: string;
  bingWallpaper: BingWallpaperSettingsController;
  capabilities: NewTabCapabilities;
  overridesBrowserNewTab: boolean;
  localWallpaperRepository: NewTabLocalWallpaperRepository;
  preferencesRepository: NewTabPreferencesRepository;
  version: string;
}) {
  const sections = visibleNewTabSettingsSections(capabilities);
  const searchSources = NEW_TAB_SEARCH_SOURCES.filter(
    (source) => capabilities[SEARCH_SOURCE_CAPABILITY[source]],
  );
  const [section, setSection] = useState<SettingsSection>('general');
  const [preferences, setPreferences] = useState<NewTabPreferences | null>(
    null,
  );
  const [wallpaperSourcePanel, setWallpaperSourcePanel] =
    useState<NewTabWallpaperSource>('default');
  const [wallpaperTone, setWallpaperTone] =
    useState<NewTabWallpaperTone>('light');
  const [localWallpapers, setLocalWallpapers] = useState<
    NewTabLocalWallpaper[]
  >([]);
  const [notice, setNotice] = useState('');
  const [webdavSync, setWebdavSync] = useState(false);
  const [destinationDraft, setDestinationDraft] = useState('');
  const [bingSnapshot, setBingSnapshot] =
    useState<BingWallpaperSnapshot | null>(null);
  const [bingLoading, setBingLoading] = useState(true);
  const [bingRefreshing, setBingRefreshing] = useState(false);
  const [bingError, setBingError] = useState('');
  const [aiConfig, setAiConfig] = useState<AiServicesConfigView | null>(null);
  const [aiDraft, setAiDraft] = useState({
    apiKey: '',
    baseUrl: '',
    model: '',
    protocol: 'responses' as AiModelProtocol,
    reasoningEffort: 'high' as AiReasoningEffort,
  });
  const [aiBusy, setAiBusy] = useState(false);
  const [aiStatus, setAiStatus] = useState('');
  const [syncSecrets, setSyncSecrets] = useState(true);
  const [engineDraft, setEngineDraft] = useState({
    name: '',
    keyword: '',
    queryUrl: '',
  });
  const [blacklistDraft, setBlacklistDraft] = useState({
    mode: 'domain' as NewTabSearchBlacklistMode,
    value: '',
  });

  useEffect(() => {
    void preferencesRepository.webdavOwnsPreferences().then(setWebdavSync);
    void preferencesRepository
      .read()
      .then((next) => {
        setPreferences(next);
        setWallpaperSourcePanel(next.wallpaperSource);
        setDestinationDraft(next.destinationUrl);
      })
      .catch((error) =>
        setNotice(error instanceof Error ? error.message : '设置读取失败。'),
      );
  }, [preferencesRepository]);

  const themeMode = preferences?.themeMode;
  useEffect(() => {
    if (!themeMode) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const syncTone = () =>
      setWallpaperTone(newTabWallpaperToneForTheme(themeMode, media.matches));
    syncTone();
    if (themeMode !== 'system') return;
    media.addEventListener('change', syncTone);
    return () => media.removeEventListener('change', syncTone);
  }, [themeMode]);

  useEffect(() => {
    void localWallpaperRepository
      .readAll()
      .then(setLocalWallpapers)
      .catch((error) =>
        setNotice(
          error instanceof Error ? error.message : '本地壁纸读取失败。',
        ),
      );
  }, [localWallpaperRepository]);

  useEffect(() => {
    let active = true;
    const load = () => {
      void bingWallpaper
        .read()
        .then((snapshot) => {
          if (!active) return;
          setBingSnapshot(snapshot);
          setBingLoading(false);
        })
        .catch((error) => {
          if (!active) return;
          setBingLoading(false);
          setBingError(
            error instanceof Error ? error.message : '必应壁纸读取失败。',
          );
        });
    };
    load();
    const unsubscribe = bingWallpaper.subscribe(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [bingWallpaper]);

  useEffect(() => {
    if (!aiServices) return;
    let active = true;
    void aiServices
      .readServices()
      .then((config) => {
        if (!active) return;
        setAiConfig(config);
        setAiDraft((current) =>
          current.baseUrl || current.model || current.apiKey
            ? current
            : {
                apiKey: '',
                baseUrl: config.modelService.baseUrl,
                model: config.modelService.model,
                protocol: config.modelService.protocol,
                reasoningEffort: config.modelService.reasoningEffort,
              },
        );
      })
      .catch((error) => {
        if (!active) return;
        setAiStatus(
          error instanceof Error ? error.message : 'AI 服务配置读取失败。',
        );
      });
    return () => {
      active = false;
    };
  }, [aiServices]);

  useEffect(() => {
    if (!aiSecretsSync) return;
    let active = true;
    void aiSecretsSync
      .read()
      .then((value) => {
        if (active) setSyncSecrets(value);
      })
      .catch(() => {
        // 读取失败时保持默认（允许同步密钥）。
      });
    return () => {
      active = false;
    };
  }, [aiSecretsSync]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3_200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const settingsLoaded = preferences !== null;
  useEffect(() => {
    if (!settingsLoaded) return;
    const target = SECTIONS.find(
      (item) =>
        window.location.hash === `#${settingsSectionDomId(item.id)}` &&
        document.getElementById(settingsSectionDomId(item.id)),
    );
    if (!target) return;
    setSection(target.id);
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(settingsSectionDomId(target.id))?.scrollIntoView({
        behavior: 'auto',
        block: 'start',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [settingsLoaded]);

  useEffect(() => {
    if (!settingsLoaded) return;
    const content = document.querySelector<HTMLElement>(
      '.cm-new-tab-settings-content',
    );
    const observed = SECTIONS.flatMap((item) => {
      const element = document.getElementById(settingsSectionDomId(item.id));
      return element instanceof HTMLElement ? [{ element, id: item.id }] : [];
    }).sort(
      (a, b) =>
        a.element.getBoundingClientRect().top -
        b.element.getBoundingClientRect().top,
    );
    if (!content || observed.length === 0) return;

    let frame = 0;
    const updateActiveSection = () => {
      frame = 0;
      const anchor = 104;
      let active = observed[0];
      for (const candidate of observed) {
        if (candidate.element.getBoundingClientRect().top > anchor) break;
        active = candidate;
      }
      const atPageEnd =
        Math.ceil(window.scrollY + window.innerHeight) >=
        document.documentElement.scrollHeight - 2;
      const next = atPageEnd ? observed.at(-1) : active;
      if (next) {
        setSection((current) => (current === next.id ? current : next.id));
      }
    };
    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateActiveSection);
    };
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(content);
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    scheduleUpdate();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('scroll', scheduleUpdate);
    };
  }, [settingsLoaded]);

  const scrollToSection = (id: SettingsSection) => {
    setSection(id);
    document.getElementById(settingsSectionDomId(id))?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const mutate = useCallback(
    async (
      mutation: (current: NewTabPreferences) => NewTabPreferences,
      message = '设置已保存。',
    ) => {
      try {
        const next = await preferencesRepository.mutate(mutation);
        setPreferences(next);
        setNotice(message);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : '设置保存失败。');
      }
    },
    [preferencesRepository],
  );

  const patch = <Key extends keyof NewTabPreferences>(
    key: Key,
    value: NewTabPreferences[Key],
    message?: string,
  ) => mutate((current) => ({ ...current, [key]: value }), message);

  const uploadWallpaper = async (
    tone: NewTabWallpaperTone,
    file: File | undefined,
  ) => {
    if (!file) return;
    try {
      const wallpaper = await localWallpaperRepository.save(file);
      setLocalWallpapers((current) => [...current, wallpaper]);
      await patch(
        tone === 'light' ? 'wallpaperLight' : 'wallpaperDark',
        wallpaper.id,
        `${tone === 'light' ? '浅色' : '深色'}本地壁纸已保存。`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '本地壁纸保存失败。');
    }
  };

  const addEngine = () => {
    const draft: NewTabSearchEngine = {
      id: engineId(),
      name: engineDraft.name.trim(),
      queryUrl: engineDraft.queryUrl.trim(),
      ...(engineDraft.keyword.trim()
        ? { keyword: engineDraft.keyword.trim().replace(/^@/, '') }
        : {}),
    };
    if (!draft.name || !draft.queryUrl.includes('{query}')) {
      setNotice('搜索源需要名称，并在查询地址中包含 {query}。');
      return;
    }
    void mutate(
      (current) => ({
        ...current,
        searchEngines: [...current.searchEngines, draft],
      }),
      '搜索源已添加。',
    ).then(() => setEngineDraft({ name: '', keyword: '', queryUrl: '' }));
  };

  const saveDestination = async () => {
    try {
      const destinationUrl = parseNewTabDestinationUrl(destinationDraft);
      await patch(
        'destinationUrl',
        destinationUrl,
        destinationUrl
          ? '新标签页将打开指定网页。'
          : '新标签页将使用万象星核页面。',
      );
      setDestinationDraft(destinationUrl);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '网址保存失败。');
    }
  };

  const bingImage = todayBingWallpaper(bingSnapshot);

  const refreshBingWallpaper = async () => {
    setBingRefreshing(true);
    setBingError('');
    try {
      setBingSnapshot(await bingWallpaper.refresh());
      setBingLoading(false);
      setNotice('必应每日壁纸已更新。');
    } catch (error) {
      setBingError(
        error instanceof Error ? error.message : '必应壁纸更新失败。',
      );
    } finally {
      setBingRefreshing(false);
    }
  };

  const aiInput = () => ({
    baseUrl: aiDraft.baseUrl.trim(),
    model: aiDraft.model.trim(),
    protocol: aiDraft.protocol,
    reasoningEffort: aiDraft.reasoningEffort,
    ...(aiDraft.apiKey ? { apiKey: aiDraft.apiKey.trim() } : {}),
  });

  const aiReady = Boolean(aiServices);

  const saveAiServices = async () => {
    if (!aiServices) return;
    setAiBusy(true);
    try {
      setAiConfig(await aiServices.saveModelService(aiInput()));
      setAiDraft((current) => ({ ...current, apiKey: '' }));
      setAiStatus('');
      setNotice('AI 服务设置已保存。');
    } catch (error) {
      setAiStatus(
        error instanceof Error ? error.message : 'AI 服务设置保存失败。',
      );
    } finally {
      setAiBusy(false);
    }
  };

  const testAiServices = async () => {
    if (!aiServices) return;
    setAiBusy(true);
    try {
      const probe = await aiServices.testModelService(aiInput());
      setAiStatus(
        probe.ok
          ? `连接成功：${probe.model}（${probe.durationMs} 毫秒）`
          : probe.error || '连接失败，请检查地址、密钥与模型。',
      );
    } catch (error) {
      setAiStatus(
        error instanceof Error ? error.message : 'AI 服务连接测试失败。',
      );
    } finally {
      setAiBusy(false);
    }
  };

  const clearAiCredential = async () => {
    if (!aiServices) return;
    if (aiDraft.apiKey) {
      setAiDraft((current) => ({ ...current, apiKey: '' }));
      return;
    }
    setAiBusy(true);
    try {
      setAiConfig(await aiServices.clearModelServiceCredential());
      setAiStatus('');
      setNotice('已清除保存的 API 密钥。');
    } catch (error) {
      setAiStatus(
        error instanceof Error ? error.message : 'API 密钥清除失败。',
      );
    } finally {
      setAiBusy(false);
    }
  };

  const updateSyncSecrets = async (value: boolean) => {
    setSyncSecrets(value);
    if (!aiSecretsSync) return;
    try {
      await aiSecretsSync.write(value);
      setNotice(value ? 'API 密钥将随 WebDAV 同步。' : 'API 密钥不再同步。');
    } catch (error) {
      setSyncSecrets(!value);
      setNotice(error instanceof Error ? error.message : '同步偏好保存失败。');
    }
  };

  const selectWallpaperSource = async (source: NewTabWallpaperSource) => {
    setWallpaperSourcePanel(source);
    await mutate(
      (current) =>
        current.wallpaperSource === source
          ? current
          : { ...current, wallpaperSource: source },
      source === 'bing' ? '已切换为必应每日壁纸。' : '已切换为默认壁纸。',
    );
    if (source !== 'bing' || bingSnapshot) return;
    await refreshBingWallpaper();
  };

  if (!preferences) {
    return (
      <main className="cm-new-tab-settings-loading">正在读取新标签页设置</main>
    );
  }

  return (
    <main
      className="cm-new-tab-settings-page"
      data-theme={preferences.themeMode}
    >
      <header className="cm-new-tab-settings-header">
        <button
          aria-label="打开万象星核页面"
          onClick={() => {
            location.href = backUrl;
          }}
          title="打开万象星核页面"
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={18} />
        </button>
        <div>
          <strong>新标签页设置</strong>
          <span>万象星核 NovaBay · 一舱统御脚本、AI、视频与同步。</span>
        </div>
      </header>

      <div className="cm-new-tab-settings-layout">
        <nav aria-label="设置分类">
          {sections.map((item) => {
            const Icon = item.icon;
            return (
              <button
                aria-current={section === item.id ? 'page' : undefined}
                aria-controls={settingsSectionDomId(item.id)}
                data-selected={section === item.id ? 'true' : 'false'}
                key={item.id}
                onClick={() => scrollToSection(item.id)}
                type="button"
              >
                <Icon aria-hidden="true" size={16} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="cm-new-tab-settings-content">
          <SettingsContentSection id="general" label="常规">
            <NewTabModeNotice overridesBrowserNewTab={overridesBrowserNewTab} />
            <Field
              description={
                overridesBrowserNewTab
                  ? '留空时使用万象星核新标签页；填写后，新建标签页会直接打开该网址。此处不用于恢复浏览器原生页面。'
                  : '本版本不接管新标签页。已保存的网址会保留，切回标准版后继续使用。'
              }
              label="新标签页内容"
            >
              <div className="cm-new-tab-settings-destination">
                <input
                  aria-label="指定新标签页网址"
                  disabled={!overridesBrowserNewTab}
                  onChange={(event) =>
                    setDestinationDraft(event.currentTarget.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void saveDestination();
                    }
                  }}
                  placeholder="例如：https://www.bilibili.com/"
                  type="url"
                  value={destinationDraft}
                />
                <button
                  disabled={!overridesBrowserNewTab}
                  onClick={() => void saveDestination()}
                  type="button"
                >
                  <Save aria-hidden="true" size={15} />
                  保存
                </button>
                <button
                  disabled={
                    !overridesBrowserNewTab ||
                    (!preferences.destinationUrl && !destinationDraft.trim())
                  }
                  onClick={() => {
                    setDestinationDraft('');
                    void patch(
                      'destinationUrl',
                      '',
                      '新标签页将使用万象星核页面。',
                    );
                  }}
                  type="button"
                >
                  <RotateCcw aria-hidden="true" size={15} />
                  使用万象星核页面
                </button>
              </div>
            </Field>
            <Field label="主题">
              <select
                onChange={(event) =>
                  void patch(
                    'themeMode',
                    event.currentTarget.value as NewTabPreferences['themeMode'],
                  )
                }
                value={preferences.themeMode}
              >
                <option value="system">跟随系统</option>
                <option value="light">浅色</option>
                <option value="dark">深色</option>
              </select>
            </Field>
            <Field label="顶部时间">
              <Toggle
                checked={preferences.showClock}
                label="显示"
                onChange={(checked) => void patch('showClock', checked)}
              />
            </Field>
            {webdavSync ? (
              <Field
                label="跨设备同步"
                description="新标签页配置由 WebDAV 统一同步，可在牌库设置的数据管理中查看状态。"
              >
                <span>WebDAV 已连接</span>
              </Field>
            ) : capabilities.storageSync ? (
              <Field
                description="同步布局、搜索和普通偏好；本地壁纸、自定义图标与书签顶部外观不参与同步。"
                label="浏览器内置同步"
              >
                <Toggle
                  checked={preferences.syncEnabled}
                  label="启用"
                  onChange={(checked) => void patch('syncEnabled', checked)}
                />
              </Field>
            ) : null}
          </SettingsContentSection>

          <SettingsContentSection id="appearance" label="外观">
            <Field label={`内容宽度 ${preferences.contentWidth}px`}>
              <input
                max="1680"
                min="720"
                onChange={(event) =>
                  void patch('contentWidth', Number(event.currentTarget.value))
                }
                step="20"
                type="range"
                value={preferences.contentWidth}
              />
            </Field>
            <Field label={`搜索框宽度 ${preferences.searchWidth}px`}>
              <input
                max="1040"
                min="520"
                onChange={(event) =>
                  void patch('searchWidth', Number(event.currentTarget.value))
                }
                step="20"
                type="range"
                value={preferences.searchWidth}
              />
            </Field>
          </SettingsContentSection>

          {capabilities.history || capabilities.topSites ? (
            <SettingsContentSection id="home" label="首页内容">
              <Field
                description="选择「不显示」后，新标签页不再出现这块区域。"
                label="显示模式"
              >
                <select
                  onChange={(event) =>
                    void patch(
                      'recentMode',
                      event.currentTarget
                        .value as NewTabPreferences['recentMode'],
                    )
                  }
                  value={preferences.recentMode}
                >
                  {capabilities.history ? (
                    <option value="recent">最近访问</option>
                  ) : null}
                  {capabilities.topSites ? (
                    <option value="most-visited">最常访问</option>
                  ) : null}
                  <option value="hidden">不显示</option>
                </select>
              </Field>
              <Field label={`网站数量 ${preferences.recentCount}`}>
                <input
                  max="16"
                  min="4"
                  onChange={(event) =>
                    void patch('recentCount', Number(event.currentTarget.value))
                  }
                  type="range"
                  value={preferences.recentCount}
                />
              </Field>
              <Field label="隐藏的网站">
                <button
                  disabled={preferences.hiddenSiteUrls.length === 0}
                  onClick={() => void patch('hiddenSiteUrls', [])}
                  type="button"
                >
                  恢复 {preferences.hiddenSiteUrls.length} 个网站
                </button>
              </Field>
            </SettingsContentSection>
          ) : null}

          <SettingsContentSection id="search" label="搜索结果">
            <Field label="结果优先级">
              <select
                onChange={(event) =>
                  void patch(
                    'searchPriority',
                    event.currentTarget
                      .value as NewTabPreferences['searchPriority'],
                  )
                }
                value={preferences.searchPriority}
              >
                <option value="autocomplete">补全结果优先</option>
                {capabilities.browserSearch ? (
                  <option value="browser-search">网页搜索优先</option>
                ) : null}
              </select>
            </Field>
            <Field label="搜索来源">
              <div className="cm-new-tab-settings-checks">
                {searchSources.map((source) => (
                  <Toggle
                    checked={preferences.searchSources.includes(source)}
                    key={source}
                    label={
                      {
                        history: '历史',
                        bookmark: '书签',
                        'top-site': '常用网站',
                        'open-tab': '当前标签页',
                      }[source]
                    }
                    onChange={(checked) => {
                      const next = checked
                        ? [...preferences.searchSources, source]
                        : preferences.searchSources.filter(
                            (entry) => entry !== source,
                          );
                      if (next.length > 0) {
                        void patch('searchSources', [...new Set(next)]);
                      }
                    }}
                  />
                ))}
              </div>
            </Field>
          </SettingsContentSection>

          <SettingsContentSection id="engines" label="搜索源">
            <Field label="默认搜索源">
              <select
                onChange={(event) =>
                  void patch('defaultSearchEngineId', event.currentTarget.value)
                }
                value={preferences.defaultSearchEngineId}
              >
                {capabilities.browserSearch ? (
                  <option value="browser">浏览器默认</option>
                ) : null}
                {preferences.searchEngines.map((engine) => (
                  <option key={engine.id} value={engine.id}>
                    {engine.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="cm-new-tab-settings-list">
              {preferences.searchEngines.map((engine) => (
                <div key={engine.id}>
                  <span>
                    <strong>{engine.name}</strong>
                    <small>
                      {engine.keyword ? `@${engine.keyword} · ` : ''}
                      {engine.queryUrl}
                    </small>
                  </span>
                  <button
                    aria-label={`删除 ${engine.name}`}
                    onClick={() =>
                      void mutate((current) => ({
                        ...current,
                        searchEngines: current.searchEngines.filter(
                          (entry) => entry.id !== engine.id,
                        ),
                        defaultSearchEngineId:
                          current.defaultSearchEngineId === engine.id
                            ? 'browser'
                            : current.defaultSearchEngineId,
                      }))
                    }
                    title="删除"
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={15} />
                  </button>
                </div>
              ))}
            </div>
            <div className="cm-new-tab-settings-form-grid">
              <input
                onChange={(event) =>
                  setEngineDraft((current) => ({
                    ...current,
                    name: event.currentTarget.value,
                  }))
                }
                placeholder="名称"
                value={engineDraft.name}
              />
              <input
                onChange={(event) =>
                  setEngineDraft((current) => ({
                    ...current,
                    keyword: event.currentTarget.value,
                  }))
                }
                placeholder="站内关键词，例如 bilibili"
                value={engineDraft.keyword}
              />
              <input
                onChange={(event) =>
                  setEngineDraft((current) => ({
                    ...current,
                    queryUrl: event.currentTarget.value,
                  }))
                }
                placeholder="https://example.com/search?q={query}"
                value={engineDraft.queryUrl}
              />
              <button onClick={addEngine} type="button">
                添加搜索源
              </button>
            </div>
          </SettingsContentSection>

          <SettingsContentSection id="blacklist" label="黑名单">
            <div className="cm-new-tab-settings-list">
              {preferences.searchBlacklist.map((entry, index) => (
                <div key={`${entry.mode}:${entry.value}`}>
                  <span>
                    <strong>
                      {
                        {
                          domain: '域名',
                          'url-prefix': '网址前缀',
                          'exact-url': '完整网址',
                        }[entry.mode]
                      }
                    </strong>
                    <small>{entry.value}</small>
                  </span>
                  <button
                    aria-label="删除黑名单规则"
                    onClick={() =>
                      void patch(
                        'searchBlacklist',
                        preferences.searchBlacklist.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      )
                    }
                    title="删除"
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={15} />
                  </button>
                </div>
              ))}
            </div>
            <div className="cm-new-tab-settings-form-grid is-compact">
              <select
                onChange={(event) =>
                  setBlacklistDraft((current) => ({
                    ...current,
                    mode: event.currentTarget
                      .value as NewTabSearchBlacklistMode,
                  }))
                }
                value={blacklistDraft.mode}
              >
                <option value="domain">域名</option>
                <option value="url-prefix">网址前缀</option>
                <option value="exact-url">完整网址</option>
              </select>
              <input
                onChange={(event) =>
                  setBlacklistDraft((current) => ({
                    ...current,
                    value: event.currentTarget.value,
                  }))
                }
                placeholder="example.com"
                value={blacklistDraft.value}
              />
              <button
                onClick={() => {
                  if (!blacklistDraft.value.trim()) return;
                  void patch('searchBlacklist', [
                    ...preferences.searchBlacklist,
                    {
                      mode: blacklistDraft.mode,
                      value: blacklistDraft.value.trim(),
                    },
                  ]).then(() =>
                    setBlacklistDraft({
                      mode: 'domain',
                      value: '',
                    }),
                  );
                }}
                type="button"
              >
                添加规则
              </button>
            </div>
          </SettingsContentSection>

          {capabilities.bookmarks ? (
            <SettingsContentSection id="bookmarks" label="书签">
              <Field
                description="选择「不显示」后，新标签页不再出现书签区域。"
                label="显示模式"
              >
                <select
                  onChange={(event) =>
                    void patch(
                      'bookmarkMode',
                      event.currentTarget
                        .value as NewTabPreferences['bookmarkMode'],
                    )
                  }
                  value={preferences.bookmarkMode}
                >
                  <option value="folder">多层文件夹</option>
                  <option value="list">多级列表</option>
                  <option value="top">顶部书签栏</option>
                  <option value="hidden">不显示</option>
                </select>
              </Field>
              <Field label={`每页数量 ${preferences.bookmarkPageSize}`}>
                <input
                  max="30"
                  min="6"
                  onChange={(event) =>
                    void patch(
                      'bookmarkPageSize',
                      Number(event.currentTarget.value),
                    )
                  }
                  type="range"
                  value={preferences.bookmarkPageSize}
                />
              </Field>
              <Field label={`列数 ${preferences.bookmarkColumns}`}>
                <input
                  max="6"
                  min="2"
                  onChange={(event) =>
                    void patch(
                      'bookmarkColumns',
                      Number(event.currentTarget.value),
                    )
                  }
                  type="range"
                  value={preferences.bookmarkColumns}
                />
              </Field>
              <Field label="文件夹图标">
                <Toggle
                  checked={preferences.bookmarkFolderIcons}
                  label="显示"
                  onChange={(checked) =>
                    void patch('bookmarkFolderIcons', checked)
                  }
                />
              </Field>
            </SettingsContentSection>
          ) : null}

          <SettingsContentSection id="shortcuts" label="快捷方式">
            <Field label="快捷方式区域">
              <div className="cm-new-tab-settings-checks">
                <Toggle
                  checked={preferences.shortcutsVisible}
                  label="显示快捷方式"
                  onChange={(checked) =>
                    void patch('shortcutsVisible', checked)
                  }
                />
                <Toggle
                  checked={preferences.shortcutAddVisible}
                  label="显示添加按钮"
                  onChange={(checked) =>
                    void patch('shortcutAddVisible', checked)
                  }
                />
                <Toggle
                  checked={preferences.shortcutDockMagnification}
                  label="悬浮放大"
                  onChange={(checked) =>
                    void patch('shortcutDockMagnification', checked)
                  }
                />
              </div>
            </Field>
            <div className="cm-new-tab-settings-list">
              {preferences.shortcuts.map((shortcut) => (
                <div key={shortcut.id}>
                  <span>
                    <strong>{shortcut.title}</strong>
                    <small>{shortcut.url}</small>
                  </span>
                  <button
                    aria-label={`删除 ${shortcut.title}`}
                    onClick={() =>
                      void patch(
                        'shortcuts',
                        preferences.shortcuts.filter(
                          (entry) => entry.id !== shortcut.id,
                        ),
                      )
                    }
                    title="删除"
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={15} />
                  </button>
                </div>
              ))}
            </div>
          </SettingsContentSection>

          <SettingsContentSection id="wallpaper" label="壁纸">
            <h2>显示效果</h2>
            <section aria-label="壁纸显示参数">
              <Field label="填充方式">
                <select
                  onChange={(event) =>
                    void patch(
                      'wallpaperFit',
                      event.currentTarget
                        .value as NewTabPreferences['wallpaperFit'],
                    )
                  }
                  value={preferences.wallpaperFit}
                >
                  <option value="cover">填满页面</option>
                  <option value="contain">完整显示</option>
                </select>
              </Field>
              <Field label="壁纸位置">
                <select
                  onChange={(event) =>
                    void patch(
                      'wallpaperPosition',
                      event.currentTarget
                        .value as NewTabPreferences['wallpaperPosition'],
                    )
                  }
                  value={preferences.wallpaperPosition}
                >
                  <option value="center">居中</option>
                  <option value="top">顶部</option>
                  <option value="bottom">底部</option>
                  <option value="left">左侧</option>
                  <option value="right">右侧</option>
                </select>
              </Field>
              <Field label={`遮罩效果 ${preferences.wallpaperMask}%`}>
                <input
                  max="100"
                  min="0"
                  onChange={(event) =>
                    void patch(
                      'wallpaperMask',
                      Number(event.currentTarget.value),
                    )
                  }
                  type="range"
                  value={preferences.wallpaperMask}
                />
              </Field>
              <Field label="壁纸滤镜">
                <fieldset
                  aria-label="壁纸滤镜"
                  className="cm-new-tab-wallpaper-effect-tabs"
                >
                  {(
                    [
                      ['none', '关闭'],
                      ['grain', '颗粒'],
                      ['halftone', '网点'],
                      ['ascii', 'ASCII'],
                    ] as const
                  ).map(([effect, label]) => (
                    <button
                      aria-pressed={preferences.wallpaperEffect === effect}
                      data-selected={
                        preferences.wallpaperEffect === effect
                          ? 'true'
                          : 'false'
                      }
                      key={effect}
                      onClick={() => void patch('wallpaperEffect', effect)}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </fieldset>
              </Field>
              {preferences.wallpaperEffect !== 'none' ? (
                <Field
                  label={`滤镜强度 ${preferences.wallpaperEffectStrength}`}
                >
                  <input
                    max="100"
                    min="0"
                    onChange={(event) =>
                      void patch(
                        'wallpaperEffectStrength',
                        Number(event.currentTarget.value),
                      )
                    }
                    type="range"
                    value={preferences.wallpaperEffectStrength}
                  />
                </Field>
              ) : null}
              {preferences.wallpaperEffect === 'halftone' ||
              preferences.wallpaperEffect === 'ascii' ? (
                <Field label={`滤镜尺寸 ${preferences.wallpaperEffectSize}`}>
                  <input
                    max="100"
                    min="10"
                    onChange={(event) =>
                      void patch(
                        'wallpaperEffectSize',
                        Number(event.currentTarget.value),
                      )
                    }
                    type="range"
                    value={preferences.wallpaperEffectSize}
                  />
                </Field>
              ) : null}
              {preferences.wallpaperEffect === 'halftone' ||
              preferences.wallpaperEffect === 'ascii' ? (
                <Field label={`滤镜间距 ${preferences.wallpaperEffectSpacing}`}>
                  <input
                    max="100"
                    min="0"
                    onChange={(event) =>
                      void patch(
                        'wallpaperEffectSpacing',
                        Number(event.currentTarget.value),
                      )
                    }
                    type="range"
                    value={preferences.wallpaperEffectSpacing}
                  />
                </Field>
              ) : null}
            </section>
            <h2 className="cm-new-tab-settings-subsection-title">壁纸来源</h2>
            <div className="cm-new-tab-wallpaper-mode">
              <div aria-label="壁纸来源" role="tablist">
                <button
                  aria-selected={wallpaperSourcePanel === 'default'}
                  data-current={
                    preferences.wallpaperSource === 'default' ? 'true' : 'false'
                  }
                  data-selected={
                    wallpaperSourcePanel === 'default' ? 'true' : 'false'
                  }
                  onClick={() => void selectWallpaperSource('default')}
                  role="tab"
                  type="button"
                >
                  <Image aria-hidden="true" size={15} />
                  默认壁纸
                  <span className="cm-new-tab-wallpaper-current">使用中</span>
                </button>
                <button
                  aria-selected={wallpaperSourcePanel === 'bing'}
                  data-current={
                    preferences.wallpaperSource === 'bing' ? 'true' : 'false'
                  }
                  data-selected={
                    wallpaperSourcePanel === 'bing' ? 'true' : 'false'
                  }
                  onClick={() => void selectWallpaperSource('bing')}
                  role="tab"
                  type="button"
                >
                  <Globe aria-hidden="true" size={15} />
                  必应每日壁纸
                  <span className="cm-new-tab-wallpaper-current">使用中</span>
                </button>
              </div>
              <p>
                {wallpaperSourcePanel === 'bing'
                  ? '每天自动获取必应首页的图片作为壁纸，可切换清晰度或立即更新。'
                  : '使用预设壁纸或你上传的本地图片。'}
              </p>
            </div>

            {wallpaperSourcePanel === 'bing' ? (
              <section
                aria-label="必应每日壁纸设置"
                className="cm-new-tab-wallpaper-mode-panel"
                role="tabpanel"
              >
                {bingLoading ? (
                  <div
                    className="cm-new-tab-wallpaper-mode-state"
                    data-state="loading"
                    role="status"
                  >
                    <LoaderCircle
                      aria-hidden="true"
                      className="cm-new-tab-wallpaper-mode-state-icon"
                      size={18}
                    />
                    <div>
                      <strong>正在获取必应壁纸</strong>
                      <p>首次启用时会自动抓取当天图片，稍候即可生效。</p>
                    </div>
                  </div>
                ) : bingError ? (
                  <div
                    className="cm-new-tab-wallpaper-mode-state"
                    data-state="error"
                    role="alert"
                  >
                    <AlertCircle
                      aria-hidden="true"
                      className="cm-new-tab-wallpaper-mode-state-icon"
                      size={18}
                    />
                    <div>
                      <strong>壁纸更新失败</strong>
                      <p>{bingError}</p>
                      <p>失败时继续使用上一次成功获取的壁纸。</p>
                    </div>
                  </div>
                ) : bingImage ? (
                  <div
                    className="cm-new-tab-wallpaper-mode-state"
                    data-state="notice"
                  >
                    <Globe
                      aria-hidden="true"
                      className="cm-new-tab-wallpaper-mode-state-icon"
                      size={18}
                    />
                    <div>
                      <strong>{bingImage.title || '今日壁纸'}</strong>
                      <p>
                        {[
                          bingWallpaperDateLabel(bingImage.date),
                          bingImage.copyright,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div
                    className="cm-new-tab-wallpaper-mode-state"
                    data-state="notice"
                  >
                    <AlertCircle
                      aria-hidden="true"
                      className="cm-new-tab-wallpaper-mode-state-icon"
                      size={18}
                    />
                    <div>
                      <strong>尚未获取到壁纸</strong>
                      <p>点击下方按钮，立刻抓取当天的必应首页图片。</p>
                    </div>
                  </div>
                )}
                <Field
                  description="高清适合大多数屏幕；超清图片更大，加载更慢。"
                  label="图片清晰度"
                >
                  <select
                    onChange={(event) =>
                      void patch(
                        'bingWallpaperQuality',
                        event.currentTarget.value as BingWallpaperQuality,
                      )
                    }
                    value={preferences.bingWallpaperQuality}
                  >
                    {BING_WALLPAPER_QUALITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="cm-new-tab-wallpaper-mode-state-actions">
                  <button
                    disabled={bingRefreshing}
                    onClick={() => void refreshBingWallpaper()}
                    type="button"
                  >
                    <RotateCcw aria-hidden="true" size={15} />
                    {bingRefreshing ? '正在更新' : '立即更新'}
                  </button>
                </div>
              </section>
            ) : (
              <section
                aria-label="默认壁纸设置"
                className="cm-new-tab-wallpaper-mode-panel"
                role="tabpanel"
              >
                <div
                  aria-label="壁纸颜色模式"
                  className="cm-new-tab-wallpaper-tone-tabs"
                  role="tablist"
                >
                  {(['light', 'dark'] as const).map((tone) => (
                    <button
                      aria-selected={wallpaperTone === tone}
                      className="cm-new-tab-wallpaper-tone-tab"
                      data-selected={wallpaperTone === tone ? 'true' : 'false'}
                      key={tone}
                      onClick={() => setWallpaperTone(tone)}
                      role="tab"
                      type="button"
                    >
                      {tone === 'light' ? '浅色模式' : '深色模式'}
                    </button>
                  ))}
                </div>
                <p className="cm-new-tab-wallpaper-tone-hint">
                  正在设置{wallpaperTone === 'light' ? '浅色' : '深色'}
                  模式壁纸
                </p>
                <div className="cm-new-tab-wallpaper-picker">
                  {NEW_TAB_BUILTIN_WALLPAPERS.map((wallpaper) => (
                    <button
                      aria-label={`使用${wallpaper.label}`}
                      data-selected={
                        (wallpaperTone === 'light'
                          ? preferences.wallpaperLight
                          : preferences.wallpaperDark) === wallpaper.id
                          ? 'true'
                          : 'false'
                      }
                      key={wallpaper.id}
                      onClick={() =>
                        void patch(
                          wallpaperTone === 'light'
                            ? 'wallpaperLight'
                            : 'wallpaperDark',
                          wallpaper.id,
                        )
                      }
                      type="button"
                    >
                      <span className="cm-new-tab-wallpaper-thumbnail">
                        <img
                          alt=""
                          loading="lazy"
                          src={assetUrl(wallpaper.thumbnailPath)}
                        />
                        <span
                          aria-hidden="true"
                          className="cm-new-tab-wallpaper-check"
                        >
                          <Check size={11} />
                        </span>
                      </span>
                    </button>
                  ))}
                  {localWallpapers.map((wallpaper) => (
                    <button
                      aria-label={`使用本地壁纸${wallpaper.name || ''}`}
                      data-selected={
                        (wallpaperTone === 'light'
                          ? preferences.wallpaperLight
                          : preferences.wallpaperDark) === wallpaper.id
                          ? 'true'
                          : 'false'
                      }
                      key={wallpaper.id}
                      onClick={() =>
                        void patch(
                          wallpaperTone === 'light'
                            ? 'wallpaperLight'
                            : 'wallpaperDark',
                          wallpaper.id,
                        )
                      }
                      type="button"
                    >
                      <span className="cm-new-tab-wallpaper-thumbnail">
                        <img alt="" src={wallpaper.thumbnailDataUrl} />
                        <span
                          aria-hidden="true"
                          className="cm-new-tab-wallpaper-check"
                        >
                          <Check size={11} />
                        </span>
                      </span>
                    </button>
                  ))}
                  <label
                    aria-label={`上传${wallpaperTone === 'light' ? '浅色' : '深色'}本地壁纸`}
                    className="cm-new-tab-wallpaper-upload-tile"
                  >
                    <span className="cm-new-tab-wallpaper-thumbnail">
                      <Upload aria-hidden="true" size={22} />
                    </span>
                    <input
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) =>
                        void uploadWallpaper(
                          wallpaperTone,
                          event.currentTarget.files?.[0],
                        )
                      }
                      type="file"
                    />
                  </label>
                </div>
              </section>
            )}
          </SettingsContentSection>

          <SettingsContentSection id="ai" label="AI 服务">
            <p className="cm-new-tab-settings-section-copy">
              智能问答、脚本改写与内容摘要共用这一份配置。地址、协议与模型会随
              WebDAV 同步；密钥是否同步由下方开关决定。
            </p>
            {!aiReady ? (
              <div className="cm-new-tab-settings-mode">
                <span>
                  当前页面无法访问 AI 服务配置，请在牌库的「设置」中填写。
                </span>
              </div>
            ) : (
              <>
                <Field
                  description="填写服务商的基础地址，例如 https://api.openai.com/v1。"
                  label="API 请求地址"
                >
                  <input
                    disabled={aiBusy}
                    list="cm-new-tab-ai-base-url-presets"
                    onChange={(event) =>
                      setAiDraft((current) => ({
                        ...current,
                        baseUrl: event.currentTarget.value,
                      }))
                    }
                    placeholder="https://api.example.com/v1"
                    type="url"
                    value={aiDraft.baseUrl}
                  />
                  <datalist id="cm-new-tab-ai-base-url-presets">
                    {MODEL_SERVICE_BASE_URL_PRESETS.map((candidate) => (
                      <option key={candidate.url} value={candidate.url}>
                        {candidate.label}
                      </option>
                    ))}
                  </datalist>
                </Field>
                <Field
                  description={
                    aiConfig?.modelService.hasCredential
                      ? '本机已保存密钥，留空表示沿用。'
                      : '尚未保存密钥。'
                  }
                  label="API 密钥"
                >
                  <input
                    autoComplete="off"
                    disabled={aiBusy}
                    onChange={(event) =>
                      setAiDraft((current) => ({
                        ...current,
                        apiKey: event.currentTarget.value,
                      }))
                    }
                    placeholder="输入 API 密钥"
                    spellCheck={false}
                    type="password"
                    value={aiDraft.apiKey}
                  />
                </Field>
                <div className="cm-new-tab-wallpaper-mode-state-actions">
                  <button
                    disabled={aiBusy || !aiConfig?.modelService.hasCredential}
                    onClick={() => void clearAiCredential()}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={15} />
                    清除已保存密钥
                  </button>
                </div>
                <Field
                  description="可直接填写，或从建议列表里选择服务支持的模型 ID。"
                  label="模型"
                >
                  <input
                    disabled={aiBusy}
                    list="cm-new-tab-ai-model-presets"
                    onChange={(event) =>
                      setAiDraft((current) => ({
                        ...current,
                        model: event.currentTarget.value,
                      }))
                    }
                    placeholder="gpt-5-mini"
                    spellCheck={false}
                    value={aiDraft.model}
                  />
                  <datalist id="cm-new-tab-ai-model-presets">
                    {MODEL_SERVICE_PRESETS.map((candidate) => (
                      <option key={candidate.id} value={candidate.id} />
                    ))}
                  </datalist>
                </Field>
                <Field
                  description="思考预算越高越稳，但更慢、更贵。"
                  label="推理强度"
                >
                  <select
                    disabled={aiBusy}
                    onChange={(event) =>
                      setAiDraft((current) => ({
                        ...current,
                        reasoningEffort: event.currentTarget
                          .value as AiReasoningEffort,
                      }))
                    }
                    value={aiDraft.reasoningEffort}
                  >
                    {AI_REASONING_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  description="多数自建网关使用 Chat Completions；OpenAI 官方两者皆可。"
                  label="接口协议"
                >
                  <select
                    disabled={aiBusy}
                    onChange={(event) =>
                      setAiDraft((current) => ({
                        ...current,
                        protocol: event.currentTarget.value as AiModelProtocol,
                      }))
                    }
                    value={aiDraft.protocol}
                  >
                    {AI_PROTOCOL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  description="关闭后 WebDAV 只保存地址、协议与模型，不上传密钥。"
                  label="API 密钥随 WebDAV 同步"
                >
                  <Toggle
                    checked={syncSecrets}
                    label={syncSecrets ? '同步' : '不同步'}
                    onChange={(checked) => void updateSyncSecrets(checked)}
                  />
                </Field>
                <div className="cm-new-tab-wallpaper-mode-state-actions">
                  <button
                    disabled={aiBusy}
                    onClick={() => void saveAiServices()}
                    type="button"
                  >
                    <Save aria-hidden="true" size={15} />
                    保存设置
                  </button>
                  <button
                    disabled={aiBusy}
                    onClick={() => void testAiServices()}
                    type="button"
                  >
                    <PlugZap aria-hidden="true" size={15} />
                    测试连接
                  </button>
                </div>
                {aiStatus ? (
                  <p className="cm-new-tab-settings-section-copy">{aiStatus}</p>
                ) : null}
              </>
            )}
          </SettingsContentSection>

          {capabilities.favicon ? (
            <SettingsContentSection id="favicons" label="图标与主题色">
              <Field label="网站图标">
                <Toggle
                  checked={preferences.faviconEnhanced}
                  label="增强获取"
                  onChange={(checked) => void patch('faviconEnhanced', checked)}
                />
              </Field>
              <Field label="主题色">
                <Toggle
                  checked={preferences.faviconThemeColor}
                  label="从网站图标提取"
                  onChange={(checked) =>
                    void patch('faviconThemeColor', checked)
                  }
                />
              </Field>
              <Field
                description="每行一个域名，这些网站的图标不参与主题色提取。"
                label="排除规则"
              >
                <textarea
                  onBlur={(event) =>
                    void patch(
                      'faviconExcludedDomains',
                      event.currentTarget.value
                        .split(/\r?\n/)
                        .map((entry) => entry.trim())
                        .filter(Boolean),
                    )
                  }
                  defaultValue={preferences.faviconExcludedDomains.join('\n')}
                  rows={8}
                />
              </Field>
            </SettingsContentSection>
          ) : null}

          <SettingsContentSection id="about" label="关于">
            <div className="cm-new-tab-settings-about">
              <strong>万象星核 NovaBay</strong>
              <span>一舱统御脚本、AI、视频与同步。</span>
              <span>版本 {version}（开发版）</span>
              <a
                href="https://blog.medicalstu.cn"
                rel="noreferrer"
                target="_blank"
              >
                XLL Studio 官网
              </a>
              <a
                href="https://github.com/LYiHub/Card-master-browser-extension-public"
                rel="noreferrer"
                target="_blank"
              >
                查看原项目
              </a>
            </div>
          </SettingsContentSection>
        </div>
      </div>

      {notice ? (
        <div className="cm-new-tab-notice" role="status">
          {notice}
        </div>
      ) : null}
    </main>
  );
}
