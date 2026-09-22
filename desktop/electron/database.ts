import { createClient, type Client } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DesktopReport, DesktopScan, DesktopScreenshot, DesktopSettings, WatchProject } from '../shared/types';

const defaults: DesktopSettings = {
  workspace: 'local',
  theme: 'system',
  closeToTray: true,
  notifications: true,
  autoSync: true,
  defaultMode: 'quick',
  maxPages: 8,
  maxDepth: 2,
  maxDurationSeconds: 120,
  concurrency: 1,
  portScan: true,
  launchAtStartup: false,
};

export class DesktopDatabase {
  private readonly client: Client;
  private readonly screenshotsRoot: string;
  private ready: Promise<void>;

  constructor(private readonly userData: string) {
    const runtime = join(userData, 'data');
    // libSQL opens the file eagerly, before the asynchronous schema setup.
    mkdirSync(runtime, { recursive: true });
    this.screenshotsRoot = resolve(runtime, 'screenshots');
    const databasePath = join(runtime, 'gorillapunch.db').replaceAll('\\', '/');
    this.client = createClient({ url: `file:${databasePath}` });
    this.ready = this.initialize(runtime);
  }

  private async initialize(runtime: string) {
    await mkdir(runtime, { recursive: true });
    await mkdir(this.screenshotsRoot, { recursive: true });
    await this.client.executeMultiple(`
      PRAGMA foreign_keys=ON;
      PRAGMA journal_mode=WAL;
      PRAGMA busy_timeout=10000;
      CREATE TABLE IF NOT EXISTS desktop_scans (
        id TEXT PRIMARY KEY,
        body TEXT NOT NULL CHECK(json_valid(body)),
        created_at TEXT NOT NULL,
        status TEXT NOT NULL,
        storage TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS desktop_scans_created ON desktop_scans(created_at DESC);
      CREATE INDEX IF NOT EXISTS desktop_scans_status ON desktop_scans(status);
      CREATE TABLE IF NOT EXISTS desktop_reports (
        scan_id TEXT PRIMARY KEY REFERENCES desktop_scans(id) ON DELETE CASCADE,
        body TEXT NOT NULL CHECK(json_valid(body))
      );
      CREATE TABLE IF NOT EXISTS desktop_screenshots (
        id TEXT PRIMARY KEY,
        scan_id TEXT NOT NULL REFERENCES desktop_scans(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        viewport TEXT NOT NULL,
        path TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS desktop_screenshots_scan ON desktop_screenshots(scan_id);
      CREATE TABLE IF NOT EXISTS desktop_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS desktop_watchers (
        id TEXT PRIMARY KEY,
        body TEXT NOT NULL CHECK(json_valid(body))
      );
      CREATE TABLE IF NOT EXISTS desktop_game_scores (
        id TEXT PRIMARY KEY,
        score INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS desktop_game_scores_date ON desktop_game_scores(created_at DESC);
    `);
    await this.recoverInterruptedScans();
  }

  private async recoverInterruptedScans() {
    const rows = await this.client.execute("SELECT body FROM desktop_scans WHERE status IN ('queued','running')");
    for (const row of rows.rows) {
      const scan = JSON.parse(String(row.body)) as DesktopScan;
      const recovered: DesktopScan = { ...scan, status: 'failed', stage: 'Desktop app closed before this punch completed', error_code: 'APP_INTERRUPTED', finished_at: new Date().toISOString() };
      await this.client.execute({
        sql: 'UPDATE desktop_scans SET body=?,status=? WHERE id=?',
        args: [JSON.stringify(recovered), recovered.status, recovered.id],
      });
    }
  }

  async saveScan(scan: DesktopScan) {
    await this.ready;
    await this.client.execute({
      sql: 'INSERT INTO desktop_scans(id,body,created_at,status,storage) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,status=excluded.status,storage=excluded.storage',
      args: [scan.id, JSON.stringify(scan), scan.created_at, scan.status, scan.storage],
    });
    return scan;
  }

