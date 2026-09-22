import { Binoculars, ClockCounterClockwise, Gear, House, HardDrives, Cloud, type Icon } from '@phosphor-icons/react';
import type { CloudState, WorkspaceMode } from '../../shared/types';

export type View = 'dashboard' | 'history' | 'watchers' | 'settings' | 'report';
const items: { id: View; label: string; icon: Icon }[] = [
  { id: 'dashboard', label: 'Overview', icon: House },
  { id: 'history', label: 'Punch history', icon: ClockCounterClockwise },
  { id: 'watchers', label: 'Project watch', icon: Binoculars },
  { id: 'settings', label: 'Settings', icon: Gear },
];

export function Sidebar({ view, setView, workspace, cloud }: { view: View; setView(view: View): void; workspace: WorkspaceMode; cloud: CloudState | null }) {
  return <aside className="sidebar">
    <nav>{items.map(item => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}><item.icon size={20}/><span>{item.label}</span></button>)}</nav>
    <div className="sidebar-spacer"/>
    <div className="workspace-card">{workspace === 'local' ? <HardDrives size={20}/> : <Cloud size={20}/>}<div><strong>{workspace === 'local' ? 'Local workspace' : 'Cloud workspace'}</strong><span>{workspace === 'local' ? 'Nothing leaves this device' : cloud?.authenticated ? cloud.email : 'Sign in required'}</span></div></div>
    <div className="shortcut-hint"><kbd>Ctrl</kbd><kbd>K</kbd><span>Quick punch</span></div>
  </aside>;
}
