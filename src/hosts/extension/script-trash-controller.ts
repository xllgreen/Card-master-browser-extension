import type {
  ScriptTrashController,
  ScriptTrashListItem,
} from '../../userscript/application/script-trash';
import { type ExtensionApi, sendExtensionRequest } from './api';
import { EXTENSION_CHANNEL } from './protocol';

type TrashResponse = {
  records?: ScriptTrashListItem[];
  count?: number;
  error?: string;
};

/** 回收站只在后台读写，内容侧拿到的永远是元数据。 */
export class ExtensionScriptTrashController implements ScriptTrashController {
  constructor(private readonly api: ExtensionApi) {}

  private async request(
    action: 'read' | 'restore' | 'discard' | 'clear',
    scriptId?: string,
  ): Promise<TrashResponse> {
    const response = await sendExtensionRequest<TrashResponse>(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'trash-command',
      action,
      ...(scriptId ? { scriptId } : {}),
    });
    if (response?.error) throw new Error(response.error);
    return response ?? {};
  }

  async list(): Promise<ScriptTrashListItem[]> {
    const response = await this.request('read');
    return response.records ?? [];
  }

  async restore(scriptId: string): Promise<void> {
    await this.request('restore', scriptId);
  }

  async discard(scriptId: string): Promise<void> {
    await this.request('discard', scriptId);
  }

  async clear(): Promise<number> {
    const response = await this.request('clear');
    return response.count ?? 0;
  }
}
