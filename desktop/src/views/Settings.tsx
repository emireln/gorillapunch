import { useState, type FormEvent } from 'react';
import { ArrowsClockwise, Cloud, CloudArrowUp, Desktop, HardDrives, LockKey, Moon, SignOut, Sun } from '@phosphor-icons/react';
import type { CloudState, DesktopSettings } from '../../shared/types';
import { Dropdown } from '../components/Dropdown';

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
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);
  const [accountMessage, setAccountMessage] = useState('');

  const authenticate = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setAccountMessage('');
    try {
      if (signup) {
        if (!terms) throw new Error('Accept the Terms and Privacy Policy to create an account.');
        const result = await window.gorillaPunch.cloud.signUp({ email, password, displayName: name });
        setPassword('');
        if (result.needsEmailConfirmation) {
          setSignup(false);
          setTerms(false);
          setAccountMessage('Check your email and confirm your account. Then sign in here to sync reports.');
        } else {
          onCloud(result.state);
          notify('Account connected. Cloud sync is ready.', 'success');
        }
      } else {
        const state = await window.gorillaPunch.cloud.signIn({ email, password });
        onCloud(state);
        setPassword('');
        notify('Account connected. Cloud sync is ready.', 'success');
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'We could not connect your account. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    try {
      onCloud(await window.gorillaPunch.cloud.signOut());
      notify('Signed out.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Sign out failed. Please try again.', 'error');
    }
  };

  const chooseCloud = () => {
    void onSettings({ workspace: 'cloud', autoSync: true });
    if (!cloud.authenticated) document.getElementById('cloud-account')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const checkForUpdates = async () => {
    setCheckingForUpdates(true);
    try {
      const message = await window.gorillaPunch.system.checkForUpdates();
      notify(message, message.includes('unavailable') ? 'error' : 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The update service is unavailable right now.', 'error');
    } finally {
      setCheckingForUpdates(false);
    }
  };

  return <div className="view settings-view">
    <div className="page-heading"><div><span className="eyebrow">PREFERENCES</span><h1>Settings</h1><p>Choose where reports go and adjust how audits run.</p></div></div>

    <section className="settings-section">
      <div className="settings-intro"><h2>Report storage</h2><p>Choose where new reports are saved.</p></div>
      <div className="workspace-choice">
        <button className={settings.workspace === 'local' ? 'selected' : ''} onClick={() => void onSettings({ workspace: 'local' })}>
          <HardDrives size={25}/><strong>On this device</strong><span>Reports and screenshots stay on this PC. No account needed.</span><em>Ready to use</em>
        </button>
        <button disabled={!cloud.configured} className={settings.workspace === 'cloud' ? 'selected' : ''} onClick={chooseCloud}>
          <CloudArrowUp size={25}/><strong>Cloud sync</strong><span>Sign in to sync completed report results to your account. Screenshots stay on this PC.</span><em>{!cloud.configured ? 'Unavailable right now' : cloud.authenticated ? 'Account connected' : 'Sign in below'}</em>
        </button>
      </div>
    </section>

    <section className="settings-section" id="cloud-account">
      <div className="settings-intro"><h2>GorillaPunch account</h2><p>Sign in or create an account to sync reports.</p></div>
      <div className="settings-card cloud-account">
        {cloud.authenticated ? <>
          <div className="account-avatar">{cloud.email?.[0]?.toUpperCase()}</div>
          <div><strong>{cloud.email}</strong><span>Ready to sync</span></div>
          <button className="secondary-btn" onClick={() => void signOut()}><SignOut size={17}/> Sign out</button>
        </> : cloud.configured ? <form onSubmit={authenticate}>
          <div className="form-heading"><LockKey size={22}/><div><strong>{signup ? 'Create account' : 'Sign in'}</strong><span>Use your GorillaPunch account to sync reports.</span></div></div>
          {accountMessage && <p className="account-message" role="status">{accountMessage}</p>}
          {signup && <input aria-label="Name" autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder="Name" required maxLength={80} />}
          <input aria-label="Email" autoComplete="email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="Email" required maxLength={254}/>
          <input aria-label="Password" autoComplete={signup ? 'new-password' : 'current-password'} type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder={signup ? 'Password (10 or more characters)' : 'Password'} required minLength={signup ? 10 : 1} maxLength={128}/>
          {signup && <label className="terms-check"><input type="checkbox" checked={terms} onChange={event => setTerms(event.target.checked)}/> <span>I agree to the <a href="https://www.gorillapunch.run/terms" target="_blank" rel="noreferrer">Terms</a> and <a href="https://www.gorillapunch.run/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.</span></label>}
          <button className="primary-btn" disabled={busy}>{busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}</button>
          {!signup && <p className="recovery-help">For account recovery, contact <button type="button" className="text-btn recovery-email" onClick={() => void window.gorillaPunch.system.openExternal('mailto:gorillapunch.run@gmail.com')}>gorillapunch.run@gmail.com</button>.</p>}
          <button type="button" className="text-btn" onClick={() => { setSignup(value => !value); setAccountMessage(''); setPassword(''); setTerms(false); }}>{signup ? 'Already have an account? Sign in' : 'Need an account? Create one'}</button>
        </form> : <div className="unconfigured"><Cloud size={28}/><strong>Cloud sync unavailable</strong><p>Try again later or contact support. You can still save reports on this device.</p></div>}
      </div>
    </section>

    <section className="settings-section">
      <div className="settings-intro"><h2>Audit options</h2><p>Choose how much of each site to check.</p></div>
      <div className="audit-options">
        <div className="settings-card fields-grid"><label><span>Default audit</span><Dropdown<'quick' | 'full'> ariaLabel="Default audit" value={settings.defaultMode} onChange={value => void onSettings({ defaultMode: value })} options={[{ value: 'quick', label: 'Quick' }, { value: 'full', label: 'Full' }]}/></label></div>
        <details className="settings-card advanced-settings"><summary>More options</summary><div className="fields-grid"><label><span>Pages to check</span><input type="number" min={1} max={30} value={settings.maxPages} onChange={event => void onSettings({ maxPages: Number(event.target.value) })}/></label><label><span>Link depth</span><input type="number" min={0} max={4} value={settings.maxDepth} onChange={event => void onSettings({ maxDepth: Number(event.target.value) })}/></label><label><span>Time limit (seconds)</span><input type="number" min={30} max={600} value={settings.maxDurationSeconds} onChange={event => void onSettings({ maxDurationSeconds: Number(event.target.value) })}/></label><label><span>Simultaneous audits</span><Dropdown<number> ariaLabel="Simultaneous audits" value={settings.concurrency} onChange={value => void onSettings({ concurrency: value })} options={[{ value: 1, label: '1 — recommended' }, { value: 2, label: '2' }, { value: 3, label: '3' }]}/></label></div></details>
      </div>
    </section>

    <section className="settings-section">
      <div className="settings-intro"><h2>App preferences</h2><p>Window and notification preferences.</p></div>
      <div className="settings-card preference-list">
        <div className="theme-choice"><span>Theme</span>{([['system', Desktop], ['dark', Moon], ['light', Sun]] as const).map(([value, Icon]) => <button key={value} className={settings.theme === value ? 'active' : ''} onClick={() => void onSettings({ theme: value })}><Icon size={17}/>{value}</button>)}</div>
        <Switch label="Minimize to tray on close" checked={settings.closeToTray} onChange={value => void onSettings({ closeToTray: value })}/>
        <Switch label="Completion notifications" checked={settings.notifications} onChange={value => void onSettings({ notifications: value })}/>
        <Switch label="Find development sites automatically" checked={settings.portScan} onChange={value => void onSettings({ portScan: value })}/>
        <Switch label="Launch when Windows starts" checked={settings.launchAtStartup} onChange={value => void onSettings({ launchAtStartup: value })}/>
        {settings.workspace === 'cloud' && <Switch label="Automatically sync completed reports" checked={settings.autoSync} onChange={value => void onSettings({ autoSync: value })}/>}
        <button className="secondary-btn update-button" disabled={checkingForUpdates} onClick={() => void checkForUpdates()}><ArrowsClockwise className={checkingForUpdates ? 'spin' : ''} size={17}/> {checkingForUpdates ? 'Checking…' : 'Check for updates'}</button>
      </div>
    </section>
  </div>;
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange(value: boolean): void }) {
  return <label className="switch-row"><span>{label}</span><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)}/><i/></label>;
}
