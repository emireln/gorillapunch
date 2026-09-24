import { useState, type FormEvent } from 'react';
import { Binoculars, FolderOpen, Pause, Play, Trash } from '@phosphor-icons/react';
import type { WatchProject } from '../../shared/types';
import { Dropdown } from '../components/Dropdown';
import { Tooltip } from '../components/Tooltip';
import { useDesktopI18n } from '../i18n';

export function Watchers({ watchers, onAdd, onUpdate, onRemove }: {
  watchers: WatchProject[];
  onAdd(url: string, mode: 'quick' | 'full'): Promise<void>;
  onUpdate(watcher: WatchProject): Promise<void>;
  onRemove(id: string): Promise<void>;
}) {
  const { t, locale } = useDesktopI18n();
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'quick' | 'full'>('quick');
  const submit = (event: FormEvent) => { event.preventDefault(); if (url.trim()) void onAdd(url, mode); };
  return <div className="view">
    <div className="page-heading"><div><span className="eyebrow">{t('watch.eyebrow')}</span><h1>{t('watch.title')}</h1><p>{t('watch.subtitle')}</p></div><Binoculars size={35}/></div>
    <section className="panel watcher-create"><div><h2>{t('watch.createTitle')}</h2><p>{t('watch.createSubtitle')}</p></div><form onSubmit={submit}><input value={url} onChange={event => setUrl(event.target.value)} placeholder={t('watch.address')} aria-label={t('watch.address')}/><Dropdown<'quick' | 'full'> ariaLabel={t('watch.auditType')} value={mode} onChange={setMode} options={[{ value: 'quick', label: t('watch.quickAudit') }, { value: 'full', label: t('watch.fullAudit') }]}/><button className="primary-btn"><FolderOpen size={18}/> {t('watch.chooseFolder')}</button></form></section>
    <section className="watcher-list">{watchers.map(watcher => <article className="panel" key={watcher.id}><div className="watcher-icon"><FolderOpen size={22}/></div><div className="watcher-copy"><strong>{watcher.folder.split(/[\\/]/).at(-1)}</strong><span className="mono">{watcher.folder}</span><small>{watcher.targetUrl} · {watcher.mode === 'quick' ? t('watch.quickAudit') : t('watch.fullAudit')}{watcher.lastTriggeredAt ? ` · ${t('watch.lastStarted', { date: new Date(watcher.lastTriggeredAt).toLocaleString(locale) })}` : ''}</small></div><span className={`watch-state ${watcher.enabled ? 'enabled' : ''}`}>{watcher.enabled ? t('watch.monitoring') : t('watch.paused')}</span><Tooltip content={t(watcher.enabled ? 'watch.pause' : 'watch.resume')}><button className="icon-action" aria-label={t(watcher.enabled ? 'watch.pause' : 'watch.resume')} onClick={() => void onUpdate({ ...watcher, enabled: !watcher.enabled })}>{watcher.enabled ? <Pause size={17}/> : <Play size={17}/>}</button></Tooltip><Tooltip content={t('watch.remove')}><button className="icon-action danger" aria-label={t('watch.remove')} onClick={() => void onRemove(watcher.id)}><Trash size={17}/></button></Tooltip></article>)}{!watchers.length && <div className="empty-panel large"><Binoculars size={34}/><strong>{t('watch.emptyTitle')}</strong><p>{t('watch.emptySubtitle')}</p></div>}</section>
  </div>;
}