  async scan(id: string) {
    await this.ready;
    const result = await this.client.execute({ sql: 'SELECT body FROM desktop_scans WHERE id=?', args: [id] });
    return result.rows.length ? JSON.parse(String(result.rows[0].body)) as DesktopScan : null;
  }

  async history() {
    await this.ready;
    const result = await this.client.execute('SELECT body FROM desktop_scans ORDER BY created_at DESC LIMIT 500');
    return result.rows.map(row => JSON.parse(String(row.body)) as DesktopScan);
  }

  async saveReport(report: DesktopReport) {
    await this.ready;
    const serializable = { ...report, screenshots: report.screenshots.map(shot => ({ id: shot.id, scan_id: shot.scan_id, url: shot.url, viewport: shot.viewport, path: shot.path })) };
    await this.client.execute({
      sql: 'INSERT INTO desktop_reports(scan_id,body) VALUES(?,?) ON CONFLICT(scan_id) DO UPDATE SET body=excluded.body',
      args: [report.scan.id, JSON.stringify(serializable)],
    });
  }

  async saveScreenshot(scanId: string, input: { url: string; viewport: string; bytes: Buffer }) {
    await this.ready;
    const id = randomUUID();
    const folder = resolve(this.screenshotsRoot, scanId);
    if (!folder.startsWith(`${this.screenshotsRoot}${sep}`) && folder !== this.screenshotsRoot) throw new Error('Invalid screenshot destination');
    await mkdir(folder, { recursive: true });
    const path = join(folder, `${id}.jpg`);
    await writeFile(path, input.bytes, { flag: 'wx' });
    const screenshot: DesktopScreenshot = { id, scan_id: scanId, url: input.url, viewport: input.viewport, path };
    await this.client.execute({ sql: 'INSERT INTO desktop_screenshots(id,scan_id,url,viewport,path) VALUES(?,?,?,?,?)', args: [id, scanId, input.url, input.viewport, path] });
    return screenshot;
  }

  async report(scanId: string): Promise<DesktopReport | null> {
    await this.ready;
    const result = await this.client.execute({ sql: 'SELECT body FROM desktop_reports WHERE scan_id=?', args: [scanId] });
    if (!result.rows.length) return null;
    const report = JSON.parse(String(result.rows[0].body)) as DesktopReport;
    const shots = await this.client.execute({ sql: 'SELECT id,scan_id,url,viewport,path FROM desktop_screenshots WHERE scan_id=? ORDER BY viewport DESC', args: [scanId] });
    report.screenshots = await Promise.all(shots.rows.map(async row => {
      const path = String(row.path);
      let data_url: string | undefined;
      try {
        const bytes = await readFile(path);
        data_url = `data:image/jpeg;base64,${bytes.toString('base64')}`;
      } catch { /* A report remains usable if a user removed its screenshot files. */ }
      return { id: String(row.id), scan_id: String(row.scan_id), url: String(row.url), viewport: String(row.viewport), path, data_url };
    }));
    return report;
  }

  async deleteScan(id: string) {
    await this.ready;
    await this.client.execute({ sql: 'DELETE FROM desktop_scans WHERE id=?', args: [id] });
    const folder = resolve(this.screenshotsRoot, id);
    if (folder.startsWith(`${this.screenshotsRoot}${sep}`) && folder !== this.screenshotsRoot) await rm(folder, { recursive: true, force: true });
  }

  async settings(): Promise<DesktopSettings> {
    await this.ready;
    const result = await this.client.execute("SELECT value FROM desktop_settings WHERE key='preferences'");
    if (!result.rows.length) return { ...defaults };
    try { return { ...defaults, ...JSON.parse(String(result.rows[0].value)) as Partial<DesktopSettings> }; }
    catch { return { ...defaults }; }
  }

