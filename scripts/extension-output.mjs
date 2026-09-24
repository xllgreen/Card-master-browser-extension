import { mkdir, readdir, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

/** 诊断文案面向用户，路径统一用正斜杠，避免 Windows 上出现反斜杠写法。 */
function posixPath(value) {
  return value.split(sep).join('/');
}

/** 调试构建设计数：EXTENSION_DEV_BUILD=1 时输出未压缩代码与内联 source map。 */
export function isDevelopmentExtensionBuild(env = process.env) {
  return env.EXTENSION_DEV_BUILD === '1';
}

/**
 * 解析扩展输出根目录：显式 EXTENSION_OUTPUT_ROOT 优先，其次按构建模式取
 * extension-dev（调试）或 extension-dist（发布）。调试产物带 source map，
 * 会被发布卫生检查拒绝，因此不允许写进发布目录。
 */
export function resolveExtensionOutputRoot(env = process.env, cwd = '.') {
  const development = isDevelopmentExtensionBuild(env);
  const requested = env.EXTENSION_OUTPUT_ROOT?.trim();
  const outputRoot =
    requested || (development ? 'extension-dev' : 'extension-dist');
  if (
    development &&
    resolve(cwd, outputRoot) === resolve(cwd, 'extension-dist')
  ) {
    throw new Error(
      '调试构建不能写进 extension-dist，请改用 EXTENSION_OUTPUT_ROOT=extension-dev。',
    );
  }
  return outputRoot;
}

export async function ensureExtensionOutputRoot(output) {
  await mkdir(output, { recursive: true });
}

async function filesRecursively(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return filesRecursively(path);
      return entry.isFile() ? [path] : [];
    }),
  );
  return files.flat();
}

export async function assertDirectoryContains(source, destination) {
  const sourceFiles = await filesRecursively(source);
  const failures = [];
  for (const sourcePath of sourceFiles) {
    const path = relative(source, sourcePath);
    const [sourceMetadata, destinationMetadata] = await Promise.all([
      stat(sourcePath),
      stat(resolve(destination, path)).catch(() => null),
    ]);
    if (!destinationMetadata?.isFile()) {
      failures.push(`${posixPath(path)}: missing`);
      continue;
    }
    if (destinationMetadata.size !== sourceMetadata.size) {
      failures.push(
        `${posixPath(path)}: expected ${sourceMetadata.size} bytes, found ${destinationMetadata.size}`,
      );
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `Extension resource tree is incomplete:\n${failures.join('\n')}`,
    );
  }
}

export async function assertDirectoriesMatch(source, destination) {
  const [sourceFiles, destinationFiles] = await Promise.all([
    filesRecursively(source),
    filesRecursively(destination),
  ]);
  const sourcePaths = new Set(
    sourceFiles.map((path) => relative(source, path)),
  );
  const extra = destinationFiles
    .map((path) => relative(destination, path))
    .filter((relativePath) => !sourcePaths.has(relativePath))
    .map(posixPath);
  if (extra.length > 0) {
    throw new Error(
      `Extension resource tree contains unexpected files:\n${extra.join('\n')}`,
    );
  }
  await assertDirectoryContains(source, destination);
}
