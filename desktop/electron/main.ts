import { app, BrowserWindow, dialog } from 'electron';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import type { DesktopUpdateState } from '../shared/types';
import { DesktopDatabase } from './database';
import { CloudService } from './cloud';
import { ScanManager } from './scanner';
import { WatcherService } from './watchers';
import { createMainWindow, reveal } from './window';
import { createTray, notifyComplete } from './tray';
import { registerIpc } from './ipc';
import { ShotService } from './shot';
import { GorillaAIService } from './gorilla-ai';

app.setAppUserModelId('run.gorillapunch.desktop');
const lock = app.requestSingleInstanceLock();
diagnostic(`single-instance lock: ${lock}`);

let mainWindow: BrowserWindow | null = null;
let quitting = false;
let database: DesktopDatabase | null = null;
let watchers: WatcherService | null = null;
let trayController: ReturnType<typeof createTray> | null = null;

type ElectronAutoUpdater = typeof import('electron-updater')['autoUpdater'];
let installedUpdater: ElectronAutoUpdater | null = null;
let updateState: DesktopUpdateState = { status: 'idle' };

app.on('second-instance', () => { if (mainWindow) reveal(mainWindow); });

if (!lock) app.quit();
else void boot().catch(handleBootError);

async function boot() {
  diagnostic('waiting for Electron ready');
  await app.whenReady();
  diagnostic(`Electron ready; userData=${app.getPath('userData')}`);
  if (app.isPackaged) process.env.PLAYWRIGHT_BROWSERS_PATH = join(process.resourcesPath, 'playwright');
  database = new DesktopDatabase(app.getPath('userData'));
  diagnostic('SQLite client created');
  const cloud = new CloudService(database);
  await cloud.initialize();
  const shot = new ShotService(database, cloud);
  diagnostic('local schema and cloud session initialized');
  const scanManager = new ScanManager(database, cloud, report => { if (mainWindow) void notifyComplete(mainWindow, database!, report); });
  const ai = new GorillaAIService(database, scanManager);
  const requestQuit = () => { quitting = true; app.quit(); };
  const checkForUpdates = async () => {
    if (!app.isPackaged) return 'Update checks are available in packaged builds.';
    try {
      const result = await getDesktopUpdater().checkForUpdates();
      if (!result) return 'The update service is unavailable right now.';
      return result.isUpdateAvailable ? `Version ${result.updateInfo.version} is available.` : 'GorillaPunch is up to date.';
    } catch {
      publishUpdateState({ status: 'error' });
      diagnostic('update check failed');
      return 'The update service is unavailable right now.';
    }
  };
  const getUpdateState = () => updateState;
  const downloadUpdate = async () => {
    if (!app.isPackaged) throw new Error('Update downloads are available in packaged builds.');
    if (updateState.status !== 'available') throw new Error('No update is available to download.');
    const version = updateState.version;
    try { await getDesktopUpdater().downloadUpdate(); }
    catch {
      publishUpdateState({ status: 'error', version });
      throw new Error('The update could not be downloaded. Try again.');
    }
  };
  const installUpdate = async () => {
    if (!app.isPackaged) throw new Error('Update installation is available in packaged builds.');
    if (updateState.status !== 'downloaded') throw new Error('No downloaded update is ready to install.');
    getDesktopUpdater().quitAndInstall();
  };
  watchers = new WatcherService(database, scanManager);
  await watchers.initialize();
  mainWindow = await createMainWindow(database, requestQuit, () => quitting, window => {
    mainWindow = window;
    registerIpc({ window, database: database!, cloud, shot, ai, scans: scanManager, watchers: watchers!, requestClose: () => window.close(), checkForUpdates, getUpdateState, downloadUpdate, installUpdate });
  });
  diagnostic('main window loaded');
  trayController = createTray(mainWindow, database, scanManager, requestQuit, checkForUpdates);
  diagnostic('desktop services ready');
}

app.on('activate', () => { if (mainWindow) reveal(mainWindow); });
app.on('window-all-closed', () => { if (process.platform === 'darwin' && quitting) app.quit(); });
app.on('before-quit', () => {
  quitting = true;
  trayController?.tray.destroy();
  trayController = null;
  void watchers?.close();
  void database?.close();
});

function getDesktopUpdater() {
  if (installedUpdater) return installedUpdater;
  const { autoUpdater } = createRequire(import.meta.url)('electron-updater') as typeof import('electron-updater');
  autoUpdater.autoDownload = false;
  autoUpdater.on('update-available', info => publishUpdateState({ status: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => publishUpdateState({ status: 'current' }));
  autoUpdater.on('download-progress', progress => {
    const version = updateState.status === 'available' || updateState.status === 'downloading' ? updateState.version : null;
    if (version) publishUpdateState({ status: 'downloading', version, percent: Math.max(0, Math.min(100, Math.round(progress.percent))) });
  });
  autoUpdater.on('update-downloaded', info => publishUpdateState({ status: 'downloaded', version: info.version }));
  autoUpdater.on('error', () => publishUpdateState({ status: 'error' }));
  installedUpdater = autoUpdater;
  return installedUpdater;
}

function publishUpdateState(state: DesktopUpdateState) {
  updateState = state;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('system:update-state', state);
}

function diagnostic(message: string) {
  if (process.env.GP_DESKTOP_DIAGNOSTICS === '1') process.stderr.write(`[desktop] ${message}\n`);
}

function handleBootError(error: unknown) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`GorillaPunch failed to start:\n${message}\n`);
  if (!process.argv.includes('--hidden')) dialog.showErrorBox('GorillaPunch could not start', 'Your reports could not be opened. Restart GorillaPunch. If the problem continues, contact support.');
  app.exit(1);
}
