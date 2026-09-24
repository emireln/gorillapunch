import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ArrowsClockwise, Cloud, CloudArrowUp, Desktop, HardDrives, LockKey, Moon, SignOut, Sun, UserCircle } from '@phosphor-icons/react';
import type { CloudState, DesktopLocalePreference, DesktopSettings, DesktopUpdateState } from '../../shared/types';
import { Dropdown } from '../components/Dropdown';
import { useDesktopI18n, type DesktopMessage } from '../i18n';

export function Settings({ settings, cloud, pendingCount, onSyncPending, onSettings, onCloud, onAvatar, notify }: {
  settings: DesktopSettings;
  cloud: CloudState;
  pendingCount: number;
  onSyncPending(): Promise<void>;
  onSettings(patch: Partial<DesktopSettings>): Promise<void>;
  onCloud(state: CloudState): void;
  onAvatar(state: CloudState): void;
  notify(message: string, tone?: 'success' | 'error'): void;
}) {
  const { t, setLocalePreference } = useDesktopI18n();
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);
  const [updateActionBusy, setUpdateActionBusy] = useState(false);
  const [updateState, setUpdateState] = useState<DesktopUpdateState>({ status: 'idle' });
  const [accountMessage, setAccountMessage] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [syncingPending, setSyncingPending] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = window.gorillaPunch.system.onUpdateState(setUpdateState);
    void window.gorillaPunch.system.getUpdateState().then(setUpdateState).catch(() => undefined);
    return unsubscribe;
  }, []);

  const changeAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setAvatarBusy(true);
    try {
      const webp = await compressAvatar(file, t);
      onAvatar(await window.gorillaPunch.cloud.saveAvatar(webp));
      notify(t('settings.pictureUpdated'));
    } catch (error) { notify(error instanceof Error ? error.message : t('settings.pictureError'), 'error'); }
    finally { setAvatarBusy(false); }
  };

  const authenticate = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setAccountMessage('');
    try {
      if (signup) {
        if (!terms) throw new Error(t('settings.acceptTerms'));
        const result = await window.gorillaPunch.cloud.signUp({ email, password, displayName: name });
        setPassword('');
        if (result.needsEmailConfirmation) {
          setSignup(false);
          setTerms(false);
          setAccountMessage(t('settings.emailConfirm'));
        } else {
          onCloud(result.state);
          notify(t('settings.accountReady'), 'success');
        }
      } else {
        const state = await window.gorillaPunch.cloud.signIn({ email, password });
        onCloud(state);
        setPassword('');
        notify(t('settings.accountReady'), 'success');
      }
    } catch (error) {
      notify(localizedAccountError(error, t), 'error');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    try {
      onCloud(await window.gorillaPunch.cloud.signOut());
      notify(t('settings.signOutSuccess'), 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : t('settings.signOutError'), 'error');
    }
  };

  const chooseCloud = () => {
    void onSettings({ workspace: 'cloud', autoSync: true });
    if (!cloud.authenticated) {
      const account = document.getElementById('cloud-account');
      const pane = account?.closest('main');
      if (account && pane) {
        const paneBounds = pane.getBoundingClientRect();
        const accountBounds = account.getBoundingClientRect();
        const top = pane.scrollTop + accountBounds.top - paneBounds.top - (pane.clientHeight - account.clientHeight) / 2;
        pane.scrollTo({ top: Math.max(0, Math.min(top, pane.scrollHeight - pane.clientHeight)), behavior: 'smooth' });
      }
    }
  };

  const checkForUpdates = async () => {
    setCheckingForUpdates(true);
    try {
      const message = await window.gorillaPunch.system.checkForUpdates();
      const version = message.match(/^Version (.+) is available\.$/)?.[1];
      setUpdateState(await window.gorillaPunch.system.getUpdateState());
      notify(version ? t('settings.updateAvailable', { version }) : message.includes('up to date') ? t('settings.updateCurrent') : message, message.includes('unavailable') ? 'error' : 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : t('settings.updatesUnavailable'), 'error');
    } finally {
      setCheckingForUpdates(false);
    }
  };

  const downloadUpdate = async () => {
    setUpdateActionBusy(true);
    try {
      await window.gorillaPunch.system.downloadUpdate();
    } catch {
      notify(t('settings.updateDownloadError'), 'error');
      setUpdateState(await window.gorillaPunch.system.getUpdateState().catch(() => ({ status: 'error' as const })));
    } finally {
      setUpdateActionBusy(false);
    }
  };

  const installUpdate = async () => {
    setUpdateActionBusy(true);
    try {
      await window.gorillaPunch.system.installUpdate();
    } catch {
      notify(t('settings.updateInstallError'), 'error');
      setUpdateActionBusy(false);
    }
  };

  const retryPending = async () => {
    setSyncingPending(true);
    try { await onSyncPending(); } finally { setSyncingPending(false); }
  };

  return <div className="view settings-view">
    <div className="page-heading"><div><span className="eyebrow">{t('settings.eyebrow')}</span><h1>{t('settings.title')}</h1><p>{t('settings.subtitle')}</p></div></div>

    <section className="settings-section">
      <div className="settings-intro"><h2>{t('settings.storageTitle')}</h2><p>{t('settings.storageSubtitle')}</p></div>
      <div className="workspace-choice">
        <button className={settings.workspace === 'local' ? 'selected' : ''} onClick={() => void onSettings({ workspace: 'local' })}>
          <HardDrives size={25}/><strong>{t('settings.local')}</strong><span>{t('settings.localDesc')}</span><em>{t('settings.ready')}</em>
        </button>
        <button disabled={!cloud.configured} className={settings.workspace === 'cloud' ? 'selected' : ''} onClick={chooseCloud}>
          <CloudArrowUp size={25}/><strong>{t('settings.cloud')}</strong><span>{t('settings.cloudDesc')}</span><em>{!cloud.configured ? t('settings.unavailable') : cloud.authenticated ? t('settings.connected') : t('settings.signInBelow')}</em>
        </button>
      </div>
    </section>

    <section className="settings-section" id="cloud-account">
      <div className="settings-intro"><h2>{t('settings.account')}</h2><p>{t('settings.accountDesc')}</p></div>
      <div className="settings-card cloud-account">
        {cloud.authenticated ? <>
          {settings.workspace === 'cloud' && <div className="account-avatar">{cloud.avatarDataUrl ? <img src={cloud.avatarDataUrl} alt=""/> : <UserCircle size={28}/>}</div>}
          <div><strong>{cloud.email}</strong><span>{settings.workspace === 'cloud' ? t('settings.ready') : t('settings.savingLocal')}</span></div>
          {settings.workspace === 'cloud' && <><input ref={avatarInput} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" aria-label={t('settings.pictureLabel')} onChange={event => void changeAvatar(event)}/><button className="secondary-btn" disabled={avatarBusy} onClick={() => avatarInput.current?.click()}>{avatarBusy ? t('settings.saving') : t('settings.changePicture')}</button>{cloud.avatarDataUrl && <button className="text-btn" disabled={avatarBusy} onClick={() => void window.gorillaPunch.cloud.saveAvatar(null).then(onAvatar).then(() => notify(t('settings.pictureRemoved'))).catch(error => notify(error instanceof Error ? error.message : t('settings.removePictureError'), 'error'))}>{t('settings.remove')}</button>}</>}
          {settings.workspace === 'cloud' && pendingCount > 0 && <button className="secondary-btn" disabled={syncingPending} onClick={() => void retryPending()}><CloudArrowUp size={17}/>{syncingPending ? t('settings.syncing') : t('settings.syncPending', { count: pendingCount })}</button>}
          <button className="secondary-btn" onClick={() => void signOut()}><SignOut size={17}/> {t('settings.signOut')}</button>
        </> : cloud.configured ? <form onSubmit={authenticate}>
          <div className="form-heading"><LockKey size={22}/><div><strong>{signup ? t('settings.createAccount') : t('settings.signIn')}</strong><span>{t('settings.accountSyncDesc')}</span></div></div>
          {accountMessage && <p className="account-message" role="status">{accountMessage}</p>}
          {signup && <input aria-label={t('settings.name')} autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder={t('settings.name')} required maxLength={80} />}
          <input aria-label={t('settings.email')} autoComplete="email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder={t('settings.email')} required maxLength={254}/>
          <input aria-label={t('settings.password')} autoComplete={signup ? 'new-password' : 'current-password'} type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder={signup ? t('settings.passwordLong') : t('settings.password')} required minLength={signup ? 10 : 1} maxLength={128}/>
          {signup && <label className="terms-check"><input type="checkbox" checked={terms} onChange={event => setTerms(event.target.checked)}/> <span>{t('settings.agreeTerms')} <a href="https://www.gorillapunch.run/terms" target="_blank" rel="noreferrer">{t('settings.terms')}</a> {t('settings.and')} <a href="https://www.gorillapunch.run/privacy" target="_blank" rel="noreferrer">{t('settings.privacy')}</a>.</span></label>}
          <button className="primary-btn" disabled={busy}>{busy ? t('settings.wait') : signup ? t('settings.createAccount') : t('settings.signIn')}</button>
          {!signup && <p className="recovery-help">{t('settings.recovery')} <button type="button" className="text-btn recovery-email" onClick={() => void window.gorillaPunch.system.openExternal('mailto:gorillapunch.run@gmail.com')}>gorillapunch.run@gmail.com</button>.</p>}
          <button type="button" className="text-btn" onClick={() => { setSignup(value => !value); setAccountMessage(''); setPassword(''); setTerms(false); }}>{signup ? t('settings.alreadyAccount') : t('settings.needAccount')}</button>
        </form> : <div className="unconfigured"><Cloud size={28}/><strong>{t('settings.cloudUnavailable')}</strong><p>{t('settings.cloudUnavailableDesc')}</p></div>}
      </div>
    </section>

    <section className="settings-section">
      <div className="settings-intro"><h2>{t('settings.auditTitle')}</h2><p>{t('settings.auditSubtitle')}</p></div>
      <div className="audit-options">
        <div className="settings-card fields-grid"><label><span>{t('settings.defaultAudit')}</span><Dropdown<'quick' | 'full'> ariaLabel={t('settings.defaultAudit')} value={settings.defaultMode} onChange={value => void onSettings({ defaultMode: value })} options={[{ value: 'quick', label: t('dashboard.quick') }, { value: 'full', label: t('dashboard.full') }]}/></label></div>
        <details className="settings-card advanced-settings"><summary>{t('settings.moreOptions')}</summary><div className="fields-grid"><label><span>{t('settings.pages')}</span><input type="number" min={1} max={30} value={settings.maxPages} onChange={event => void onSettings({ maxPages: Number(event.target.value) })}/></label><label><span>{t('settings.depth')}</span><input type="number" min={0} max={4} value={settings.maxDepth} onChange={event => void onSettings({ maxDepth: Number(event.target.value) })}/></label><label><span>{t('settings.timeLimit')}</span><input type="number" min={30} max={600} value={settings.maxDurationSeconds} onChange={event => void onSettings({ maxDurationSeconds: Number(event.target.value) })}/></label><label><span>{t('settings.concurrency')}</span><Dropdown<number> ariaLabel={t('settings.concurrency')} value={settings.concurrency} onChange={value => void onSettings({ concurrency: value })} options={[{ value: 1, label: t('settings.recommended') }, { value: 2, label: '2' }, { value: 3, label: '3' }]}/></label></div></details>
      </div>
    </section>

    <section className="settings-section">
      <div className="settings-intro"><h2>{t('settings.preferencesTitle')}</h2><p>{t('settings.preferencesSubtitle')}</p></div>
      <div className="settings-card preference-list">
        <div className="theme-choice"><span>{t('settings.theme')}</span>{([['system', Desktop], ['dark', Moon], ['light', Sun]] as const).map(([value, Icon]) => <button key={value} className={settings.theme === value ? 'active' : ''} onClick={() => void onSettings({ theme: value })}><Icon size={17}/>{t(`settings.${value}` as 'settings.system' | 'settings.dark' | 'settings.light')}</button>)}</div>
        <label className="locale-choice"><span>{t('settings.language')}</span><Dropdown<DesktopLocalePreference> ariaLabel={t('settings.language')} value={settings.locale} onChange={value => { setLocalePreference(value); void onSettings({ locale: value }); }} options={[{ value: 'auto', label: t('settings.autoLanguage') }, { value: 'en', label: t('settings.english') }, { value: 'pt-BR', label: t('settings.portuguese') }]}/></label>
        <Switch label={t('settings.minimizeTray')} checked={settings.closeToTray} onChange={value => void onSettings({ closeToTray: value })}/>
        <Switch label={t('settings.notifications')} checked={settings.notifications} onChange={value => void onSettings({ notifications: value })}/>
        <Switch label={t('settings.findDevSites')} checked={settings.portScan} onChange={value => void onSettings({ portScan: value })}/>
        <Switch label={t('settings.launchStartup')} checked={settings.launchAtStartup} onChange={value => void onSettings({ launchAtStartup: value })}/>
        {settings.workspace === 'cloud' && <Switch label={t('settings.autoSync')} checked={settings.autoSync} onChange={value => void onSettings({ autoSync: value })}/>}
        <button className="secondary-btn update-button" disabled={checkingForUpdates || updateActionBusy || updateState.status === 'downloading'} onClick={() => void checkForUpdates()}><ArrowsClockwise className={checkingForUpdates ? 'spin' : ''} size={17}/> {checkingForUpdates ? t('settings.checking') : t('settings.checkUpdates')}</button>
        {updateState.status !== 'idle' && updateState.status !== 'current' && (updateState.status !== 'error' || updateState.version) && <div className="update-status-card" role="status" aria-live="polite">
          <div className="update-status-copy">
            <strong>{updateState.status === 'available' ? t('settings.updateAvailable', { version: updateState.version }) : updateState.status === 'downloading' ? t('settings.downloadingUpdate', { percent: updateState.percent }) : updateState.status === 'downloaded' ? t('settings.updateReady', { version: updateState.version }) : t('settings.updateDownloadError')}</strong>
            {updateState.status === 'downloading' && <progress className="update-progress" max={100} value={updateState.percent} aria-label={t('settings.downloadingUpdate', { percent: updateState.percent })}/>}
          </div>
          {updateState.status === 'available' && <button className="primary-btn update-action" disabled={updateActionBusy} onClick={() => void downloadUpdate()}>{updateActionBusy ? t('settings.downloadingLabel') : t('settings.downloadUpdate')}</button>}
          {updateState.status === 'error' && updateState.version && <button className="secondary-btn update-action" disabled={updateActionBusy} onClick={() => void downloadUpdate()}>{updateActionBusy ? t('settings.downloadingLabel') : t('settings.retryUpdate')}</button>}
          {updateState.status === 'downloaded' && <button className="primary-btn update-action" disabled={updateActionBusy} onClick={() => void installUpdate()}>{t('settings.installUpdate')}</button>}
        </div>}
      </div>
    </section>
  </div>;
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange(value: boolean): void }) {
  return <label className="switch-row"><span>{label}</span><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)}/><i/></label>;
}

