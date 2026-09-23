import { useState, type FormEvent } from 'react';
import { ArrowRight, Globe, Lightning, Scan } from '@phosphor-icons/react';
import type { LocalServer, ScanMode, WorkspaceMode } from '../../shared/types';

export function PunchForm({ workspace, autoSync, cloudConnected, defaultMode, servers, onPunch }: { workspace: WorkspaceMode; autoSync: boolean; cloudConnected: boolean; defaultMode: Exclude<ScanMode, 'deep'>; servers: LocalServer[]; onPunch(url: string, mode: 'quick' | 'full'): Promise<void> }) {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'quick' | 'full'>(defaultMode);
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!url.trim() || submitting) return;
    setSubmitting(true);
    try { await onPunch(url, mode); } finally { setSubmitting(false); }
  };
  return <section className="punch-card">
    <div className="punch-card-copy"><span className="eyebrow">LAUNCH READINESS CHECK</span><h1>Is your app ready to launch?</h1><p>Check a development, staging, or public website before release.</p></div>
    <form onSubmit={submit} className="desktop-punch-form">
      <label className="url-field"><Globe size={21}/><input id="main-punch-url" aria-label="Website URL" autoFocus value={url} onChange={event => setUrl(event.target.value)} placeholder="Enter a website address" spellCheck={false}/></label>
      <div className="punch-options"><div className="segmented"><button type="button" className={mode === 'quick' ? 'active' : ''} onClick={() => setMode('quick')}><Lightning size={16}/> Quick</button><button type="button" className={mode === 'full' ? 'active' : ''} onClick={() => setMode('full')}><Scan size={16}/> Full</button></div><button className="primary-btn" disabled={submitting || !url.trim()}>{submitting ? 'Starting…' : 'Start punch'}<ArrowRight size={17}/></button></div>
    </form>
    <div className="punch-meta"><span className="privacy-badge">{workspace === 'local' ? 'Reports saved on this PC' : !cloudConnected ? 'Sign in to sync reports' : autoSync ? 'New reports sync to your account' : 'Account sync is paused'}</span><span>Unlimited audits</span></div>
    {servers.length > 0 && <div className="server-chips"><span>Detected:</span>{servers.map(server => <button key={server.port} onClick={() => setUrl(server.url)}><i/><strong>{server.service}</strong><code>:{server.port}</code></button>)}</div>}
  </section>;
}
