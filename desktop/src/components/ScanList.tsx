import { ArrowRight, Cloud, HardDrives, SpinnerGap } from '@phosphor-icons/react';
import type { ScanItem } from '../utils';
import { host, relativeDate, scoreBand, statusLabel } from '../utils';
import { useDesktopI18n } from '../i18n';
import { Tooltip } from './Tooltip';

export function ScanList({ items, onOpen, empty = 'No punches yet.' }: { items: ScanItem[]; onOpen(item: ScanItem): void; empty?: string }) {
  const { t, locale } = useDesktopI18n();
  if (!items.length) return <div className="empty-panel"><strong>{empty === 'No punches yet.' ? t('scan.noPunches') : empty}</strong><p>{t('scan.startAddress')}</p></div>;
  return <div className="scan-list">{items.map(item => {
    const scan = item.scan;
    const active = scan.status === 'queued' || scan.status === 'running';
    return <button key={`${item.source}-${scan.id}`} onClick={() => onOpen(item)} disabled={scan.status !== 'completed'}>
      <span className={`score-pill ${scoreBand(scan.score?.overall)}`}>{active ? <SpinnerGap className="spin" size={18}/> : scan.score?.overall ?? '—'}</span>
      <span className="scan-main"><strong>{host(scan.target_url)}</strong><small>{scan.target_url}</small></span>
      <span className={`status-text status-${scan.status}`}>{statusLabel(scan, locale, t)}</span>
      <Tooltip content={item.source === 'cloud' ? t('scan.savedAccount') : t('scan.savedLocal')}><span className="storage-icon" aria-label={item.source === 'cloud' ? t('scan.savedAccount') : t('scan.savedLocal')} tabIndex={0}>{item.source === 'cloud' ? <Cloud size={17}/> : <HardDrives size={17}/>}</span></Tooltip>
      <time>{relativeDate(scan.created_at, locale)}</time>
      <ArrowRight size={17}/>
    </button>;
  })}</div>;
}
