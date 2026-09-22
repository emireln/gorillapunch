import { BrowserWindow, session } from 'electron';

export async function openInspector(parent: BrowserWindow, input: string, selector?: string) {
  const { normalizeDesktopUrl } = await import('../../src/core/url');
  const url = normalizeDesktopUrl(input);
  const origin = new URL(url).origin;
  const partition = `gp-inspector-${Date.now()}`;
  const isolatedSession = session.fromPartition(partition, { cache: false });
  isolatedSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  isolatedSession.setPermissionCheckHandler(() => false);
  const window = new BrowserWindow({
    parent,
    width: 1240,
    height: 850,
    title: `Inspect — ${new URL(url).hostname}`,
    autoHideMenuBar: true,
    backgroundColor: '#1b1821',
    webPreferences: {
      partition,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, next) => {
    try { if (new URL(next).origin !== origin) event.preventDefault(); }
    catch { event.preventDefault(); }
  });
  if (selector && selector.length <= 1000) {
    window.webContents.once('did-finish-load', () => {
      const encoded = JSON.stringify(selector);
      void window.webContents.executeJavaScript(`(() => { try { const selector = ${encoded}; const element = document.querySelector(selector); if (!element) return false; element.scrollIntoView({ block: 'center', behavior: 'smooth' }); const previous = element.getAttribute('style') || ''; element.dataset.gorillapunchStyle = previous; element.style.setProperty('outline','4px solid #7553ff','important'); element.style.setProperty('outline-offset','4px','important'); element.style.setProperty('box-shadow','0 0 0 8px rgba(117,83,255,.24)','important'); return true; } catch { return false; } })()`, true).catch(() => {});
    });
  }
  await window.loadURL(url);
}
