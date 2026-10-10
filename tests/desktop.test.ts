import { afterEach, describe, expect, it } from 'vitest';
import { createClient } from '@libsql/client';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DesktopDatabase, sanitizeSettings } from '../desktop/electron/database';
import { errorMessage } from '../desktop/src/utils';

const temporary: string[] = [];
afterEach(async () => {
  for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true, maxRetries: 8, retryDelay: 125 });
});

describe('desktop local workspace', () => {
  it('removes retired game data from an existing local database', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'gorillapunch-desktop-'));
    temporary.push(userData);
    const dataDirectory = join(userData, 'data');
    await mkdir(dataDirectory, { recursive: true });
    const databaseUrl = `file:${join(dataDirectory, 'gorillapunch.db').replaceAll('\\', '/')}`;
    const oldClient = createClient({ url: databaseUrl });
    await oldClient.executeMultiple(`
      CREATE TABLE desktop_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE desktop_shot_runs (id TEXT PRIMARY KEY, body TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      INSERT INTO desktop_settings(key,value) VALUES
        ('gorilla_shot_device_id','device-id'),
        ('gorilla_shot_cloud_account-1','cached-progress'),
        ('other_setting','keep-me');
      INSERT INTO desktop_shot_runs(id,body,created_at,updated_at) VALUES('run-1','{}','2026-10-01','2026-10-01');
    `);
    await oldClient.close();

    const database = new DesktopDatabase(userData);
    expect(await database.getValue('gorilla_shot_device_id')).toBeNull();
    expect(await database.getValue('gorilla_shot_cloud_account-1')).toBeNull();
    expect(await database.getValue('other_setting')).toBe('keep-me');

    const inspectionClient = createClient({ url: databaseUrl });
    const runTable = await inspectionClient.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='desktop_shot_runs'");
    expect(runTable.rows).toEqual([]);
    await inspectionClient.close();
    await database.close();
  });

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
      workspace: 'cloud', theme: 'system', locale: 'auto', closeToTray: true, notifications: true, autoSync: true,
      defaultMode: 'quick', maxPages: 8, maxDepth: 2, maxDurationSeconds: 120, concurrency: 1,
      portScan: true, launchAtStartup: false,
    }, { workspace: 'local', autoSync: true, maxPages: 999, concurrency: 10 });
    expect(next).toMatchObject({ workspace: 'local', autoSync: false, maxPages: 30, concurrency: 3 });
  });


});

describe('desktop user feedback', () => {
  it('removes retired game preferences while preserving unrelated renderer storage', async () => {
    const values = new Map([
      ['gp-shot-volume', '0.5'],
      ['gp-shot-muted', 'true'],
      ['gp-sidebar-collapsed', 'false'],
    ]);
    const storage: Pick<Storage, 'removeItem'> = { removeItem: key => { values.delete(key); } };
    const utilities = await import('../desktop/src/utils') as unknown as {
      clearRetiredArcadePreferences?: (storage: Pick<Storage, 'removeItem'>) => void;
    };
    utilities.clearRetiredArcadePreferences?.(storage);
    expect([...values]).toEqual([['gp-sidebar-collapsed', 'false']]);
  });

  it('preserves notification strings instead of replacing them with a generic error', () => {
    expect(errorMessage('Account connected. Cloud sync is ready.')).toBe('Account connected. Cloud sync is ready.');
  });

  it('keeps readable IPC error messages after Electron serialization', () => {
    expect(errorMessage({ message: "Error invoking remote method 'cloud:sign-in': Error: Email or password is incorrect." }))
      .toBe('Email or password is incorrect.');
  });

  it('uses a fallback only when an error has no readable message', () => {
    expect(errorMessage({})).toBe('Something went wrong.');
  });
});
