import { Binoculars, CaretDoubleLeft, CaretDoubleRight, ClockCounterClockwise, Gear, House, HardDrives, CloudArrowUp, GameController, type Icon } from '@phosphor-icons/react';
import type { CloudState, WorkspaceMode } from '../../shared/types';
import { Tooltip } from './Tooltip';
import { useDesktopI18n } from '../i18n';

export type View = 'dashboard' | 'history' | 'watchers' | 'settings' | 'report' | 'arcade';
export function Sidebar({ view, setView, workspace, cloud, collapsed, onToggle }: { view: View; setView(view: View): void; workspace: WorkspaceMode; cloud: CloudState | null; collapsed: boolean; onToggle(): void }) {
  const { t } = useDesktopI18n();
  const items: { id: View; label: string; icon: Icon }[] = [
    { id: 'dashboard', label: t('nav.overview'), icon: House },
    { id: 'history', label: t('nav.history'), icon: ClockCounterClockwise },
    { id: 'watchers', label: t('nav.monitor'), icon: Binoculars },
    { id: 'settings', label: t('nav.settings'), icon: Gear },
  ];
  const toggle = <button className="sidebar-toggle" aria-label={collapsed ? t('nav.expand') : t('nav.collapse')} onClick={onToggle}>{collapsed ? <CaretDoubleRight size={18}/> : <><span>{t('nav.navigation')}</span><CaretDoubleLeft size={18}/></>}</button>;
  return <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`} aria-label={t('nav.label')}>
    {collapsed ? <Tooltip content={t('nav.expand')}>{toggle}</Tooltip> : toggle}
    <nav>{items.map(item => {
      const button = <button key={item.id} className={view === item.id ? 'active' : ''} aria-label={collapsed ? item.label : undefined} aria-current={view === item.id ? 'page' : undefined} onClick={() => setView(item.id)}><item.icon size={20}/><span>{item.label}</span></button>;
      return collapsed ? <Tooltip key={item.id} content={item.label}>{button}</Tooltip> : button;
    })}</nav>
    <div className="sidebar-spacer"/>
    {(() => { const link = <button className={`sidebar-arcade-link ${view === 'arcade' ? 'active' : ''}`} aria-label={collapsed ? t('nav.game') : undefined} aria-current={view === 'arcade' ? 'page' : undefined} onClick={() => setView('arcade')}><GameController size={18}/><span>{t('nav.game')}</span></button>; return collapsed ? <Tooltip content={t('nav.game')}>{link}</Tooltip> : link; })()}
    <div className="workspace-card">{workspace === 'local' ? <HardDrives size={20}/> : <CloudArrowUp size={20}/>}<div><strong>{workspace === 'local' ? t('nav.local') : t('nav.cloud')}</strong><span>{workspace === 'local' ? t('nav.localSaved') : cloud?.authenticated ? cloud.email : t('nav.signInSettings')}</span></div></div>
    <div className="shortcut-hint"><kbd>Ctrl</kbd><kbd>K</kbd><span>{t('nav.quickPunch')}</span></div>
  </aside>;
}
