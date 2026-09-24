import { useCallback, useEffect, useRef, useState } from 'react';
import type { LocalBackupController } from '../../backup/local-backup';
import { DiagnosticCopyButton } from '../../components/ui/DiagnosticCopyButton';
import { UiButton, UiNotice } from '../../components/ui/Ui';
import type {
  FailureEvidenceController,
  FailureEvidenceListResult,
} from '../../diagnostics/failure-evidence';
import {
  formatPermissionHealthReport,
  type PermissionHealthController,
  type PermissionHealthReport,
} from '../../permission-health/domain';
import type { SyncConnection } from '../../sync/model';
import { scriptParticipatesInSync } from '../../sync/projection';
import type { ScriptRepository } from '../../userscript/application/script-repository';
import type {
  ScriptTrashController,
  ScriptTrashListItem,
} from '../../userscript/application/script-trash';

function errorMessage(failure: unknown) {
  if (failure instanceof Error && failure.message) return failure.message;
  return '操作没有完成，请稍后重试。';
}

function formatTime(at: number) {
  if (!Number.isFinite(at) || at <= 0) return '未知时间';
  return new Date(at).toLocaleString('zh-CN', { hour12: false });
}

function downloadText(text: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  queueMicrotask(() => URL.revokeObjectURL(url));
}

/** 本机备份：完全离线的一份 JSON，包含牌库、偏好和 WebDAV 设置。 */
export function LocalBackupBoard({
  controller,
  onRestoreWebdav,
}: {
  controller: LocalBackupController;
  onRestoreWebdav?: (connection: SyncConnection) => void;
}) {
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const runExport = async () => {
    setBusy('export');
    setStatus('');
    setError('');
    try {
      const result = await controller.export();
      downloadText(result.text, result.filename);
      setStatus(`已导出备份文件：${result.summary}`);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(null);
    }
  };

  const runImport = async (file: File) => {
    setBusy('import');
    setStatus('');
    setError('');
    try {
      const text = await file.text();
      const result = await controller.import(text);
      if (result.webdav && onRestoreWebdav) onRestoreWebdav(result.webdav);
      const skipped =
        result.skipped.length > 0
          ? `，${result.skipped.length} 项未能覆盖`
          : '';
      setStatus(`已导入备份：${result.summary}${skipped}`);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <section className="manager-data-section">
      <header className="manager-data-section__heading">
        <strong>本机备份</strong>
        <p>把全部卡牌、偏好设置和跨设备同步地址存成一个文件，不经过网络。</p>
      </header>
      <UiNotice tone="warning" title="备份文件包含敏感信息">
        <p>
          文件里带有 WebDAV
          账号与密码、接口密钥等设置，请只保存在自己的电脑上，不要发到群里或网盘公开链接。
        </p>
      </UiNotice>
      {status ? <UiNotice title="备份结果">{<p>{status}</p>}</UiNotice> : null}
      {error ? (
        <UiNotice tone="error" title="备份操作未完成" copyText={error}>
          <p>{error}</p>
        </UiNotice>
      ) : null}
      <div className="manager-library-transfer__actions">
        <UiButton
          disabled={busy !== null}
          onClick={() => fileRef.current?.click()}
        >
          导入备份文件
        </UiButton>
        <UiButton
          variant="primary"
          disabled={busy !== null}
          onClick={() => void runExport()}
        >
          {busy === 'export' ? '正在导出…' : '导出到本机'}
        </UiButton>
      </div>
      <input
        ref={fileRef}
        type="file"
        hidden
        accept=".json,application/json"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void runImport(file);
        }}
      />
    </section>
  );
}

/** 回收站：删除的卡牌保留 30 天，可以原样放回牌库。 */
export function ScriptTrashBoard({
  controller,
}: {
  controller: ScriptTrashController;
}) {
  const [items, setItems] = useState<ScriptTrashListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await controller.list());
    } catch (failure) {
      setError(errorMessage(failure));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [controller]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await action();
      setStatus(message);
      await refresh();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="manager-data-section">
      <header className="manager-data-section__heading">
        <strong>回收站</strong>
        <p>删掉的卡牌在这里保留 30 天，随时可以放回牌库。</p>
      </header>
      {status ? (
        <UiNotice title="回收站已更新">{<p>{status}</p>}</UiNotice>
      ) : null}
      {error ? (
        <UiNotice tone="error" title="回收站读取失败" copyText={error}>
          <p>{error}</p>
        </UiNotice>
      ) : null}
      {loading ? (
        <UiNotice title="正在读取回收站">
          <p>请稍候。</p>
        </UiNotice>
      ) : null}
      {!loading && items.length === 0 ? (
        <UiNotice title="回收站是空的">
          <p>删除卡牌后会出现在这里。</p>
        </UiNotice>
      ) : null}
      {items.length > 0 ? (
        <div className="manager-data-list">
          {items.map((item) => (
            <div className="app-ui-action-row" key={item.scriptId}>
              <div className="app-ui-action-row__copy">
                <strong>{item.name}</strong>
                <div>
                  {`删除于 ${formatTime(item.removedAt)} · 还剩 ${item.remainingDays} 天`}
                </div>
              </div>
              <div className="app-ui-action-row__actions">
                <UiButton
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => controller.restore(item.scriptId),
                      `已放回「${item.name}」。`,
                    )
                  }
                >
                  放回牌库
                </UiButton>
                <UiButton
                  variant="danger"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => controller.discard(item.scriptId),
                      `已彻底删除「${item.name}」。`,
                    )
                  }
                >
                  彻底删除
                </UiButton>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {items.length > 0 ? (
        <div className="manager-diagnostic__actions">
          <UiButton
            disabled={busy}
            onClick={() =>
              void run(
                () => controller.clear(),
                `已清空回收站，共 ${items.length} 张卡牌。`,
              )
            }
          >
            清空回收站
          </UiButton>
          <UiButton disabled={busy} onClick={() => void refresh()}>
            重新读取
          </UiButton>
        </div>
      ) : null}
    </section>
  );
}

