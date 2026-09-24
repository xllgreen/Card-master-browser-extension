import type { BingWallpaperService } from './bing-wallpaper-service';
import {
  type LumnoNewTabCompatibilityService,
  lumnoNewTabRequest,
} from './lumno-new-tab-compat';
import { newTabRequest } from './new-tab-protocol';
import type { ExtensionNewTabService } from './new-tab-service';

type NewTabBackgroundRouterDependencies = {
  compatibility: LumnoNewTabCompatibilityService;
  service: ExtensionNewTabService;
  bingWallpaper: BingWallpaperService;
  reportFailure: (context: string, error: unknown) => void;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function routeNewTabBackgroundMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
  dependencies: NewTabBackgroundRouterDependencies,
) {
  if (lumnoNewTabRequest(message)) {
    void dependencies.compatibility
      .handle(message, sender)
      .then(sendResponse)
      .catch((error) => {
        dependencies.reportFailure('新标签页后台请求失败', error);
        sendResponse({ ok: false, error: errorMessage(error) });
      });
    return true;
  }
  if (!newTabRequest(message)) return false;
  if (message.type === 'new-tab-bing-wallpaper-refresh') {
    void dependencies.bingWallpaper
      .refresh(true)
      .then((snapshot) => sendResponse({ snapshot }))
      .catch((error) => {
        dependencies.reportFailure('必应每日壁纸刷新失败', error);
        sendResponse({ error: errorMessage(error) });
      });
    return true;
  }
  void dependencies.service
    .handle(message, sender)
    .then(sendResponse)
    .catch((error) => {
      dependencies.reportFailure('新标签页后台请求失败', error);
      sendResponse({ error: errorMessage(error) });
    });
  return true;
}
