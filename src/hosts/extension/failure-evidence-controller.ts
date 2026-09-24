import type {
  FailureEvidenceController,
  FailureEvidenceListResult,
  FailureEvidenceReportResult,
} from '../../diagnostics/failure-evidence';
import { type ExtensionApi, sendExtensionRequest } from './api';
import { EXTENSION_CHANNEL } from './protocol';

/** 失败留证存放在扩展会话存储里，读取与下载都交给后台。 */
export class ExtensionFailureEvidenceController
  implements FailureEvidenceController
{
  constructor(private readonly api: ExtensionApi) {}

  async list(): Promise<FailureEvidenceListResult> {
    const response = await sendExtensionRequest<
      Partial<FailureEvidenceListResult> & { error?: string }
    >(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'failure-evidence-command',
      action: 'read',
    });
    if (response?.error) throw new Error(response.error);
    if (!response || !Array.isArray(response.records)) {
      throw new Error('失败留证没有返回结果。');
    }
    return {
      records: response.records,
      summary: response.summary ?? {
        total: response.records.length,
        withScreenshot: 0,
        latestAt: null,
        scripts: [],
      },
    };
  }

  async download(evidenceId: string): Promise<FailureEvidenceReportResult> {
    const response = await sendExtensionRequest<
      Partial<FailureEvidenceReportResult> & { error?: string }
    >(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'failure-evidence-command',
      action: 'download',
      evidenceId,
    });
    if (response?.error) throw new Error(response.error);
    if (
      !response ||
      typeof response.text !== 'string' ||
      typeof response.filename !== 'string'
    ) {
      throw new Error('失败留证没有可下载的内容。');
    }
    return { filename: response.filename, text: response.text };
  }
}
