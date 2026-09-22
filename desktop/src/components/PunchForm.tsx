import { useState, type FormEvent } from 'react';
import { ArrowRight, Globe, Lightning, Scan } from '@phosphor-icons/react';
import type { LocalServer, ScanMode, WorkspaceMode } from '../../shared/types';

export function PunchForm({ workspace, defaultMode, servers, busy, onPunch }: { workspace: WorkspaceMode; defaultMode: Exclude<ScanMode, 'deep'>; servers: LocalServer[]; busy: boolean; onPunch(url: string, mode: 'quick' | 'full'): void }) {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'quick' | 'full'>(defaultMode);
  const submit = (event: FormEvent) => { event.preventDefault(); if (url.trim()) onPunch(url, mode); };
  return <section className="punch-card">
    <div className="punch-card-copy"><span className="eyebrow">LOCAL BROWSER ENGINE</span><h1>Is your app actually ready?</h1><p>Run the full inspection on this machine. Localhost, intranet, and public URLs are all supported.</p></div>
    <form onSubmit={submit} className="desktop-punch-form">
      <div className="url-field"><Globe size={21}/><input id="main-punch-url" autoFocus value={url} onChange={event => setUrl(event.target.value)} placeholder="http://localhost:3000 or https://your-app.com" spellCheck={false}/></div>
      <div className="punch-options"><div className="segmented"><button type="button" className={mode === 'quick' ? 'active' : ''} onClick={() => setMode('quick')}><Lightning size={16}/> Quick</button><button type="button" className={mode === 'full' ? 'active' : ''} onClick={() => setMode('full')}><Scan size={16}/> Full</button></div><button className="primary-btn" disabled={busy || !url.trim()}>{busy ? 'Queued…' : 'Start punch'}<ArrowRight size={17}/></button></div>
    </form>
    <div className="punch-meta"><span className="privacy-badge">{workspace === 'local' ? 'Private · SQLite only · zero cloud traffic' : 'Local execution · syncs completed report to Supabase'}</span><span>Unlimited local punches</span></div>
    {servers.length > 0 && <div className="server-chips"><span>Detected:</span>{servers.map(server => <button key={server.port} onClick={() => setUrl(server.url)}><i/><strong>{server.service}</strong><code>:{server.port}</code></button>)}</div>}
  </section>;
}
