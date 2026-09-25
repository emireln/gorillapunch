import { app, BrowserWindow, clipboard, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import type { AIChat, AIChatMessage, AIConfigureProvider, AIProvider, CloudCredentials, DesktopSettings, DesktopUpdateState, IpcActionResult, SignUpCredentials, WatchProject, WorkspaceMode, ExportFormat, ShotGameMode, ShotRunSnapshot } from '../shared/types';
import type { DesktopDatabase } from './database';
import { sanitizeSettings } from './database';
import type { CloudService } from './cloud';
import type { ScanManager } from './scanner';
import type { WatcherService } from './watchers';
import type { ShotService } from './shot';
import type { GorillaAIService } from './gorilla-ai';
import { detectLocalServers } from './servers';
import { exportReport } from './exports';
import { openInspector } from './inspector';
import { actionableFindings, buildFixPrompt } from '../../src/core/fix-prompt';

interface Services {
  window: BrowserWindow;
  database: DesktopDatabase;
  cloud: CloudService;
  shot: ShotService;
  ai: GorillaAIService;
  scans: ScanManager;
  watchers: WatcherService;
  requestClose(): void;
  checkForUpdates(): Promise<string>;
  getUpdateState(): DesktopUpdateState;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
}

export function registerIpc(services: Services) {
  const handle = <T extends unknown[]>(channel: string, action: (event: IpcMainInvokeEvent, ...args: T) => unknown) => {
    ipcMain.handle(channel, async (event, ...args: T) => {
      assertTrusted(event);
      try { return await action(event, ...args); }
      catch (error) { throw new Error(error instanceof Error ? error.message : 'The desktop action failed.'); }
    });
  };
  const handleAuth = <T extends unknown[], R>(channel: string, action: (event: IpcMainInvokeEvent, ...args: T) => Promise<R>) => {
    ipcMain.handle(channel, async (event, ...args: T): Promise<IpcActionResult<R>> => {
      assertTrusted(event);
      try { return { ok: true, value: await action(event, ...args) }; }
      catch (error) { return { ok: false, error: authActionMessage(error) }; }
    });
  };
  handle('window:minimize', () => services.window.minimize());
  handle('window:maximize', () => services.window.isMaximized() ? services.window.unmaximize() : services.window.maximize());
  handle('window:close', () => services.requestClose());
  handle('window:is-maximized', () => services.window.isMaximized());
  handle('window:is-fullscreen', () => services.window.isFullScreen());
  handle<[boolean]>('window:set-fullscreen', (_event, enabled) => {
    services.window.setFullScreen(enabled === true);
    return services.window.isFullScreen();
  });

  handle<[string, { mode: 'quick' | 'full'; workspace: WorkspaceMode }]>('scans:start', (_event, url, options) => services.scans.start(String(url), { mode: options?.mode === 'full' ? 'full' : 'quick', workspace: options?.workspace === 'cloud' ? 'cloud' : 'local' }));
  handle<[string]>('scans:cancel', (_event, id) => services.scans.cancel(uuid(id)));
  handle('scans:history', () => services.database.history());
  handle('scans:pending', () => services.database.pendingCloudReports());
  handle<[string]>('scans:report', (_event, id) => services.database.report(uuid(id)));
  handle<[string]>('scans:remove', async (_event, id) => services.database.deleteScan(uuid(id)));
  handle<[string]>('scans:sync', (_event, id) => services.scans.sync(uuid(id)));
  handle<[boolean]>('scans:pause', (_event, paused) => services.scans.setPaused(!!paused));

  handle('cloud:state', () => services.cloud.state());
  handle('cloud:restore-session', () => services.cloud.restoreSession());
  handleAuth<[CloudCredentials], Awaited<ReturnType<CloudService['signIn']>>>('cloud:sign-in', (_event, input) => services.cloud.signIn(credentials(input)));
  handleAuth<[SignUpCredentials], Awaited<ReturnType<CloudService['signUp']>>>('cloud:sign-up', (_event, input) => services.cloud.signUp({ ...credentials(input, true), displayName: String(input?.displayName || '').trim().slice(0, 80) }));
  handle('cloud:sign-out', () => services.cloud.signOut());
  handle('cloud:history', () => services.cloud.history());
  handle<[string]>('cloud:report', (_event, id) => services.cloud.report(uuid(id)));
  handle<[string]>('cloud:remove', (_event, id) => services.cloud.remove(uuid(id)));
  handle<[string | null]>('cloud:save-avatar', (_event, value) => services.cloud.saveAvatar(value));

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
    const locale = (await services.database.settings()).locale;
    const selection = await dialog.showOpenDialog(services.window, { title: locale === 'pt-BR' || (locale === 'auto' && app.getLocale().toLowerCase().startsWith('pt')) ? 'Escolha uma pasta de projeto para monitorar' : 'Choose a project folder to watch', properties: ['openDirectory'] });
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
  handle('ai:providers', () => services.ai.providerStates());
  handle<[AIProvider, string | undefined, string | undefined]>('ai:models', (_event, provider, key, endpoint) => services.ai.models(provider, key, endpoint));
  handle<[AIConfigureProvider]>('ai:configure', (_event, input) => services.ai.configure(input));
  handle<[AIProvider]>('ai:disconnect', (_event, provider) => services.ai.disconnect(provider));
  handle('ai:chats', () => services.ai.chats());
  handle<[AIChat]>('ai:save-chat', (_event, chat) => services.ai.saveChat(chat));
  handle<[string]>('ai:delete-chat', (_event, id) => services.ai.deleteChat(id));
  handle('ai:export-chats', () => services.ai.exportChats(services.window));
  handle('ai:import-chats', () => services.ai.importChats(services.window));
  handle<[string, string, AIChatMessage]>('ai:send', (_event, requestId, chatId, message) => services.ai.send(requestId, chatId, message, activity => {
    if (!services.window.isDestroyed()) services.window.webContents.send('ai:activity', activity);
  }));
  handle<[string, string | undefined]>('reports:inspect', (_event, url, selector) => openInspector(services.window, String(url), selector ? String(selector) : undefined));
  handle<[string]>('system:open-external', async (_event, value) => {
    const url = new URL(String(value));
    const secureWebLink = url.protocol === 'https:' && !url.username && !url.password;
    const supportEmail = url.protocol === 'mailto:' && url.pathname.toLowerCase() === 'gorillapunch.run@gmail.com' && !url.search && !url.hash;
    if (!secureWebLink && !supportEmail) throw new Error('Only secure web links and the support email can be opened.');
    await shell.openExternal(url.href);
  });
  handle('system:check-updates', () => services.checkForUpdates());
  handle('system:get-update-state', () => services.getUpdateState());
  handle('system:download-update', () => services.downloadUpdate());
  handle('system:install-update', () => services.installUpdate());
  handle('game:progress', () => services.shot.progress());
  handle<[number, ShotGameMode]>('game:start', (_event, level, mode) => services.shot.start(level, mode));
  handle<[string, ShotRunSnapshot]>('game:checkpoint', (_event, id, snapshot) => services.shot.checkpoint(uuid(id), snapshot));
  handle<[string, 'failed' | 'cleared' | 'abandoned', ShotRunSnapshot]>('game:finish', (_event, id, outcome, snapshot) => services.shot.finish(uuid(id), outcome, snapshot));
  handle('game:sync', () => services.shot.sync());

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

function credentials(input: CloudCredentials, requireStrongPassword = false): CloudCredentials {
  const email = String(input?.email || '').trim().toLowerCase();
  const password = String(input?.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Enter a valid email address.');
  if (!password.length) throw new Error('Enter your password.');
  if (password.length > 128) throw new Error('Use a password with 128 characters or fewer.');
  if (requireStrongPassword && password.length < 10) throw new Error('Use a password between 10 and 128 characters.');
  return { email, password };
}

function authActionMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const safeMessages = new Set([
    'Enter a valid email address.',
    'Enter your password.',
    'Use a password with 128 characters or fewer.',
    'Use a password between 10 and 128 characters.',
    'Cloud sync is unavailable right now. Try again later or contact support.',
    'Too many attempts. Wait a moment and try again.',
    'We could not reach your account right now. Check your connection and try again.',
    'Email or password is incorrect. Please try again.',
    'We could not sign in. Please try again.',
    'An account with this email already exists. Sign in instead.',
    'Choose a stronger password and try again.',
    'We could not create your account. Please try again.',
  ]);
  return safeMessages.has(message) ? message : 'We could not connect your account. Please try again.';
}
