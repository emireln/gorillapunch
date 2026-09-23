import { useState, type FormEvent } from 'react';
import { Binoculars, FolderOpen, Pause, Play, Trash } from '@phosphor-icons/react';
import type { WatchProject } from '../../shared/types';
import { Dropdown } from '../components/Dropdown';

export function Watchers({ watchers, onAdd, onUpdate, onRemove }: {
  watchers: WatchProject[];
  onAdd(url: string, mode: 'quick' | 'full'): Promise<void>;
  onUpdate(watcher: WatchProject): Promise<void>;
  onRemove(id: string): Promise<void>;
}) {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'quick' | 'full'>('quick');
  const submit = (event: FormEvent) => { event.preventDefault(); if (url.trim()) void onAdd(url, mode); };
  return <div className="view">
    <div className="page-heading"><div><span className="eyebrow">AUTOMATION</span><h1>Project monitor</h1><p>Choose a project folder and website address. GorillaPunch rechecks the site when you save code.</p></div><Binoculars size={35}/></div>
    <section className="panel watcher-create"><div><h2>Monitor a project</h2><p>Choose a website address and the project folder to watch.</p></div><form onSubmit={submit}><input value={url} onChange={event => setUrl(event.target.value)} placeholder="Website address" aria-label="Website address"/><Dropdown<'quick' | 'full'> ariaLabel="Audit type" value={mode} onChange={setMode} options={[{ value: 'quick', label: 'Quick audit' }, { value: 'full', label: 'Full audit' }]}/><button className="primary-btn"><FolderOpen size={18}/> Choose folder</button></form></section>
    <section className="watcher-list">{watchers.map(watcher => <article className="panel" key={watcher.id}><div className="watcher-icon"><FolderOpen size={22}/></div><div className="watcher-copy"><strong>{watcher.folder.split(/[\\/]/).at(-1)}</strong><span className="mono">{watcher.folder}</span><small>{watcher.targetUrl} · {watcher.mode} audit{watcher.lastTriggeredAt ? ` · last started ${new Date(watcher.lastTriggeredAt).toLocaleString()}` : ''}</small></div><span className={`watch-state ${watcher.enabled ? 'enabled' : ''}`}>{watcher.enabled ? 'Monitoring' : 'Paused'}</span><button className="icon-action" title={watcher.enabled ? 'Pause monitor' : 'Resume monitor'} onClick={() => void onUpdate({ ...watcher, enabled: !watcher.enabled })}>{watcher.enabled ? <Pause size={17}/> : <Play size={17}/>}</button><button className="icon-action danger" title="Remove monitor" onClick={() => void onRemove(watcher.id)}><Trash size={17}/></button></article>)}{!watchers.length && <div className="empty-panel large"><Binoculars size={34}/><strong>No projects monitored</strong><p>Add a project to check its website after you save code.</p></div>}</section>
  </div>;
}
