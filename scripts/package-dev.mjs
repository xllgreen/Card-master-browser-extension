import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
if (
  !args.some((arg) => arg === '--platform' || arg.startsWith('--platform='))
) {
  args.push('--platform=chromium');
}

const result = spawnSync(
  process.execPath,
  ['scripts/package-extensions.mjs', ...args],
  {
    cwd: root,
    env: { ...process.env, EXTENSION_DEV_BUILD: '1' },
    stdio: 'inherit',
  },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
