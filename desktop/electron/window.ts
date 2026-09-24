import { BrowserWindow, screen, shell } from 'electron';
import { join } from 'node:path';
import type { DesktopDatabase } from './database';

interface WindowState { x?: number; y?: number; width: number; height: number; maximized: boolean }

export async function createMainWindow(database: DesktopDatabase, requestQuit: () => void, shouldQuit: () => boolean, onCreated: (window: BrowserWindow) => void) {
  const saved = await recoverWindowState(await windowState(database));
  let forceClose = false;
  const window = new BrowserWindow({
    ...saved,
    minWidth: saved.minWidth,
    minHeight: saved.minHeight,
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
  const keepWindowVisible = () => {
    if (window.isDestroyed() || window.isFullScreen()) return;
    const wasMaximized = window.isMaximized();
    const normal = window.getNormalBounds();
    const bounds = recoverWindowState({ ...normal, maximized: false });
    const changed = normal.x !== bounds.x || normal.y !== bounds.y || normal.width !== bounds.width || normal.height !== bounds.height;
    window.setMinimumSize(bounds.minWidth, bounds.minHeight);
    if (!changed) return;
    if (wasMaximized) window.unmaximize();
    window.setBounds({ x: bounds.x!, y: bounds.y!, width: bounds.width, height: bounds.height });
    if (wasMaximized) window.maximize();
  };
  screen.on('display-added', keepWindowVisible);
  screen.on('display-removed', keepWindowVisible);
  screen.on('display-metrics-changed', keepWindowVisible);
  window.on('restore', () => setTimeout(keepWindowVisible, 0));
  window.on('leave-full-screen', () => setTimeout(keepWindowVisible, 0));
  window.once('closed', () => {
    screen.removeListener('display-added', keepWindowVisible);
    screen.removeListener('display-removed', keepWindowVisible);
    screen.removeListener('display-metrics-changed', keepWindowVisible);
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
  window.on('enter-full-screen', () => window.webContents.send('window:fullscreen', true));
  window.on('leave-full-screen', () => window.webContents.send('window:fullscreen', false));
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

interface RecoveredWindowState extends WindowState { minWidth: number; minHeight: number }

async function windowState(database: DesktopDatabase): Promise<WindowState> {
  const fallback = { width: 1280, height: 820, maximized: false };
  const value = await database.getValue('window_state');
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as Partial<WindowState>;
    return { width: Math.max(1024, Number(parsed.width) || fallback.width), height: Math.max(720, Number(parsed.height) || fallback.height), ...(Number.isFinite(parsed.x) ? { x: parsed.x } : {}), ...(Number.isFinite(parsed.y) ? { y: parsed.y } : {}), maximized: !!parsed.maximized };
  } catch { return fallback; }
}

function recoverWindowState(saved: WindowState): RecoveredWindowState {
  const primary = screen.getPrimaryDisplay();
  const hasPosition = Number.isFinite(saved.x) && Number.isFinite(saved.y);
  const matching = hasPosition
    ? screen.getDisplayMatching({ x: saved.x!, y: saved.y!, width: saved.width, height: saved.height })
    : primary;
  const display = matching;
  const area = display.workArea;
  const width = Math.min(saved.width, area.width);
  const height = Math.min(saved.height, area.height);
  const minWidth = Math.min(1024, area.width);
  const minHeight = Math.min(720, area.height);
  const x = hasPosition ? Math.max(area.x, Math.min(saved.x!, area.x + area.width - width)) : undefined;
  const y = hasPosition ? Math.max(area.y, Math.min(saved.y!, area.y + area.height - height)) : undefined;
  return { width, height, ...(x === undefined ? {} : { x }), ...(y === undefined ? {} : { y }), maximized: saved.maximized, minWidth, minHeight };
}

export function reveal(window: BrowserWindow) {
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
