import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI } from '../shared/types';

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
    signIn: credentials => ipcRenderer.invoke('cloud:sign-in', credentials),
    signUp: credentials => ipcRenderer.invoke('cloud:sign-up', credentials),
    signOut: () => ipcRenderer.invoke('cloud:sign-out'),
    history: () => ipcRenderer.invoke('cloud:history'),
    report: scanId => ipcRenderer.invoke('cloud:report', scanId),
    remove: scanId => ipcRenderer.invoke('cloud:remove', scanId),
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
    inspect: (url, selector) => ipcRenderer.invoke('reports:inspect', url, selector),
  },
  system: {
    openExternal: url => ipcRenderer.invoke('system:open-external', url),
    checkForUpdates: () => ipcRenderer.invoke('system:check-updates'),
  },
  game: {
    getHighScore: () => ipcRenderer.invoke('game:get-high-score'),
    saveScore: score => ipcRenderer.invoke('game:save-score', score),
  },
};

contextBridge.exposeInMainWorld('gorillaPunch', api);
