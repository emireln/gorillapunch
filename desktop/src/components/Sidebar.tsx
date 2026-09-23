import { Binoculars, CaretDoubleLeft, CaretDoubleRight, ClockCounterClockwise, Gear, House, HardDrives, CloudArrowUp, type Icon } from '@phosphor-icons/react';
import type { CloudState, WorkspaceMode } from '../../shared/types';

export type View = 'dashboard' | 'history' | 'watchers' | 'settings' | 'report';
const items: { id: View; label: string; icon: Icon }[] = [
  { id: 'dashboard', label: 'Overview', icon: House },
  { id: 'history', label: 'Punch history', icon: ClockCounterClockwise },
  { id: 'watchers', label: 'Project monitor', icon: Binoculars },
  { id: 'settings', label: 'Settings', icon: Gear },
];

export function Sidebar({ view, setView, workspace, cloud, collapsed, onToggle }: { view: View; setView(view: View): void; workspace: WorkspaceMode; cloud: CloudState | null; collapsed: boolean; onToggle(): void }) {
  return <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`} aria-label="Main navigation">
    <button className="sidebar-toggle" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={onToggle}>{collapsed ? <CaretDoubleRight size={18}/> : <><span>Navigation</span><CaretDoubleLeft size={18}/></>}</button>
    <nav>{items.map(item => <button key={item.id} className={view === item.id ? 'active' : ''} aria-label={collapsed ? item.label : undefined} title={collapsed ? item.label : undefined} aria-current={view === item.id ? 'page' : undefined} onClick={() => setView(item.id)}><item.icon size={20}/><span>{item.label}</span></button>)}</nav>
    <div className="sidebar-spacer"/>
    <div className="workspace-card" title={workspace === 'local' ? 'Reports saved on this device' : cloud?.authenticated ? 'Reports synced to your account' : 'Sign in to sync reports'}>{workspace === 'local' ? <HardDrives size={20}/> : <CloudArrowUp size={20}/>}<div><strong>{workspace === 'local' ? 'On this device' : 'Cloud sync'}</strong><span>{workspace === 'local' ? 'Saved on this PC' : cloud?.authenticated ? cloud.email : 'Sign in in Settings'}</span></div></div>
    <div className="shortcut-hint"><kbd>Ctrl</kbd><kbd>K</kbd><span>Quick punch</span></div>
  </aside>;
}
