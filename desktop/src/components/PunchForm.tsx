import { useState, type FormEvent } from 'react';
import { ArrowRight, Globe, Lightning, Scan } from '@phosphor-icons/react';
import type { LocalServer, ScanMode, WorkspaceMode } from '../../shared/types';

export function PunchForm({ workspace, defaultMode, servers, onPunch }: { workspace: WorkspaceMode; defaultMode: Exclude<ScanMode, 'deep'>; servers: LocalServer[]; onPunch(url: string, mode: 'quick' | 'full'): Promise<void> }) {
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
    <div className="punch-card-copy"><span className="eyebrow">LAUNCH READINESS CHECK</span><h1>Is your app actually ready?</h1><p>Check a local development site, staging site, or public URL with a browser on this device.</p></div>
    <form onSubmit={submit} className="desktop-punch-form">
      <label className="url-field"><Globe size={21}/><input id="main-punch-url" aria-label="Website URL" autoFocus value={url} onChange={event => setUrl(event.target.value)} placeholder="http://localhost:3000 or https://your-app.com" spellCheck={false}/></label>
      <div className="punch-options"><div className="segmented"><button type="button" className={mode === 'quick' ? 'active' : ''} onClick={() => setMode('quick')}><Lightning size={16}/> Quick</button><button type="button" className={mode === 'full' ? 'active' : ''} onClick={() => setMode('full')}><Scan size={16}/> Full</button></div><button className="primary-btn" disabled={submitting || !url.trim()}>{submitting ? 'Starting…' : 'Start punch'}<ArrowRight size={17}/></button></div>
    </form>
    <div className="punch-meta"><span className="privacy-badge">{workspace === 'local' ? 'Reports stay on this device' : 'Completed reports sync to your account'}</span><span>No punch limit</span></div>
    {servers.length > 0 && <div className="server-chips"><span>Detected:</span>{servers.map(server => <button key={server.port} onClick={() => setUrl(server.url)}><i/><strong>{server.service}</strong><code>:{server.port}</code></button>)}</div>}
  </section>;
}
