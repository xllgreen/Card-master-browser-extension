import type { ExtensionBackgroundApi } from './api';

type BackgroundLifecycleOptions = {
  api: ExtensionBackgroundApi;
  alarms: {
    contentBlocking: string;
    userscriptUpdates: string;
    bingWallpaper: string;
    sync: string;
  };
  initialize: () => Promise<void>;
  storageAvailable: () => boolean;
  refreshContentBlocking: () => Promise<void>;
  runUserscriptUpdates: () => Promise<void>;
  runBingWallpaper: () => Promise<unknown>;
  runSync: () => Promise<unknown>;
  refreshExistingPages: () => Promise<unknown>;
  reportFailure: (context: string, error: unknown) => void;
};

export function installBackgroundLifecycle({
  api,
  alarms,
  initialize,
  storageAvailable,
  refreshContentBlocking,
  runUserscriptUpdates,
  runBingWallpaper,
  runSync,
  refreshExistingPages,
  reportFailure,
}: BackgroundLifecycleOptions) {
  api.alarms.onAlarm.addListener((alarm) => {
    const run = async () => {
      await initialize();
      if (!storageAvailable()) return;
      if (alarm.name === alarms.contentBlocking) {
        await refreshContentBlocking();
      } else if (alarm.name === alarms.userscriptUpdates) {
        await runUserscriptUpdates();
      } else if (alarm.name === alarms.bingWallpaper) {
        await runBingWallpaper();
      } else if (alarm.name === alarms.sync) {
        await runSync();
      }
    };
    if (
      alarm.name === alarms.contentBlocking ||
      alarm.name === alarms.userscriptUpdates ||
      alarm.name === alarms.bingWallpaper ||
      alarm.name === alarms.sync
    ) {
      void run().catch((error) =>
        reportFailure(`后台定时任务 ${alarm.name} 失败`, error),
      );
    }
  });

  api.runtime.onInstalled.addListener(() => {
    void initialize()
      .then(refreshExistingPages)
      .catch((error) => reportFailure('安装初始化失败', error));
  });
  api.runtime.onStartup.addListener(() => {
    void initialize().catch((error) => reportFailure('启动初始化失败', error));
  });
  void initialize()
    .then(async () => {
      if (storageAvailable()) await runBingWallpaper();
    })
    .catch((error) => reportFailure('后台初始化失败', error));
}
