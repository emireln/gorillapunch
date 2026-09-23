import { useMemo, useState } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import type { ScanItem } from '../utils';
import { Dropdown } from '../components/Dropdown';
import { ScanList } from '../components/ScanList';

export function History({ items, onOpen }: { items: ScanItem[]; onOpen(item: ScanItem): void }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const filtered = useMemo(() => items.filter(item => {
    const matchesQuery = !query || item.scan.target_url.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (!status || item.scan.status === status);
  }), [items, query, status]);
  return <div className="view">
    <div className="page-heading"><div><span className="eyebrow">REPORT LIBRARY</span><h1>Punch history</h1><p>Reports saved on this device stay here. Synced reports are available in your account.</p></div><span className="count-badge">{filtered.length}</span></div>
    <section className="panel"><div className="history-filters"><label><MagnifyingGlass size={18}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by URL…"/></label><Dropdown<string> className="history-status-filter" ariaLabel="Filter by status" value={status} onChange={setStatus} options={[{ value: '', label: 'All statuses' }, { value: 'completed', label: 'Completed' }, { value: 'running', label: 'Running' }, { value: 'failed', label: 'Failed' }, { value: 'cancelled', label: 'Cancelled' }]}/></div><ScanList items={filtered} onOpen={onOpen} empty="No reports match these filters."/></section>
  </div>;
}
