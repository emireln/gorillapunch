import { app, BrowserWindow, dialog } from 'electron';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { DesktopDatabase } from './database';
import { CloudService } from './cloud';
import { ScanManager } from './scanner';
import { WatcherService } from './watchers';
import { createMainWindow, reveal } from './window';
import { createTray, notifyComplete } from './tray';
import { registerIpc } from './ipc';
import { ShotService } from './shot';

app.setAppUserModelId('run.gorillapunch.desktop');
const lock = app.requestSingleInstanceLock();
diagnostic(`single-instance lock: ${lock}`);

let mainWindow: BrowserWindow | null = null;
let quitting = false;
let database: DesktopDatabase | null = null;
let watchers: WatcherService | null = null;
let trayController: ReturnType<typeof createTray> | null = null;

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
  const requestQuit = () => { quitting = true; app.quit(); };
  const checkForUpdates = async () => {
    if (!app.isPackaged) return 'Update checks are available in packaged builds.';
    try {
      const updater = createRequire(import.meta.url)('electron-updater') as typeof import('electron-updater');
      updater.autoUpdater.autoDownload = false;
      const result = await updater.autoUpdater.checkForUpdates();
      if (!result) return 'The update service is unavailable right now.';
      return result.isUpdateAvailable ? `Version ${result.updateInfo.version} is available.` : 'GorillaPunch is up to date.';
    } catch (error) {
      diagnostic(`update check failed: ${error instanceof Error ? error.message : String(error)}`);
      return 'The update service is unavailable right now.';
    }
  };
  watchers = new WatcherService(database, scanManager);
  await watchers.initialize();
  mainWindow = await createMainWindow(database, requestQuit, () => quitting, window => {
    mainWindow = window;
    registerIpc({ window, database: database!, cloud, shot, scans: scanManager, watchers: watchers!, requestClose: () => window.close(), checkForUpdates });
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

function diagnostic(message: string) {
  if (process.env.GP_DESKTOP_DIAGNOSTICS === '1') process.stderr.write(`[desktop] ${message}\n`);
}

function handleBootError(error: unknown) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`GorillaPunch failed to start:\n${message}\n`);
  if (!process.argv.includes('--hidden')) dialog.showErrorBox('GorillaPunch could not start', 'Your reports could not be opened. Restart GorillaPunch. If the problem continues, contact support.');
  app.exit(1);
}