  async saveSettings(settings: DesktopSettings) {
    await this.ready;
    await this.setValue('preferences', JSON.stringify(settings));
    return settings;
  }

  async getValue(key: string) {
    await this.ready;
    const result = await this.client.execute({ sql: 'SELECT value FROM desktop_settings WHERE key=?', args: [key] });
    return result.rows.length ? String(result.rows[0].value) : null;
  }

  async setValue(key: string, value: string) {
    await this.ready;
    await this.client.execute({ sql: 'INSERT INTO desktop_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', args: [key, value] });
  }

  async removeValue(key: string) {
    await this.ready;
    await this.client.execute({ sql: 'DELETE FROM desktop_settings WHERE key=?', args: [key] });
  }

  async watchers() {
    await this.ready;
    const result = await this.client.execute("SELECT body FROM desktop_watchers ORDER BY json_extract(body,'$.folder')");
    return result.rows.map(row => JSON.parse(String(row.body)) as WatchProject);
  }

  async saveWatcher(watcher: WatchProject) {
    await this.ready;
    await this.client.execute({ sql: 'INSERT INTO desktop_watchers(id,body) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body', args: [watcher.id, JSON.stringify(watcher)] });
    return watcher;
  }

  async removeWatcher(id: string) {
    await this.ready;
    await this.client.execute({ sql: 'DELETE FROM desktop_watchers WHERE id=?', args: [id] });
  }

  async saveGameScore(score: number): Promise<{ localBest: number; lastScore: number }> {
    await this.ready;
    const cleanScore = Math.max(0, Math.floor(score));
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.client.execute({
      sql: 'INSERT INTO desktop_game_scores(id, score, created_at) VALUES(?, ?, ?)',
      args: [id, cleanScore, now],
    });
    const currentBestRaw = await this.getValue('game_high_score');
    const currentBest = currentBestRaw ? parseInt(currentBestRaw, 10) || 0 : 0;
    const nextBest = Math.max(currentBest, cleanScore);
    await this.setValue('game_high_score', String(nextBest));
    return { localBest: nextBest, lastScore: cleanScore };
  }

  async getGameHighScore(): Promise<number> {
    await this.ready;
    const currentBestRaw = await this.getValue('game_high_score');
    if (currentBestRaw) return parseInt(currentBestRaw, 10) || 0;
    const result = await this.client.execute('SELECT MAX(score) as best FROM desktop_game_scores');
    if (result.rows.length && result.rows[0].best !== null) {
      return Number(result.rows[0].best) || 0;
    }
    return 0;
  }

  async close() { await this.client.close(); }
}

export function sanitizeSettings(current: DesktopSettings, patch: Partial<DesktopSettings>): DesktopSettings {
  const next = { ...current };
  if (patch.workspace === 'local' || patch.workspace === 'cloud') next.workspace = patch.workspace;
  if (patch.theme && ['system', 'dark', 'light'].includes(patch.theme)) next.theme = patch.theme;
  for (const key of ['closeToTray', 'notifications', 'autoSync', 'portScan', 'launchAtStartup'] as const) if (typeof patch[key] === 'boolean') next[key] = patch[key]!;
  if (patch.defaultMode === 'quick' || patch.defaultMode === 'full') next.defaultMode = patch.defaultMode;
  if (Number.isInteger(patch.maxPages)) next.maxPages = Math.max(1, Math.min(30, patch.maxPages!));
  if (Number.isInteger(patch.maxDepth)) next.maxDepth = Math.max(0, Math.min(4, patch.maxDepth!));
  if (Number.isInteger(patch.maxDurationSeconds)) next.maxDurationSeconds = Math.max(30, Math.min(600, patch.maxDurationSeconds!));
  if (Number.isInteger(patch.concurrency)) next.concurrency = Math.max(1, Math.min(3, patch.concurrency!));
  if (next.workspace === 'local') next.autoSync = false;
  return next;
}