const STATUS_LABELS: Record<string, string> = {
  ok: '正常',
  warning: '需要注意',
  error: '已失效',
};

/** 权限自检：一眼看出脚本跑不起来到底是哪一环的问题。 */
export function PermissionHealthBoard({
  controller,
}: {
  controller: PermissionHealthController;
}) {
  const [report, setReport] = useState<PermissionHealthReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setReport(await controller.read());
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }, [controller]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const text = report ? formatPermissionHealthReport(report) : '';
  return (
    <section className="manager-data-section">
      <header className="manager-data-section__heading">
        <strong>权限与运行条件</strong>
        <p>检查脚本执行权限、当前站点授权、卡牌报错和本机存储。</p>
      </header>
      {error ? (
        <UiNotice tone="error" title="自检未完成" copyText={error}>
          <p>{error}</p>
        </UiNotice>
      ) : null}
      {report?.ok ? (
        <UiNotice title="全部正常">
          <p>{`最近检查：${formatTime(report.checkedAt)}`}</p>
        </UiNotice>
      ) : null}
      {report && !report.ok ? (
        <UiNotice tone="warning" title="有项目需要你处理" copyText={text}>
          <p>{`最近检查：${formatTime(report.checkedAt)}`}</p>
        </UiNotice>
      ) : null}
      {report ? (
        <div className="manager-data-list">
          {report.items.map((item) => (
            <div className="app-ui-action-row" key={item.id}>
              <div className="app-ui-action-row__copy">
                <strong>{`${item.label} · ${STATUS_LABELS[item.status] ?? '未知'}`}</strong>
                <div>{item.detail}</div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <div className="manager-diagnostic__actions">
        <UiButton
          disabled={busy}
          onClick={() => {
            void refresh();
          }}
        >
          {busy ? '正在检查…' : '重新检查'}
        </UiButton>
        {text ? (
          <DiagnosticCopyButton text={text} label="复制自检结果" />
        ) : null}
      </div>
    </section>
  );
}

const SHOT_LABELS: Record<string, string> = {
  available: '已留存页面截图',
  skipped: '未截图（节流或无需）',
  failed: '截图失败',
};

/** 失败留证：脚本报错时自动记下的现场信息，可导出一份排查文件。 */
export function FailureEvidenceBoard({
  controller,
}: {
  controller: FailureEvidenceController;
}) {
  const [result, setResult] = useState<FailureEvidenceListResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setResult(await controller.list());
    } catch (failure) {
      setError(errorMessage(failure));
      setResult(null);
    } finally {
      setBusy(false);
    }
  }, [controller]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const download = async (evidenceId: string) => {
    setBusy(true);
    setError('');
    try {
      const report = await controller.download(evidenceId);
      downloadText(report.text, report.filename);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const records = result?.records ?? [];
  return (
    <section className="manager-data-section">
      <header className="manager-data-section__heading">
        <strong>脚本失败留证</strong>
        <p>
          卡牌运行报错时自动记下页面地址、错误内容和建议复现步骤，只保留最近 12
          条，关闭浏览器后自动清空。
        </p>
      </header>
      {error ? (
        <UiNotice tone="error" title="留证读取失败" copyText={error}>
          <p>{error}</p>
        </UiNotice>
      ) : null}
      {!busy && records.length === 0 ? (
        <UiNotice title="目前没有留证记录">
          <p>脚本正常运行时不会留下任何内容。</p>
        </UiNotice>
      ) : null}
      {records.length > 0 ? (
        <div className="manager-data-list">
          {records.map((item) => (
            <div className="app-ui-action-row" key={item.evidenceId}>
              <div className="app-ui-action-row__copy">
                <strong>{`${item.scriptName} · ${formatTime(item.failedAt)}`}</strong>
                <div>{item.error}</div>
                <div>{item.reproduction}</div>
                <div>{SHOT_LABELS[item.screenshot] ?? '截图状态未知'}</div>
              </div>
              <div className="app-ui-action-row__actions">
                <UiButton
                  disabled={busy}
                  onClick={() => void download(item.evidenceId)}
                >
                  导出留证
                </UiButton>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {records.length > 0 ? (
        <div className="manager-diagnostic__actions">
          <UiButton disabled={busy} onClick={() => void refresh()}>
            重新读取
          </UiButton>
        </div>
      ) : null}
    </section>
  );
}

/** 选择性同步提示：告诉用户有几张卡牌被排除在同步之外。 */
export function SyncScopeNote({
  repository,
}: {
  repository: ScriptRepository;
}) {
  const [excluded, setExcluded] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    void repository
      .list()
      .then((scripts) => {
        if (!active) return;
        setExcluded(
          scripts
            .filter((script) => !scriptParticipatesInSync(script))
            .map((script) => script.metadata.name),
        );
      })
      .catch(() => {
        if (active) setExcluded([]);
      });
    return () => {
      active = false;
    };
  }, [repository]);

  if (excluded.length === 0) return null;
  return (
    <UiNotice tone="warning" title="部分卡牌不参与同步">
      <p>{`${excluded.length} 张卡牌已设为仅本机保存，它们在远端不会被新增、更新或删除。`}</p>
      <p>{excluded.slice(0, 8).join('、')}</p>
      {excluded.length > 8 ? <p>……</p> : null}
      <p>在卡牌管理里打开「参与跨设备同步」即可恢复。</p>
    </UiNotice>
  );
}
