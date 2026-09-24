import type {
  PermissionHealthController,
  PermissionHealthReport,
} from '../../permission-health/domain';
import { type ExtensionApi, sendExtensionRequest } from './api';
import { EXTENSION_CHANNEL } from './protocol';

/** 权限自检由后台读取，内容侧只展示结果。 */
export class ExtensionPermissionHealthController
  implements PermissionHealthController
{
  constructor(private readonly api: ExtensionApi) {}

  async read(): Promise<PermissionHealthReport> {
    const response = await sendExtensionRequest<
      Partial<PermissionHealthReport> & { error?: string }
    >(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'permission-health-read',
    });
    if (response?.error) throw new Error(response.error);
    if (!response || !Array.isArray(response.items)) {
      throw new Error('权限自检没有返回结果。');
    }
    return {
      ok: Boolean(response.ok),
      checkedAt: response.checkedAt ?? Date.now(),
      items: response.items,
    };
  }
}
