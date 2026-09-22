import { useState, type FormEvent } from 'react';
import { Cloud, HardDrives, LockKey, SignOut, Sun, Moon, Desktop, ArrowsClockwise } from '@phosphor-icons/react';
import type { CloudState, DesktopSettings } from '../../shared/types';

export function Settings({ settings, cloud, onSettings, onCloud, notify }: {
  settings: DesktopSettings;
  cloud: CloudState;
  onSettings(patch: Partial<DesktopSettings>): Promise<void>;
  onCloud(state: CloudState): void;
  notify(message: string, tone?: 'success' | 'error'): void;
}) {
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const authenticate = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true);
    try {
      if (signup) {
        if (!terms) throw new Error('Accept the Terms and Privacy Policy to create an account.');
        const result = await window.gorillaPunch.cloud.signUp({ email, password, displayName: name });
        onCloud(result.state);
        notify(result.needsEmailConfirmation ? 'Check your email to confirm the account.' : 'Cloud account connected.', 'success');
      } else {
        const state = await window.gorillaPunch.cloud.signIn({ email, password });
        onCloud(state); notify('Cloud account connected.', 'success');
      }
      setPassword('');
    } catch (error) { notify(error instanceof Error ? error.message : 'Authentication failed.', 'error'); }
    finally { setBusy(false); }
  };
  return <div className="view settings-view">
    <div className="page-heading"><div><span className="eyebrow">DESKTOP PREFERENCES</span><h1>Settings</h1><p>Control storage, scanning limits, appearance, and native behavior.</p></div></div>
    <section className="settings-section"><div className="settings-intro"><h2>Workspace</h2><p>Choose where new reports are stored.</p></div><div className="workspace-choice"><button className={settings.workspace === 'local' ? 'selected' : ''} onClick={() => void onSettings({ workspace: 'local' })}><HardDrives size={25}/><strong>Local</strong><span>SQLite and screenshot files on this device. Cloud sync is disabled.</span><em>Private and offline</em></button><button disabled={!cloud.configured} className={settings.workspace === 'cloud' ? 'selected' : ''} onClick={() => void onSettings({ workspace: 'cloud', autoSync: true })}><Cloud size={25}/><strong>Cloud</strong><span>Scans run here; completed reports sync to your Supabase account.</span><em>{cloud.configured ? cloud.authenticated ? 'Connected' : 'Sign in below' : 'Not configured in this build'}</em></button></div></section>
    <section className="settings-section"><div className="settings-intro"><h2>Cloud account</h2><p>Tokens are encrypted by the operating system and stay in the Electron main process.</p></div><div className="settings-card cloud-account">{cloud.authenticated ? <><div className="account-avatar">{cloud.email?.[0]?.toUpperCase()}</div><div><strong>{cloud.email}</strong><span>Authenticated with Supabase</span></div><button className="secondary-btn" onClick={() => void window.gorillaPunch.cloud.signOut().then(state => { onCloud(state); notify('Signed out.', 'success'); })}><SignOut size={17}/> Sign out</button></> : cloud.configured ? <form onSubmit={authenticate}><div className="form-heading"><LockKey size={22}/><div><strong>{signup ? 'Create cloud account' : 'Sign in to cloud'}</strong><span>Use the same account as gorillapunch.run.</span></div></div>{signup && <input value={name} onChange={event => setName(event.target.value)} placeholder="Display name" required maxLength={80}/>}<input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="Email" required/><input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Password (10+ characters)" required minLength={10}/>{signup && <label className="terms-check"><input type="checkbox" checked={terms} onChange={event => setTerms(event.target.checked)}/> I accept the Terms and Privacy Policy.</label>}<button className="primary-btn" disabled={busy}>{busy ? 'Connecting…' : signup ? 'Create account' : 'Sign in'}</button><button type="button" className="text-btn" onClick={() => setSignup(value => !value)}>{signup ? 'Already have an account?' : 'Need an account?'}</button></form> : <div className="unconfigured"><Cloud size={28}/><strong>Cloud configuration is missing</strong><p>Add the public Supabase URL and anon key to the desktop build environment. Server secrets are never accepted.</p></div>}</div></section>
    <section className="settings-section"><div className="settings-intro"><h2>Scan engine</h2><p>Limits keep local browser workloads predictable.</p></div><div className="settings-card fields-grid"><label><span>Default punch</span><select value={settings.defaultMode} onChange={event => void onSettings({ defaultMode: event.target.value as 'quick' | 'full' })}><option value="quick">Quick</option><option value="full">Full</option></select></label><label><span>Maximum pages</span><input type="number" min={1} max={30} value={settings.maxPages} onChange={event => void onSettings({ maxPages: Number(event.target.value) })}/></label><label><span>Crawl depth</span><input type="number" min={0} max={4} value={settings.maxDepth} onChange={event => void onSettings({ maxDepth: Number(event.target.value) })}/></label><label><span>Timeout (seconds)</span><input type="number" min={30} max={600} value={settings.maxDurationSeconds} onChange={event => void onSettings({ maxDurationSeconds: Number(event.target.value) })}/></label><label><span>Parallel punches</span><select value={settings.concurrency} onChange={event => void onSettings({ concurrency: Number(event.target.value) })}><option value={1}>1 — recommended</option><option value={2}>2</option><option value={3}>3</option></select></label></div></section>
    <section className="settings-section"><div className="settings-intro"><h2>Appearance & system</h2><p>Native window and notification behavior.</p></div><div className="settings-card preference-list"><div className="theme-choice"><span>Theme</span>{([['system', Desktop], ['dark', Moon], ['light', Sun]] as const).map(([value, Icon]) => <button key={value} className={settings.theme === value ? 'active' : ''} onClick={() => void onSettings({ theme: value })}><Icon size={17}/>{value}</button>)}</div><Switch label="Minimize to tray on close" checked={settings.closeToTray} onChange={value => void onSettings({ closeToTray: value })}/><Switch label="Completion notifications" checked={settings.notifications} onChange={value => void onSettings({ notifications: value })}/><Switch label="Detect local dev servers" checked={settings.portScan} onChange={value => void onSettings({ portScan: value })}/><Switch label="Launch at Windows sign-in" checked={settings.launchAtStartup} onChange={value => void onSettings({ launchAtStartup: value })}/>{settings.workspace === 'cloud' && <Switch label="Sync completed cloud-workspace reports" checked={settings.autoSync} onChange={value => void onSettings({ autoSync: value })}/>}<button className="secondary-btn update-button" onClick={() => void window.gorillaPunch.system.checkForUpdates().then(message => notify(message, 'success'))}><ArrowsClockwise size={17}/> Check for updates</button></div></section>
  </div>;
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange(value: boolean): void }) {
  return <label className="switch-row"><span>{label}</span><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)}/><i/></label>;
}
