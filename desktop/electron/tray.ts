import { app, clipboard, Menu, nativeImage, Notification, Tray, type BrowserWindow } from 'electron';
import { join } from 'node:path';
import type { DesktopDatabase } from './database';
import type { DesktopReport } from '../shared/types';
import type { ScanManager } from './scanner';
import { reveal } from './window';

export function createTray(window: BrowserWindow, database: DesktopDatabase, scans: ScanManager, requestQuit: () => void, checkForUpdates: () => Promise<string>) {
  const asset = (name: string) => app.isPackaged ? join(process.resourcesPath, 'build', name) : join(import.meta.dirname, '../../build', name);
  const icon = nativeImage.createFromPath(asset('tray-icon.png')).resize({ width: 20, height: 20 });
  const activeIcon = nativeImage.createFromPath(asset('tray-active.png')).resize({ width: 20, height: 20 });
  const tray = new Tray(icon);
  tray.setToolTip('GorillaPunch');
  const rebuild = async () => {
    const settings = await database.settings();
    const portuguese = isPortuguese(settings.locale);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: portuguese ? 'Abrir GorillaPunch' : 'Open GorillaPunch', click: () => reveal(window) },
      { label: portuguese ? 'Analisar URL da área de transferência' : 'Quick Punch from Clipboard', click: () => { void quickPunch(); } },
      { type: 'separator' },
      { label: scans.isPaused() ? (portuguese ? 'Retomar fila' : 'Resume queue') : (portuguese ? 'Pausar fila' : 'Pause queue'), click: () => { void scans.setPaused(!scans.isPaused()).then(() => void rebuild()); } },
      { label: portuguese ? 'Verificar atualizações…' : 'Check for updates…', click: () => {
        void checkForUpdates().then(message => {
          if (Notification.isSupported()) new Notification({ title: portuguese ? 'Verificação de atualização do GorillaPunch' : 'GorillaPunch update check', body: localizeUpdateMessage(message, portuguese), silent: true }).show();
        });
      } },
      { type: 'separator' },
      { label: portuguese ? 'Sair' : 'Quit', click: requestQuit },
    ]));
  };
  const quickPunch = async () => {
    try {
      const settings = await database.settings();
      await scans.start(await clipboard.readText(), { mode: settings.defaultMode, workspace: settings.workspace });
      reveal(window);
    } catch { reveal(window); }
  };
  tray.on('double-click', () => reveal(window));
  const active = new Set<string>();
  scans.on('progress', ({ scan }) => {
    if (scan.status === 'queued' || scan.status === 'running') active.add(scan.id);
    else active.delete(scan.id);
    tray.setImage(active.size ? activeIcon : icon);
  });
  const idle = (value: { scan?: DesktopReport['scan']; id?: string }) => {
    const id = value.scan?.id || value.id;
    if (id) active.delete(id);
    tray.setImage(active.size ? activeIcon : icon);
  };
  scans.on('complete', idle);
  scans.on('error', idle);
  rebuild();
  return { tray, rebuild };
}

export async function notifyComplete(window: BrowserWindow, database: DesktopDatabase, report: DesktopReport) {
  const settings = await database.settings();
  if (!settings.notifications || !Notification.isSupported()) return;
  const portuguese = isPortuguese(settings.locale);
  const score = report.scan.score;
  const notification = new Notification({
    title: portuguese ? 'GorillaPunch — Análise concluída' : 'GorillaPunch — Audit complete',
    body: `${new URL(report.scan.target_url).host} — ${score?.overall ?? '—'}/100 (${localizeVerdict(score?.verdict || 'INSUFFICIENT COVERAGE', portuguese)})`,
    silent: false,
  });
  notification.on('click', () => {
    reveal(window);
    window.webContents.send('report:open', { scanId: report.scan.id, source: 'local' });
  });
  notification.show();
}

function isPortuguese(locale: string) {
  return locale === 'pt-BR' || (locale === 'auto' && app.getLocale().toLowerCase().startsWith('pt'));
}

function localizeUpdateMessage(message: string, portuguese: boolean) {
  if (!portuguese) return message;
  if (message.includes('up to date')) return 'O GorillaPunch está atualizado.';
  const version = message.match(/Version ([\d.]+) is available\./)?.[1];
  if (version) return `A versão ${version} está disponível.`;
  if (message.includes('unavailable')) return 'O serviço de atualização está indisponível no momento.';
  return message;
}

function localizeVerdict(verdict: string, portuguese: boolean) {
  if (!portuguese) return verdict;
  return ({ 'READY TO LAUNCH': 'PRONTO PARA LANÇAR', 'ALMOST READY': 'QUASE PRONTO', 'NOT READY': 'NÃO ESTÁ PRONTO', 'DO NOT LAUNCH': 'NÃO LANCE', 'INSUFFICIENT COVERAGE': 'COBERTURA INSUFICIENTE' } as Record<string, string>)[verdict] || verdict;
}
