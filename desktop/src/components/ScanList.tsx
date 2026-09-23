import { ArrowRight, Cloud, HardDrives, SpinnerGap } from '@phosphor-icons/react';
import type { ScanItem } from '../utils';
import { host, relativeDate, scoreBand, statusLabel } from '../utils';

export function ScanList({ items, onOpen, empty = 'No punches yet.' }: { items: ScanItem[]; onOpen(item: ScanItem): void; empty?: string }) {
  if (!items.length) return <div className="empty-panel"><strong>{empty}</strong><p>Start with a website address.</p></div>;
  return <div className="scan-list">{items.map(item => {
    const scan = item.scan;
    const active = scan.status === 'queued' || scan.status === 'running';
    return <button key={`${item.source}-${scan.id}`} onClick={() => onOpen(item)} disabled={scan.status !== 'completed'}>
      <span className={`score-pill ${scoreBand(scan.score?.overall)}`}>{active ? <SpinnerGap className="spin" size={18}/> : scan.score?.overall ?? '—'}</span>
      <span className="scan-main"><strong>{host(scan.target_url)}</strong><small>{scan.target_url}</small></span>
      <span className={`status-text status-${scan.status}`}>{statusLabel(scan)}</span>
      <span className="storage-icon" title={item.source === 'cloud' ? 'Saved to your account' : 'Saved on this device'}>{item.source === 'cloud' ? <Cloud size={17}/> : <HardDrives size={17}/>}</span>
      <time>{relativeDate(scan.created_at)}</time>
      <ArrowRight size={17}/>
    </button>;
  })}</div>;
}