async function compressAvatar(file: File, t: ReturnType<typeof useDesktopI18n>['t']): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error(t('settings.avatarInvalid'));
  const image = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 160;
    const context = canvas.getContext('2d');
    if (!context) throw new Error(t('settings.avatarProcessing'));
    const side = Math.min(image.width, image.height);
    context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 160, 160);
    for (const quality of [0.82, 0.65, 0.45]) {
      const dataUrl = canvas.toDataURL('image/webp', quality);
      if (dataUrl.startsWith('data:image/webp;base64,') && dataUrl.length - 23 <= 65536) return dataUrl.slice(23);
    }
    throw new Error(t('settings.avatarCompression'));
  } finally { image.close(); }
}

function localizedAccountError(error: unknown, t: ReturnType<typeof useDesktopI18n>['t']) {
  const message = error instanceof Error ? error.message : '';
  const messages: Record<string, DesktopMessage> = {
    'Enter a valid email address.': 'settings.errValidEmail',
    'Enter your password.': 'settings.errPassword',
    'Use a password with 128 characters or fewer.': 'settings.errPasswordTooLong',
    'Use a password between 10 and 128 characters.': 'settings.errPasswordRange',
    'Cloud sync is unavailable right now. Try again later or contact support.': 'settings.errCloudUnavailable',
    'Too many attempts. Wait a moment and try again.': 'settings.errTooManyAttempts',
    'We could not reach your account right now. Check your connection and try again.': 'settings.errReachAccount',
    'Email or password is incorrect. Please try again.': 'settings.errBadCredentials',
    'We could not sign in. Please try again.': 'settings.errCouldNotSignIn',
    'An account with this email already exists. Sign in instead.': 'settings.errAlreadyExists',
    'Choose a stronger password and try again.': 'settings.errStrongerPassword',
    'We could not create your account. Please try again.': 'settings.errCouldNotCreate',
    'We could not connect your account. Please try again.': 'settings.errConnectAccount',
  };
  return messages[message] ? t(messages[message]) : message || t('settings.connectError');
}
