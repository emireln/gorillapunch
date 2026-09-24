import { useEffect, useState, type FormEvent } from 'react';
import { Minus, Square, SquaresFour, UserCircle, X } from '@phosphor-icons/react';
import type { CloudState, WorkspaceMode } from '../../shared/types';
import { Brand } from './Brand';
import { Tooltip } from './Tooltip';
import { useDesktopI18n } from '../i18n';

export function TitleBar({ workspace, cloud, online, onPunch, onProfile }: { workspace: WorkspaceMode; cloud: CloudState | null; online: boolean; onPunch(url: string): void; onProfile(): void }) {
  const [maximized, setMaximized] = useState(false);
  const [url, setUrl] = useState('');
  const { t } = useDesktopI18n();
  useEffect(() => {
    void window.gorillaPunch.window.isMaximized().then(setMaximized);
    return window.gorillaPunch.window.onMaximized(setMaximized);
  }, []);
  const submit = (event: FormEvent) => { event.preventDefault(); if (url.trim()) { onPunch(url); setUrl(''); } };
  return <header className="titlebar">
    <Brand/>
    <form className="titlebar-punch no-drag" onSubmit={submit}><input value={url} onChange={event => setUrl(event.target.value)} placeholder={t('app.quickUrl')} aria-label={t('app.quickUrlLabel')}/><button type="submit">{t('app.punch')}</button></form>
    {workspace === 'cloud' && <div className="titlebar-status no-drag">{cloud?.authenticated ? <Tooltip content={t('app.profile')}><button className="titlebar-avatar" type="button" aria-label={t('app.profile')} onClick={onProfile}>{cloud.avatarDataUrl ? <img src={cloud.avatarDataUrl} alt=""/> : <UserCircle size={27}/>}</button></Tooltip> : <Tooltip content={t(online ? 'app.online' : 'app.offline')}><span className={`connection-dot ${online ? 'online' : ''}`} aria-label={t(online ? 'app.online' : 'app.offline')} tabIndex={0}/></Tooltip>}</div>}
    <div className="window-controls no-drag">
      <Tooltip content={t('window.minimize')}><button aria-label={t('window.minimize')} onClick={() => void window.gorillaPunch.window.minimize()}><Minus size={16}/></button></Tooltip>
      <Tooltip content={t(maximized ? 'window.restore' : 'window.maximize')}><button aria-label={t(maximized ? 'window.restore' : 'window.maximize')} onClick={() => void window.gorillaPunch.window.maximize()}>{maximized ? <SquaresFour size={14}/> : <Square size={14}/>}</button></Tooltip>
      <Tooltip content={t('window.close')}><button className="window-close" aria-label={t('window.close')} onClick={() => void window.gorillaPunch.window.close()}><X size={16}/></button></Tooltip>
    </div>
  </header>;
}
