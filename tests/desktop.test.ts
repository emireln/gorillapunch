import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DesktopDatabase, sanitizeSettings } from '../desktop/electron/database';

const temporary: string[] = [];
afterEach(async () => {
  for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true, maxRetries: 8, retryDelay: 125 });
});

describe('desktop local workspace', () => {
  it('creates SQLite storage from a clean application-data directory', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'gorillapunch-desktop-'));
    temporary.push(userData);
    const database = new DesktopDatabase(userData);
    expect(await database.history()).toEqual([]);
    expect((await database.settings()).workspace).toBe('local');
    await database.close();
    expect((await stat(join(userData, 'data', 'gorillapunch.db'))).isFile()).toBe(true);
  });

  it('keeps local workspace cloud sync disabled and clamps scan budgets', () => {
    const next = sanitizeSettings({
      workspace: 'cloud', theme: 'system', closeToTray: true, notifications: true, autoSync: true,
      defaultMode: 'quick', maxPages: 8, maxDepth: 2, maxDurationSeconds: 120, concurrency: 1,
      portScan: true, launchAtStartup: false,
    }, { workspace: 'local', autoSync: true, maxPages: 999, concurrency: 10 });
    expect(next).toMatchObject({ workspace: 'local', autoSync: false, maxPages: 30, concurrency: 3 });
  });
});
