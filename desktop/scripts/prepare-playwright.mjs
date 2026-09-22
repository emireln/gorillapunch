import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const destination = resolve(import.meta.dirname, '..', 'build', 'playwright');
mkdirSync(destination, { recursive: true });
const cli = resolve(import.meta.dirname, '..', '..', 'node_modules', 'playwright', 'cli.js');
const result = spawnSync(process.execPath, [cli, 'install', 'chromium'], {
  stdio: 'inherit',
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: destination },
});
if (result.error) process.stderr.write(`${result.error.message}\n`);
if (result.status !== 0) process.exit(result.status || 1);
