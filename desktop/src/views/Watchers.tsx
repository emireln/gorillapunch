import { useState, type FormEvent } from 'react';
import { Binoculars, FolderOpen, Pause, Play, Trash } from '@phosphor-icons/react';
import type { WatchProject } from '../../shared/types';

export function Watchers({ watchers, onAdd, onUpdate, onRemove }: {
  watchers: WatchProject[];
  onAdd(url: string, mode: 'quick' | 'full'): Promise<void>;
  onUpdate(watcher: WatchProject): Promise<void>;
  onRemove(id: string): Promise<void>;
}) {
  const [url, setUrl] = useState('http://localhost:3000');
  const [mode, setMode] = useState<'quick' | 'full'>('quick');
  const submit = (event: FormEvent) => { event.preventDefault(); if (url.trim()) void onAdd(url, mode); };
  return <div className="view">
    <div className="page-heading"><div><span className="eyebrow">AUTOMATED LOCAL QA</span><h1>Project watch</h1><p>Choose a source folder. A saved code file queues a fresh punch after changes settle.</p></div><Binoculars size={35}/></div>
    <section className="panel watcher-create"><div><h2>Add a watched project</h2><p>Build output, dependencies, Git data, and coverage folders are ignored.</p></div><form onSubmit={submit}><input value={url} onChange={event => setUrl(event.target.value)} placeholder="http://localhost:3000"/><select value={mode} onChange={event => setMode(event.target.value as 'quick' | 'full')}><option value="quick">Quick punch</option><option value="full">Full punch</option></select><button className="primary-btn"><FolderOpen size={18}/> Choose folder</button></form></section>
    <section className="watcher-list">{watchers.map(watcher => <article className="panel" key={watcher.id}><div className="watcher-icon"><FolderOpen size={22}/></div><div className="watcher-copy"><strong>{watcher.folder.split(/[\\/]/).at(-1)}</strong><span className="mono">{watcher.folder}</span><small>{watcher.targetUrl} · {watcher.mode} punch{watcher.lastTriggeredAt ? ` · last queued ${new Date(watcher.lastTriggeredAt).toLocaleString()}` : ''}</small></div><span className={`watch-state ${watcher.enabled ? 'enabled' : ''}`}>{watcher.enabled ? 'Watching' : 'Paused'}</span><button className="icon-action" title={watcher.enabled ? 'Pause watcher' : 'Resume watcher'} onClick={() => void onUpdate({ ...watcher, enabled: !watcher.enabled })}>{watcher.enabled ? <Pause size={17}/> : <Play size={17}/>}</button><button className="icon-action danger" title="Remove watcher" onClick={() => void onRemove(watcher.id)}><Trash size={17}/></button></article>)}{!watchers.length && <div className="empty-panel large"><Binoculars size={34}/><strong>No folders watched</strong><p>Add a local project to run a quick regression punch after each save.</p></div>}</section>
  </div>;
}
