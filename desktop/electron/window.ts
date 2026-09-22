import { BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import type { DesktopDatabase } from './database';

interface WindowState { x?: number; y?: number; width: number; height: number; maximized: boolean }

export async function createMainWindow(database: DesktopDatabase, requestQuit: () => void, shouldQuit: () => boolean, onCreated: (window: BrowserWindow) => void) {
  const saved = await windowState(database);
  let forceClose = false;
  const window = new BrowserWindow({
    ...saved,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#24202b',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  });
  onCreated(window);
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const external = new URL(url);
      if (external.protocol === 'https:' && !external.username && !external.password) void shell.openExternal(external.href);
    } catch { /* Invalid and non-web destinations remain closed. */ }
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('maximize', () => window.webContents.send('window:maximized', true));
  window.on('unmaximize', () => window.webContents.send('window:maximized', false));
  window.on('close', event => {
    if (shouldQuit() || forceClose) return;
    event.preventDefault();
    void database.settings().then(settings => {
      if (settings.closeToTray) window.hide();
      else { forceClose = true; requestQuit(); }
    });
  });
  let saveTimer: NodeJS.Timeout | undefined;
  const saveBounds = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (window.isDestroyed()) return;
      const bounds = window.getNormalBounds();
      const state: WindowState = { ...bounds, maximized: window.isMaximized() };
      void database.setValue('window_state', JSON.stringify(state));
    }, 250);
  };
  window.on('resize', saveBounds);
  window.on('move', saveBounds);
  window.once('ready-to-show', () => {
    if (saved.maximized) window.maximize();
    if (!process.argv.includes('--hidden')) window.show();
  });
  if (process.env.ELECTRON_RENDERER_URL) await window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else await window.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  const bridgeReady = await window.webContents.executeJavaScript("Boolean(window.gorillaPunch?.scans?.history && window.gorillaPunch?.settings?.get)");
  if (!bridgeReady) throw new Error('PRELOAD_BRIDGE_UNAVAILABLE');
  return window;
}

async function windowState(database: DesktopDatabase): Promise<WindowState> {
  const fallback = { width: 1280, height: 820, maximized: false };
  const value = await database.getValue('window_state');
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as Partial<WindowState>;
    return { width: Math.max(1024, Number(parsed.width) || fallback.width), height: Math.max(720, Number(parsed.height) || fallback.height), ...(Number.isFinite(parsed.x) ? { x: parsed.x } : {}), ...(Number.isFinite(parsed.y) ? { y: parsed.y } : {}), maximized: !!parsed.maximized };
  } catch { return fallback; }
}

export function reveal(window: BrowserWindow) {
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
