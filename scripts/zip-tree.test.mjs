import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { readZipArchive } from '../src/userscript/application/zip-archive.ts';
import { archiveExtension } from './archive-extension.mjs';
import { createZipArchiveFromDirectory } from './zip-tree.mjs';

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true })),
  );
});

function stagedRoot(prefix) {
  return mkdtemp(join(tmpdir(), prefix)).then((root) => {
    temporaryRoots.push(root);
    return root;
  });
}

const WORDS = [
  'declarativeNetRequest',
  'urlFilter',
  'redirect',
  'block',
  'thirdParty',
  'main_frame',
  'cssSelector',
  'hideElement',
  'exceptions',
  'important',
];

/** 模拟真实发布产物：既有可压缩的规则文本，也有压不动的二进制资源。 */
function ruleSetText() {
  return Array.from(
    { length: 2_000 },
    (_, index) =>
      `{"id":${index},"action":"${WORDS[index % WORDS.length]}","filter":"||example${index % 37}.com^$script"}`,
  ).join('\n');
}

function incompressibleBytes() {
  const bytes = new Uint8Array(4_096);
  let state = 123_456_789;
  for (let index = 0; index < bytes.length; index += 1) {
    state = (state * 1_103_515_245 + 12_345) & 0x7fffffff;
    bytes[index] = state & 0xff;
  }
  return Buffer.from(bytes);
}

async function writeSampleTree(root) {
  await mkdir(join(root, 'filters', 'sub'), { recursive: true });
  await mkdir(join(root, '资源'), { recursive: true });
  const files = {
    'manifest.json': '{"manifest_version":3,"name":"万象星核"}',
    'empty.txt': '',
    'compressible.js': ruleSetText(),
    'binary.bin': incompressibleBytes(),
    'filters/sub/rules.json': '{"id":7}',
    '资源/说明.txt': '打包测试',
  };
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(root, ...name.split('/')), content);
  }
  return files;
}

describe('cross-platform extension archive', () => {
  it('writes an archive the in-app reader unpacks byte for byte', async () => {
    const source = await stagedRoot('novabay-zip-source-');
    const expected = await writeSampleTree(source);
    const archive = join(source, '..', 'novabay-sample.zip');
    const listing = await createZipArchiveFromDirectory(source, archive);

    expect(listing).toContain('manifest.json');
    expect(listing).toContain('filters/');
    expect(listing).toContain('资源/说明.txt');

    const entries = await readZipArchive(
      new Uint8Array(await readFile(archive)),
    );
    expect([...entries.keys()].sort()).toEqual([...listing].sort());
    const decoder = new TextDecoder();
    for (const [name, content] of Object.entries(expected)) {
      const raw = typeof content === 'string' ? content : null;
      if (raw === null) {
        expect(entries.get(name)).toEqual(new Uint8Array(content));
        continue;
      }
      expect(decoder.decode(entries.get(name))).toBe(raw);
    }

    // 压缩要真的生效：136 MB 的产物若按原样打包，商店上传会被拒。
    const rawBytes = Object.values(expected).reduce(
      (total, content) =>
        total +
        (typeof content === 'string'
          ? Buffer.byteLength(content)
          : content.byteLength),
      0,
    );
    expect((await stat(archive)).size).toBeLessThan(rawBytes);
  });

  it('keeps release hygiene checks and the root manifest requirement', async () => {
    const source = await stagedRoot('novabay-zip-clean-');
    await writeSampleTree(source);
    const archive = join(source, '..', 'novabay-clean.zip');
    await expect(archiveExtension(source, archive)).resolves.toContain(
      'manifest.json',
    );

    await mkdir(join(source, '_metadata'), { recursive: true });
    await writeFile(join(source, '_metadata', 'rules'), 'cache');
    await expect(
      archiveExtension(source, join(source, '..', 'novabay-dirty.zip')),
    ).rejects.toThrow('forbidden component');

    const bare = await stagedRoot('novabay-zip-bare-');
    await writeFile(join(bare, 'content.js'), 'export {};');
    await expect(
      archiveExtension(bare, join(bare, '..', 'novabay-bare.zip')),
    ).rejects.toThrow('must contain manifest.json at its root');
  });
});
