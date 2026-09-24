import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI, DesktopUpdateState, IpcActionResult } from '../shared/types';

const invokeAuth = async <T>(channel: string, value: unknown): Promise<T> => {
  const result = await ipcRenderer.invoke(channel, value) as IpcActionResult<T>;
  if (!result || result.ok !== true) {
    throw new Error(result && 'error' in result ? result.error : 'We could not connect your account. Please try again.');
  }
  return result.value;
};

const listen = <T>(channel: string, callback: (value: T) => void) => {
  const handler = (_event: Electron.IpcRendererEvent, value: T) => callback(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

const api: DesktopAPI = {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximized: callback => listen('window:maximized', callback),
  },
  scans: {
    start: (url, options) => ipcRenderer.invoke('scans:start', url, options),
    cancel: scanId => ipcRenderer.invoke('scans:cancel', scanId),
    history: () => ipcRenderer.invoke('scans:history'),
    report: scanId => ipcRenderer.invoke('scans:report', scanId),
    remove: scanId => ipcRenderer.invoke('scans:remove', scanId),
    sync: scanId => ipcRenderer.invoke('scans:sync', scanId),
    pause: paused => ipcRenderer.invoke('scans:pause', paused),
    onProgress: callback => listen('scans:progress', callback),
    onComplete: callback => listen('scans:complete', callback),
    onError: callback => listen('scans:error', callback),
  },
  cloud: {
    state: () => ipcRenderer.invoke('cloud:state'),
    signIn: credentials => invokeAuth('cloud:sign-in', credentials),
    signUp: credentials => invokeAuth('cloud:sign-up', credentials),
    signOut: () => ipcRenderer.invoke('cloud:sign-out'),
    history: () => ipcRenderer.invoke('cloud:history'),
    report: scanId => ipcRenderer.invoke('cloud:report', scanId),
    remove: scanId => ipcRenderer.invoke('cloud:remove', scanId),
    saveAvatar: webpBase64 => ipcRenderer.invoke('cloud:save-avatar', webpBase64),
  },
  settings: { get: () => ipcRenderer.invoke('settings:get'), update: patch => ipcRenderer.invoke('settings:update', patch) },
  servers: { detect: () => ipcRenderer.invoke('servers:detect') },
  watchers: {
    list: () => ipcRenderer.invoke('watchers:list'),
    add: (targetUrl, mode) => ipcRenderer.invoke('watchers:add', targetUrl, mode),
    update: (id, patch) => ipcRenderer.invoke('watchers:update', id, patch),
    remove: id => ipcRenderer.invoke('watchers:remove', id),
  },
  reports: {
    export: (scanId, source, format) => ipcRenderer.invoke('reports:export', scanId, source, format),
    copyPrompt: (scanId, source) => ipcRenderer.invoke('reports:copy-prompt', scanId, source),
    inspect: (url, selector) => ipcRenderer.invoke('reports:inspect', url, selector),
  },
  system: {
    openExternal: url => ipcRenderer.invoke('system:open-external', url),
    checkForUpdates: () => ipcRenderer.invoke('system:check-updates'),
    getUpdateState: () => ipcRenderer.invoke('system:get-update-state'),
    downloadUpdate: () => ipcRenderer.invoke('system:download-update'),
    installUpdate: () => ipcRenderer.invoke('system:install-update'),
    onUpdateState: callback => listen<DesktopUpdateState>('system:update-state', callback),
  },
  game: {
    progress: () => ipcRenderer.invoke('game:progress'),
    start: level => ipcRenderer.invoke('game:start', level),
    checkpoint: (runId, snapshot) => ipcRenderer.invoke('game:checkpoint', runId, snapshot),
    finish: (runId, outcome, snapshot) => ipcRenderer.invoke('game:finish', runId, outcome, snapshot),
    sync: () => ipcRenderer.invoke('game:sync'),
  },
};

contextBridge.exposeInMainWorld('gorillaPunch', api);
