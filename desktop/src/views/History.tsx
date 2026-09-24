import { useMemo, useState } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import type { ScanItem } from '../utils';
import { Dropdown } from '../components/Dropdown';
import { ScanList } from '../components/ScanList';
import { useDesktopI18n } from '../i18n';

export function History({ items, onOpen }: { items: ScanItem[]; onOpen(item: ScanItem): void }) {
  const { t } = useDesktopI18n();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const filtered = useMemo(() => items.filter(item => {
    const matchesQuery = !query || item.scan.target_url.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (!status || item.scan.status === status);
  }), [items, query, status]);
  return <div className="view">
    <div className="page-heading"><div><span className="eyebrow">{t('history.eyebrow')}</span><h1>{t('history.title')}</h1><p>{t('history.subtitle')}</p></div><span className="count-badge">{filtered.length}</span></div>
    <section className="panel"><div className="history-filters"><label><MagnifyingGlass size={18}/><input aria-label={t('history.search')} value={query} onChange={event => setQuery(event.target.value)} placeholder={t('history.search')}/></label><Dropdown<string> className="history-status-filter" ariaLabel={t('history.filter')} value={status} onChange={setStatus} options={[{ value: '', label: t('history.allStatuses') }, { value: 'completed', label: t('history.completed') }, { value: 'running', label: t('history.running') }, { value: 'failed', label: t('history.failed') }, { value: 'cancelled', label: t('history.cancelled') }]}/></div><ScanList items={filtered} onOpen={onOpen} empty={t('history.empty')}/></section>
  </div>;
}
