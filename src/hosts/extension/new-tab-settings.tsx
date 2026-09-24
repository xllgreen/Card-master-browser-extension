import { createRoot } from 'react-dom/client';

import {
  NewTabSettingsPage,
  newTabSettingsCapabilities,
} from '../../features/new-tab/NewTabSettingsPage';
import foundationStyles from '../../features/new-tab/new-tab-foundation.css?inline';
import settingsStyles from '../../features/new-tab/new-tab-settings.css?inline';
import { NewTabLocalWallpaperRepository } from '../../new-tab/application/local-wallpaper';
import { NewTabPreferencesRepository } from '../../new-tab/application/preferences';
import { SyncPrivacyRepository } from '../../sync/privacy';
import { ExtensionAiServicesController } from './ai-services-controller';
import { requireExtensionApi } from './api';
import { ExtensionBingWallpaperSettingsController } from './bing-wallpaper-service';
import { reportExtensionFailure } from './diagnostics';
import { extensionOverridesNewTab } from './extension-runtime-api';
import { extensionTarget } from './platform';

function extensionVersion(api: ReturnType<typeof requireExtensionApi>) {
  const runtime = api.runtime as {
    getManifest?: () => { version?: string };
  };
  return runtime.getManifest?.()?.version ?? '';
}

try {
  const api = requireExtensionApi();
  const root = document.getElementById('new-tab-settings-root');
  if (!root) throw new Error('新标签页设置缺少挂载节点。');
  const privacyRepository = new SyncPrivacyRepository(api.storage.local);
  createRoot(root).render(
    <>
      <style>{foundationStyles}</style>
      <style>{settingsStyles}</style>
      <NewTabSettingsPage
        assetUrl={(path) => api.runtime.getURL(path)}
        backUrl={api.runtime.getURL('new-tab.html')}
        capabilities={newTabSettingsCapabilities(extensionTarget())}
        overridesBrowserNewTab={extensionOverridesNewTab()}
        bingWallpaper={new ExtensionBingWallpaperSettingsController(api)}
        aiServices={new ExtensionAiServicesController(api)}
        aiSecretsSync={{
          read: async () => (await privacyRepository.read()).includeSecrets,
          write: async (value) => {
            await privacyRepository.write({ includeSecrets: value });
          },
        }}
        localWallpaperRepository={new NewTabLocalWallpaperRepository()}
        preferencesRepository={
          new NewTabPreferencesRepository(api.storage.local, api.storage.sync)
        }
        version={extensionVersion(api)}
      />
    </>,
  );
} catch (error) {
  reportExtensionFailure('new-tab-settings', 'bootstrap-failed', error);
  const root = document.getElementById('new-tab-settings-root');
  if (root) {
    root.textContent =
      error instanceof Error
        ? `新标签页设置启动失败：${error.message}`
        : '新标签页设置启动失败。';
    root.dataset.error = 'true';
  }
}
