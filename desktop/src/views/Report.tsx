import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CaretDown, Check, CloudArrowUp, Copy, DownloadSimple, Eye, MagnifyingGlass, Trash, X } from '@phosphor-icons/react';
import type { DesktopReport, ExportFormat, Finding, WorkspaceMode } from '../../shared/types';
import { Dropdown } from '../components/Dropdown';
import { host, scoreBand } from '../utils';

const categoryNames: Record<string, string> = { performance: 'Performance', security: 'Security', seo: 'SEO', accessibility: 'Accessibility', reliability: 'Reliability', ux: 'User experience', production: 'Production' };

export function ReportView({ report, source, onBack, onDelete, onSync, notify }: {
  report: DesktopReport;
  source: WorkspaceMode;
  onBack(): void;
  onDelete(): Promise<void>;
  onSync(): Promise<void>;
  notify(message: string, tone?: 'success' | 'error'): void;
}) {
  const [selected, setSelected] = useState<Finding | null>(null);
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState('');
  const [tab, setTab] = useState<'findings' | 'pages' | 'screenshots' | 'metrics'>('findings');
  const exportRef = useRef<HTMLDetailsElement>(null);
  const scan = report.scan, score = scan.score;
  const highFindings = report.findings.filter(finding => finding.severity === 'HIGH').length;
  useEffect(() => {
    const closeMenu = (event: PointerEvent) => {
      if (!exportRef.current?.contains(event.target as Node)) exportRef.current?.removeAttribute('open');
    };
    document.addEventListener('pointerdown', closeMenu);
    return () => document.removeEventListener('pointerdown', closeMenu);
  }, []);
  const filtered = useMemo(() => report.findings.filter(finding => (!severity || finding.severity === severity) && (!query || `${finding.title} ${finding.evidence} ${finding.check_key}`.toLowerCase().includes(query.toLowerCase()))), [report.findings, severity, query]);
  const exportFile = (format: ExportFormat) => void window.gorillaPunch.reports.export(scan.id, source, format).then(path => { if (path) notify(`Saved to ${path}`, 'success'); }).catch(error => notify(error instanceof Error ? error.message : 'Export failed.', 'error'));
  const copyPrompt = async () => {
    try {
      const count = await window.gorillaPunch.reports.copyPrompt(scan.id, source);
      notify(count ? `Fix prompt copied with ${count} prioritized ${count === 1 ? 'finding' : 'findings'}.` : 'Report summary copied.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not copy the fix prompt.', 'error'); }
  };
  return <div className="report-view">
    <div className="report-toolbar"><button className="secondary-btn" onClick={onBack}><ArrowLeft size={17}/> Back</button><div className="report-url"><strong>{host(scan.target_url)}</strong><span>{scan.target_url}</span></div><div className="toolbar-actions"><button className="primary-btn copy-prompt-btn" onClick={() => void copyPrompt()}><Copy size={18}/> Copy fix prompt</button>{source === 'local' && scan.storage === 'cloud' && !scan.synced_at && <button className="secondary-btn" onClick={() => void onSync()}><CloudArrowUp size={17}/> Sync</button>}<details className="export-menu" ref={exportRef}><summary className="secondary-btn"><DownloadSimple size={18}/> Export <CaretDown size={14}/></summary><div className="export-options">{([['pdf', 'PDF'], ['markdown', 'Markdown'], ['json', 'JSON'], ['csv', 'CSV']] as const).map(([format, label]) => <button key={format} onClick={() => { exportRef.current?.removeAttribute('open'); exportFile(format); }}>{label}</button>)}</div></details><button className="icon-action danger" aria-label="Delete report" title="Delete report" onClick={() => void onDelete()}><Trash size={18}/></button></div></div>
    <section className="report-hero"><div className={`score-ring ${score?.verdict === 'ALMOST READY' ? 'warn' : scoreBand(score?.overall)}`}><strong>{score?.overall ?? '—'}</strong><span>/100</span></div><div className="report-verdict"><span className="eyebrow">LAUNCH GATE</span><h1>{score?.verdict || 'INSUFFICIENT COVERAGE'}</h1><p>{score?.launch ? 'No automated launch blockers were detected.' : score?.verdict === 'INSUFFICIENT COVERAGE' ? 'Some essential checks could not complete. Review the evidence before deciding.' : 'Resolve the highest severity evidence before launch.'}</p><div className="report-summary"><span><b>{score?.blockers || 0}</b> blockers</span><span><b>{score?.critical || 0}</b> critical</span><span><b>{highFindings}</b> high</span><span><b>{score?.coverage || 0}%</b> coverage</span></div></div><div className="report-origin"><span>{source === 'cloud' ? 'Saved to your account' : 'Saved on this device'}</span><strong>{scan.mode.toUpperCase()} PUNCH</strong><small>{new Date(scan.created_at).toLocaleString()}</small>{scan.sync_error && <em>{scan.sync_error}</em>}</div></section>
    <section className="category-grid">{Object.entries(score?.categories || {}).map(([category, value]) => <article key={category}><span>{categoryNames[category] || category}</span><strong>{value}</strong><div><i style={{ width: `${value}%` }}/></div></article>)}</section>
    <div className="report-tabs">{([['findings', `Findings ${report.findings.length}`], ['pages', `Pages ${report.pages.length}`], ['screenshots', `Screenshots ${report.screenshots.length}`], ['metrics', `Metrics ${report.metrics.length}`]] as const).map(([value, label]) => <button key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{label}</button>)}</div>
    {tab === 'findings' && <section className="report-content"><div className="finding-filters"><label><MagnifyingGlass size={17}/><input aria-label="Search evidence" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search evidence…"/></label><Dropdown<string> className="finding-severity-filter" ariaLabel="Filter by severity" value={severity} onChange={setSeverity} options={[{ value: '', label: 'All severities' }, ...['BLOCKER','CRITICAL','HIGH','MEDIUM','LOW','OPPORTUNITY','PASSED'].map(value => ({ value, label: value }))]}/></div><div className="desktop-findings">{filtered.map(finding => <button key={finding.id} onClick={() => setSelected(finding)}><span className={`severity ${finding.severity}`}>{finding.severity}</span><span><strong>{finding.title}</strong><small>{categoryNames[finding.category] || finding.category}</small><p>{finding.evidence}</p></span><Eye size={18}/></button>)}</div>{!filtered.length && <div className="empty-panel"><Check size={28}/><strong>No findings match.</strong></div>}</section>}
    {tab === 'pages' && <section className="report-content table-panel"><table><thead><tr><th>Page</th><th>Status</th><th>Indexable</th><th>Load time</th></tr></thead><tbody>{report.pages.map(page => <tr key={page.id}><td>{page.url}</td><td>{page.status_code}</td><td>{page.indexable ? 'Yes' : 'No'}</td><td>{Math.round(page.load_time)} ms</td></tr>)}</tbody></table></section>}
    {tab === 'screenshots' && <section className="report-content screenshot-grid">{report.screenshots.map(shot => <figure key={shot.id}>{shot.data_url ? <img src={shot.data_url} alt={`Captured viewport ${shot.viewport}`}/> : <div className="missing-shot">Screenshot file unavailable</div>}<figcaption><strong>{shot.viewport}</strong><span>{shot.url}</span></figcaption></figure>)}{!report.screenshots.length && <div className="empty-panel large"><strong>Screenshots are saved only on the computer that ran the audit.</strong></div>}</section>}
    {tab === 'metrics' && <section className="report-content table-panel"><table><thead><tr><th>Metric</th><th>Value</th><th>Page</th></tr></thead><tbody>{report.metrics.map((metric, index) => <tr key={`${metric.key}-${index}`}><td>{metric.key}</td><td>{metric.value} {metric.unit}</td><td>{metric.url}</td></tr>)}</tbody></table></section>}
    {selected && <aside className="finding-drawer"><div className="drawer-head"><span className={`severity ${selected.severity}`}>{selected.severity}</span><button aria-label="Close finding details" onClick={() => setSelected(null)}><X size={20}/></button></div><h2>{selected.title}</h2><Detail title="Why it matters" value={selected.why_it_matters}/><Detail title="Evidence" value={selected.evidence}/><Detail title="How to reproduce" value={selected.reproduction}/><Detail title="Recommendation" value={selected.recommendation}/>{(selected.element || selected.instances.find(instance => instance.element)?.element) && <button className="primary-btn inspector-btn" onClick={() => void window.gorillaPunch.reports.inspect(selected.affected_url, selected.element || selected.instances.find(instance => instance.element)?.element)}><Eye size={18}/> Inspect element live</button>}</aside>}
  </div>;
}

function Detail({ title, value }: { title: string; value: string }) { return <section className="finding-detail"><h3>{title}</h3><p>{value}</p></section>; }
