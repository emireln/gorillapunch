import { app, BrowserWindow, clipboard, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import type { CloudCredentials, DesktopSettings, SignUpCredentials, WatchProject, WorkspaceMode, ExportFormat } from '../shared/types';
import type { DesktopDatabase } from './database';
import { sanitizeSettings } from './database';
import type { CloudService } from './cloud';
import type { ScanManager } from './scanner';
import type { WatcherService } from './watchers';
import { detectLocalServers } from './servers';
import { exportReport } from './exports';
import { openInspector } from './inspector';
import { actionableFindings, buildFixPrompt } from '../../src/core/fix-prompt';

interface Services {
  window: BrowserWindow;
  database: DesktopDatabase;
  cloud: CloudService;
  scans: ScanManager;
  watchers: WatcherService;
  requestClose(): void;
  checkForUpdates(): Promise<string>;
}

export function registerIpc(services: Services) {
  const handle = <T extends unknown[]>(channel: string, action: (event: IpcMainInvokeEvent, ...args: T) => unknown) => {
    ipcMain.handle(channel, async (event, ...args: T) => {
      assertTrusted(event);
      try { return await action(event, ...args); }
      catch (error) { throw new Error(error instanceof Error ? error.message : 'The desktop action failed.'); }
    });
  };
  handle('window:minimize', () => services.window.minimize());
  handle('window:maximize', () => services.window.isMaximized() ? services.window.unmaximize() : services.window.maximize());
  handle('window:close', () => services.requestClose());
  handle('window:is-maximized', () => services.window.isMaximized());

  handle<[string, { mode: 'quick' | 'full'; workspace: WorkspaceMode }]>('scans:start', (_event, url, options) => services.scans.start(String(url), { mode: options?.mode === 'full' ? 'full' : 'quick', workspace: options?.workspace === 'cloud' ? 'cloud' : 'local' }));
  handle<[string]>('scans:cancel', (_event, id) => services.scans.cancel(uuid(id)));
  handle('scans:history', () => services.database.history());
  handle<[string]>('scans:report', (_event, id) => services.database.report(uuid(id)));
  handle<[string]>('scans:remove', async (_event, id) => services.database.deleteScan(uuid(id)));
  handle<[string]>('scans:sync', (_event, id) => services.scans.sync(uuid(id)));
  handle<[boolean]>('scans:pause', (_event, paused) => services.scans.setPaused(!!paused));

  handle('cloud:state', () => services.cloud.state());
  handle<[CloudCredentials]>('cloud:sign-in', (_event, input) => services.cloud.signIn(credentials(input)));
  handle<[SignUpCredentials]>('cloud:sign-up', (_event, input) => services.cloud.signUp({ ...credentials(input), displayName: String(input?.displayName || '').trim().slice(0, 80) }));
  handle('cloud:sign-out', () => services.cloud.signOut());
  handle('cloud:history', () => services.cloud.history());
  handle<[string]>('cloud:report', (_event, id) => services.cloud.report(uuid(id)));
  handle<[string]>('cloud:remove', (_event, id) => services.cloud.remove(uuid(id)));

  handle('settings:get', () => services.database.settings());
  handle<[Partial<DesktopSettings>]>('settings:update', async (_event, patch) => {
    const next = sanitizeSettings(await services.database.settings(), patch || {});
    await services.database.saveSettings(next);
    app.setLoginItemSettings({ openAtLogin: next.launchAtStartup, args: ['--hidden'] });
    return next;
  });

  handle('servers:detect', () => detectLocalServers());
  handle('watchers:list', () => services.watchers.list());
  handle<[string, 'quick' | 'full']>('watchers:add', async (_event, targetUrl, mode) => {
    const selection = await dialog.showOpenDialog(services.window, { title: 'Choose a project folder to watch', properties: ['openDirectory'] });
    if (selection.canceled || !selection.filePaths[0]) return null;
    return services.watchers.add(selection.filePaths[0], String(targetUrl), mode === 'full' ? 'full' : 'quick');
  });
  handle<[string, Pick<WatchProject, 'enabled' | 'targetUrl' | 'mode'>]>('watchers:update', (_event, id, patch) => services.watchers.update(uuid(id), patch));
  handle<[string]>('watchers:remove', (_event, id) => services.watchers.remove(uuid(id)));

  handle<[string, WorkspaceMode, ExportFormat]>('reports:export', async (_event, scanId, source, format) => {
    if (!['pdf', 'json', 'csv', 'markdown'].includes(format)) throw new Error('Unsupported export format.');
    const report = source === 'cloud' ? await services.cloud.report(uuid(scanId)) : await services.database.report(uuid(scanId));
    if (!report) throw new Error('Report not found.');
    return exportReport(services.window, report, format);
  });
  handle<[string, WorkspaceMode]>('reports:copy-prompt', async (_event, scanId, source) => {
    if (source !== 'local' && source !== 'cloud') throw new Error('Invalid report source.');
    const report = source === 'cloud' ? await services.cloud.report(uuid(scanId)) : await services.database.report(uuid(scanId));
    if (!report || report.scan.status !== 'completed') throw new Error('Completed report not found.');
    const findings = [...report.gateFindings, ...report.findings];
    clipboard.writeText(buildFixPrompt(report.scan, findings, 'en', findings.length));
    return actionableFindings(findings, findings.length).length;
  });
  handle<[string, string | undefined]>('reports:inspect', (_event, url, selector) => openInspector(services.window, String(url), selector ? String(selector) : undefined));
  handle<[string]>('system:open-external', async (_event, value) => {
    const url = new URL(String(value));
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Only secure web links can be opened.');
    await shell.openExternal(url.href);
  });
  handle('system:check-updates', () => services.checkForUpdates());
  handle('game:get-high-score', () => services.database.getGameHighScore());
  handle<[number]>('game:save-score', (_event, score) => services.database.saveGameScore(Number(score) || 0));

  const send = (channel: string, value: unknown) => { if (!services.window.isDestroyed()) services.window.webContents.send(channel, value); };
  services.scans.on('progress', value => send('scans:progress', value));
  services.scans.on('complete', value => send('scans:complete', value));
  services.scans.on('error', value => send('scans:error', value));
}

function assertTrusted(event: IpcMainInvokeEvent) {
  const source = event.senderFrame?.url || '';
  const dev = process.env.ELECTRON_RENDERER_URL;
  if (dev && source.startsWith(dev)) return;
  if (!dev && source.startsWith('file:') && source.endsWith('/renderer/index.html')) return;
  throw new Error('Untrusted IPC sender.');
}

function uuid(value: unknown) {
  const id = String(value || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('Invalid identifier.');
  return id;
}

function credentials(input: CloudCredentials): CloudCredentials {
  const email = String(input?.email || '').trim().toLowerCase();
  const password = String(input?.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Enter a valid email address.');
  if (password.length < 10 || password.length > 128) throw new Error('Use a password between 10 and 128 characters.');
  return { email, password };
}
