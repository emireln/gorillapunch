import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, WarningCircle, X } from '@phosphor-icons/react';
import type { CloudState, DesktopReport, DesktopScan, DesktopSettings, LocalServer, WatchProject, WorkspaceMode } from '../shared/types';
import { TitleBar } from './components/TitleBar';
import { Sidebar, type View } from './components/Sidebar';
import { Dashboard } from './views/Dashboard';
import { History } from './views/History';
import { Watchers } from './views/Watchers';
import { Settings } from './views/Settings';
import { ReportView } from './views/Report';
import { Arcade } from './views/Arcade';
import { errorMessage, type ScanItem } from './utils';
import { useDesktopI18n } from './i18n';
import { Tooltip } from './components/Tooltip';

interface Toast { id: number; message: string; tone: 'success' | 'error' }

export function App() {
  const { t, setLocalePreference } = useDesktopI18n();
  const [view, setView] = useState<View>('dashboard');
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [cloud, setCloud] = useState<CloudState | null>(null);
  const [localHistory, setLocalHistory] = useState<DesktopScan[]>([]);
  const [cloudHistory, setCloudHistory] = useState<DesktopScan[]>([]);
  const [servers, setServers] = useState<LocalServer[]>([]);
  const [watchers, setWatchers] = useState<WatchProject[]>([]);
  const [report, setReport] = useState<DesktopReport | null>(null);
  const [reportSource, setReportSource] = useState<WorkspaceMode>('local');
  const [loadingReport, setLoadingReport] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('gp-sidebar-collapsed') === 'true');

  const notify = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(current => [...current, { id, message: errorMessage(message), tone }]);
    window.setTimeout(() => setToasts(current => current.filter(toast => toast.id !== id)), 4500);
  }, []);

  const refreshCloud = useCallback(async (state?: CloudState) => {
    const active = state || await window.gorillaPunch.cloud.state();
    setCloud(active);
    if (active.authenticated && navigator.onLine) {
      try { setCloudHistory(await window.gorillaPunch.cloud.history()); }
      catch { setCloudHistory([]); }
    } else setCloudHistory([]);
  }, []);

  useEffect(() => {
    void Promise.all([window.gorillaPunch.settings.get(), window.gorillaPunch.cloud.state(), window.gorillaPunch.scans.history(), window.gorillaPunch.watchers.list()]).then(([preferences, cloudState, scans, watchList]) => {
      setSettings(preferences); setCloud(cloudState); setLocalHistory(scans); setWatchers(watchList);
      if (cloudState.authenticated) void refreshCloud(cloudState);
      if (preferences.portScan) void window.gorillaPunch.servers.detect().then(setServers);
    }).catch(error => notify(errorMessage(error), 'error'));
    const progress = window.gorillaPunch.scans.onProgress(({ scan }) => setLocalHistory(current => upsert(current, scan)));
    const complete = window.gorillaPunch.scans.onComplete(completed => {
      setLocalHistory(current => upsert(current, completed.scan));
      setReport(completed); setReportSource('local'); setView('report');
      if (completed.scan.synced_at) void refreshCloud();
      if (completed.scan.sync_error) notify(completed.scan.sync_error, 'error');
    });
    const failed = window.gorillaPunch.scans.onError(scan => { setLocalHistory(current => upsert(current, scan)); if (scan.status !== 'cancelled') notify(scan.sync_error || t('app.punchFailed'), 'error'); });
    const connection = () => { setOnline(navigator.onLine); if (navigator.onLine) void refreshCloud(); };
    window.addEventListener('online', connection); window.addEventListener('offline', connection);
    return () => { progress(); complete(); failed(); window.removeEventListener('online', connection); window.removeEventListener('offline', connection); };
  }, [notify, refreshCloud, t]);

  useEffect(() => {
    if (!settings) return;
    setLocalePreference(settings.locale);
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.theme = settings.theme === 'system' ? media.matches ? 'dark' : 'light' : settings.theme; };
    apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply);
  }, [settings, setLocalePreference]);

  useEffect(() => { localStorage.setItem('gp-sidebar-collapsed', String(sidebarCollapsed)); }, [sidebarCollapsed]);

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLowerCase() === 'k') { event.preventDefault(); setView('dashboard'); window.setTimeout(() => document.querySelector<HTMLInputElement>('#main-punch-url')?.focus(), 0); }
      if (event.ctrlKey && event.key === ',') { event.preventDefault(); setView('settings'); }
    };
    window.addEventListener('keydown', keys); return () => window.removeEventListener('keydown', keys);
  }, []);

  const items = useMemo<ScanItem[]>(() => {
    if (!settings) return [];
    if (settings.workspace === 'local') return localHistory.filter(scan => scan.storage === 'local').map(scan => ({ scan, source: 'local' }));
    const remoteIds = new Set(cloudHistory.map(scan => scan.id));
    const localCloud = localHistory.filter(scan => scan.storage === 'cloud' && (!scan.cloud_id || !remoteIds.has(scan.cloud_id))).map(scan => ({ scan, source: 'local' as const }));
    return [...localCloud, ...cloudHistory.map(scan => ({ scan, source: 'cloud' as const }))].sort((a, b) => b.scan.created_at.localeCompare(a.scan.created_at));
  }, [settings, localHistory, cloudHistory]);

  const startPunch = async (url: string, mode = settings?.defaultMode || 'quick') => {
    if (!settings) return;
    try {
      const scan = await window.gorillaPunch.scans.start(url, { mode, workspace: settings.workspace });
      setLocalHistory(current => upsert(current, scan)); setView('dashboard');
    } catch (error) { notify(errorMessage(error), 'error'); if (settings.workspace === 'cloud' && !cloud?.authenticated) setView('settings'); }
  };
  const openReport = async (item: ScanItem) => {
    setLoadingReport(true); setView('report'); setReportSource(item.source);
    try {
      const result = item.source === 'cloud' ? await window.gorillaPunch.cloud.report(item.scan.id) : await window.gorillaPunch.scans.report(item.scan.id);
      if (!result) throw new Error(t('app.reportNotFound')); setReport(result);
    } catch (error) { notify(errorMessage(error), 'error'); setView('history'); }
    finally { setLoadingReport(false); }
  };
  const updateSettings = async (patch: Partial<DesktopSettings>) => {
    try {
      const next = await window.gorillaPunch.settings.update(patch); setSettings(next);
      if (next.portScan) void window.gorillaPunch.servers.detect().then(setServers); else setServers([]);
      if (next.workspace === 'cloud') void refreshCloud();
    } catch (error) { notify(errorMessage(error), 'error'); }
  };
  const addWatcher = async (url: string, mode: 'quick' | 'full') => {
    try { const watcher = await window.gorillaPunch.watchers.add(url, mode); if (watcher) { setWatchers(current => [...current, watcher]); notify(t('app.watchAdded')); } }
    catch (error) { notify(errorMessage(error), 'error'); }
  };
  const updateWatcher = async (watcher: WatchProject) => {
    try { const saved = await window.gorillaPunch.watchers.update(watcher.id, watcher); setWatchers(current => current.map(item => item.id === saved.id ? saved : item)); }
    catch (error) { notify(errorMessage(error), 'error'); }
  };
  const removeWatcher = async (id: string) => {
    try { await window.gorillaPunch.watchers.remove(id); setWatchers(current => current.filter(item => item.id !== id)); }
    catch (error) { notify(errorMessage(error), 'error'); }
  };
  const deleteReport = async () => {
    if (!report) return;
    try {
      if (reportSource === 'cloud') { await window.gorillaPunch.cloud.remove(report.scan.id); setCloudHistory(current => current.filter(scan => scan.id !== report.scan.id)); }
      else { await window.gorillaPunch.scans.remove(report.scan.id); setLocalHistory(current => current.filter(scan => scan.id !== report.scan.id)); }
      setReport(null); setView('history'); notify(t('app.reportDeleted'));
    } catch (error) { notify(errorMessage(error), 'error'); }
  };
  const syncReport = async () => {
    if (!report) return;
    try { const scan = await window.gorillaPunch.scans.sync(report.scan.id); setLocalHistory(current => upsert(current, scan)); setReport(current => current ? { ...current, scan } : current); await refreshCloud(); notify(t('app.reportSynced')); }
    catch (error) { notify(errorMessage(error), 'error'); }
  };
  const syncPending = async () => {
    const pending = localHistory.filter(scan => scan.storage === 'cloud' && scan.status === 'completed' && !scan.synced_at);
    let synced = 0;
    for (const item of pending) {
      try {
        const scan = await window.gorillaPunch.scans.sync(item.id);
        setLocalHistory(current => upsert(current, scan));
        setReport(current => current?.scan.id === scan.id ? { ...current, scan } : current);
        synced++;
      } catch (error) { notify(errorMessage(error), 'error'); break; }
    }
    if (synced) { await refreshCloud(); notify(t(synced === 1 ? 'app.pendingSyncedSingular' : 'app.pendingSynced', { count: synced })); }
  };

  if (!settings || !cloud) return <div className="boot-screen"><div className="boot-mark">GP</div><span>{t('app.loading')}</span></div>;
  return <div className={`desktop-app ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
    <TitleBar workspace={settings.workspace} cloud={cloud} online={online} onPunch={url => void startPunch(url)} onProfile={() => setView('settings')}/>
    <div className="desktop-body"><Sidebar view={view} setView={next => { if (next !== 'report') setView(next); }} workspace={settings.workspace} cloud={cloud} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(value => !value)}/><main>
      {view === 'dashboard' && <Dashboard items={items} localHistory={localHistory} workspace={settings.workspace} autoSync={settings.autoSync} cloudConnected={cloud.authenticated} defaultMode={settings.defaultMode} servers={servers} onPunch={startPunch} onOpen={item => void openReport(item)} onHistory={() => setView('history')}/>}
      {view === 'history' && <History items={items} onOpen={item => void openReport(item)}/>}
      {view === 'watchers' && <Watchers watchers={watchers} onAdd={addWatcher} onUpdate={updateWatcher} onRemove={removeWatcher}/>}
      {view === 'arcade' && <Arcade workspace={settings.workspace} cloudConnected={cloud.authenticated} online={online}/>}
      {view === 'settings' && <Settings settings={settings} cloud={cloud} pendingCount={localHistory.filter(scan => scan.storage === 'cloud' && scan.status === 'completed' && !scan.synced_at).length} onSyncPending={syncPending} onSettings={updateSettings} onAvatar={setCloud} onCloud={state => { setCloud(state); if (state.authenticated) { void updateSettings({ workspace: 'cloud', autoSync: true }); void refreshCloud(state); } else { setCloudHistory([]); void updateSettings({ workspace: 'local' }); } }} notify={notify}/>}
      {view === 'report' && (loadingReport ? <div className="view loading-view">{t('app.loadingReport')}</div> : report ? <ReportView key={report.scan.id} report={report} source={reportSource} canSync={cloud.authenticated && online} onBack={() => setView('history')} onDelete={deleteReport} onSync={syncReport} notify={notify}/> : <div className="view empty-panel">{t('app.reportUnavailable')}</div>)}
    </main></div>
    <div className="toast-stack">{toasts.map(toast => <div key={toast.id} className={`toast ${toast.tone}`}>{toast.tone === 'success' ? <CheckCircle size={20}/> : <WarningCircle size={20}/>}<span>{toast.message}</span><Tooltip content={t('app.dismiss')}><button aria-label={t('app.dismiss')} onClick={() => setToasts(current => current.filter(item => item.id !== toast.id))}><X size={16}/></button></Tooltip></div>)}</div>
  </div>;
}

function upsert(items: DesktopScan[], scan: DesktopScan) { return [scan, ...items.filter(item => item.id !== scan.id)].sort((a, b) => b.created_at.localeCompare(a.created_at)); }
