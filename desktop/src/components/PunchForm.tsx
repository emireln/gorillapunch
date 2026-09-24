import { useState, type FormEvent } from 'react';
import { ArrowRight, Globe, Lightning, Scan } from '@phosphor-icons/react';
import type { LocalServer, ScanMode, WorkspaceMode } from '../../shared/types';
import { useDesktopI18n } from '../i18n';

export function PunchForm({ workspace, autoSync, cloudConnected, defaultMode, servers, onPunch }: { workspace: WorkspaceMode; autoSync: boolean; cloudConnected: boolean; defaultMode: Exclude<ScanMode, 'deep'>; servers: LocalServer[]; onPunch(url: string, mode: 'quick' | 'full'): Promise<void> }) {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'quick' | 'full'>(defaultMode);
  const [submitting, setSubmitting] = useState(false);
  const { t } = useDesktopI18n();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!url.trim() || submitting) return;
    setSubmitting(true);
    try { await onPunch(url, mode); } finally { setSubmitting(false); }
  };
  return <section className="punch-card">
    <div className="punch-card-copy"><span className="eyebrow">{t('dashboard.checkEyebrow')}</span><h1>{t('dashboard.title')}</h1><p>{t('dashboard.subtitle')}</p></div>
    <form onSubmit={submit} className="desktop-punch-form">
      <label className="url-field"><Globe size={21}/><input id="main-punch-url" aria-label={t('dashboard.urlLabel')} autoFocus value={url} onChange={event => setUrl(event.target.value)} placeholder={t('dashboard.urlPlaceholder')} spellCheck={false}/></label>
      <div className="punch-options"><div className="segmented"><button type="button" className={mode === 'quick' ? 'active' : ''} onClick={() => setMode('quick')}><Lightning size={16}/> {t('dashboard.quick')}</button><button type="button" className={mode === 'full' ? 'active' : ''} onClick={() => setMode('full')}><Scan size={16}/> {t('dashboard.full')}</button></div><button className="primary-btn" disabled={submitting || !url.trim()}>{submitting ? t('dashboard.starting') : t('dashboard.startPunch')}<ArrowRight size={17}/></button></div>
    </form>
    <div className="punch-meta"><span className="privacy-badge">{workspace === 'local' ? t('dashboard.reportsLocal') : !cloudConnected ? t('dashboard.signInSync') : autoSync ? t('settings.cloud') : t('dashboard.syncPaused')}</span></div>
    {servers.length > 0 && <div className="server-chips"><span>{t('dashboard.detected')}</span>{servers.map(server => <button key={server.port} onClick={() => setUrl(server.url)}><i/><strong>{server.service}</strong><code>:{server.port}</code></button>)}</div>}
  </section>;
}
