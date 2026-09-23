import { useEffect, useState, type FormEvent } from 'react';
import { Minus, Square, SquaresFour, X } from '@phosphor-icons/react';
import type { CloudState, WorkspaceMode } from '../../shared/types';
import { Brand } from './Brand';

export function TitleBar({ workspace, cloud, online, onPunch }: { workspace: WorkspaceMode; cloud: CloudState | null; online: boolean; onPunch(url: string): void }) {
  const [maximized, setMaximized] = useState(false);
  const [url, setUrl] = useState('');
  useEffect(() => {
    void window.gorillaPunch.window.isMaximized().then(setMaximized);
    return window.gorillaPunch.window.onMaximized(setMaximized);
  }, []);
  const submit = (event: FormEvent) => { event.preventDefault(); if (url.trim()) { onPunch(url); setUrl(''); } };
  return <header className="titlebar">
    <Brand/>
    <form className="titlebar-punch no-drag" onSubmit={submit}><input value={url} onChange={event => setUrl(event.target.value)} placeholder="Quick punch a URL…" aria-label="Quick punch URL"/><button type="submit">Punch</button></form>
    <div className="titlebar-status no-drag"><span className={`connection-dot ${online ? 'online' : ''}`}/><span>{workspace === 'local' ? 'Saved on device' : cloud?.authenticated ? 'Cloud connected' : 'Cloud signed out'}</span></div>
    <div className="window-controls no-drag">
      <button aria-label="Minimize" onClick={() => void window.gorillaPunch.window.minimize()}><Minus size={16}/></button>
      <button aria-label={maximized ? 'Restore' : 'Maximize'} onClick={() => void window.gorillaPunch.window.maximize()}>{maximized ? <SquaresFour size={14}/> : <Square size={14}/>}</button>
      <button className="window-close" aria-label="Close" onClick={() => void window.gorillaPunch.window.close()}><X size={16}/></button>
    </div>
  </header>;
}
