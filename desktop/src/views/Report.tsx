import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CaretDown, Check, CloudArrowUp, Copy, DownloadSimple, Eye, MagnifyingGlass, Trash, X } from '@phosphor-icons/react';
import type { DesktopReport, ExportFormat, Finding, WorkspaceMode } from '../../shared/types';
import { Dropdown } from '../components/Dropdown';
import { host, scoreBand } from '../utils';
import { useDesktopI18n, type DesktopMessage } from '../i18n';
import { Tooltip } from '../components/Tooltip';
import { localizeFinding } from '../localization/findings';

const categoryNames: Record<string, DesktopMessage> = { performance: 'report.performance', security: 'report.security', seo: 'report.seo', accessibility: 'report.accessibility', reliability: 'report.reliability', ux: 'report.ux', production: 'report.production' };
const severityNames: Record<string, DesktopMessage> = { BLOCKER: 'report.sevBlocker', CRITICAL: 'report.sevCritical', HIGH: 'report.sevHigh', MEDIUM: 'report.sevMedium', LOW: 'report.sevLow', OPPORTUNITY: 'report.sevOpportunity', PASSED: 'report.sevPassed' };
const verdictNames: Record<string, DesktopMessage> = { 'READY TO LAUNCH': 'verdict.ready', 'ALMOST READY': 'verdict.almost', 'NOT READY': 'verdict.notReady', 'DO NOT LAUNCH': 'verdict.doNotLaunch', 'INSUFFICIENT COVERAGE': 'verdict.insufficient' };

export function ReportView({ report, source, canSync, onBack, onDelete, onSync, notify }: {
  report: DesktopReport;
  source: WorkspaceMode;
  canSync: boolean;
  onBack(): void;
  onDelete(): Promise<void>;
  onSync(): Promise<void>;
  notify(message: string, tone?: 'success' | 'error'): void;
}) {
  const { t, locale } = useDesktopI18n();
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
  const filtered = useMemo(() => report.findings.filter(finding => {
    const localized = localizeFinding(finding, locale);
    return (!severity || finding.severity === severity) && (!query || `${finding.title} ${finding.evidence} ${localized.title} ${localized.evidence} ${finding.check_key}`.toLowerCase().includes(query.toLowerCase()));
  }), [report.findings, severity, query, locale]);
  const categoryLabel = (category: string) => categoryNames[category] ? t(categoryNames[category]) : category;
  const severityLabel = (value: string) => severityNames[value] ? t(severityNames[value]) : value;
  const verdictLabel = (value: string) => verdictNames[value] ? t(verdictNames[value]) : value;
  const exportFile = (format: ExportFormat) => void window.gorillaPunch.reports.export(scan.id, source, format).then(path => { if (path) notify(t('report.savedFile', { path }), 'success'); }).catch(error => notify(error instanceof Error ? error.message : t('report.exportError'), 'error'));
  const copyPrompt = async () => {
    try {
      const count = await window.gorillaPunch.reports.copyPrompt(scan.id, source);
      notify(count ? t(count === 1 ? 'report.copiedPromptSingular' : 'report.copiedPrompt', { count }) : t('report.copiedSummary'));
    } catch (error) { notify(error instanceof Error ? error.message : t('report.copyError'), 'error'); }
  };
  return <div className="report-view">
    <div className="report-toolbar"><button className="secondary-btn" onClick={onBack}><ArrowLeft size={17}/> {t('report.back')}</button><div className="report-url"><strong>{host(scan.target_url)}</strong><span>{scan.target_url}</span></div><div className="toolbar-actions"><button className="primary-btn copy-prompt-btn" onClick={() => void copyPrompt()}><Copy size={18}/> {t('report.copyPrompt')}</button>{source === 'local' && canSync && scan.status === 'completed' && !scan.cloud_id && <button className="secondary-btn" onClick={() => void onSync()}><CloudArrowUp size={17}/> {t('report.sync')}</button>}<details className="export-menu" ref={exportRef}><summary className="secondary-btn"><DownloadSimple size={18}/> {t('report.export')} <CaretDown size={14}/></summary><div className="export-options">{([['pdf', 'PDF'], ['markdown', 'Markdown'], ['json', 'JSON'], ['csv', 'CSV']] as const).map(([format, label]) => <button key={format} onClick={() => { exportRef.current?.removeAttribute('open'); exportFile(format); }}>{label}</button>)}</div></details><Tooltip content={t('report.delete')}><button className="icon-action danger" aria-label={t('report.delete')} onClick={() => void onDelete()}><Trash size={18}/></button></Tooltip></div></div>
    <section className="report-hero"><div className={`score-ring ${score?.verdict === 'ALMOST READY' ? 'warn' : scoreBand(score?.overall)}`}><strong>{score?.overall ?? '—'}</strong><span>/100</span></div><div className="report-verdict"><span className="eyebrow">{t('report.launchGate')}</span><h1>{verdictLabel(score?.verdict || 'INSUFFICIENT COVERAGE')}</h1><p>{score?.launch ? t('report.noBlockers') : score?.verdict === 'INSUFFICIENT COVERAGE' ? t('report.incomplete') : t('report.resolve')}</p><div className="report-summary"><span><b>{score?.blockers || 0}</b> {t('report.blockers')}</span><span><b>{score?.critical || 0}</b> {t('report.critical')}</span><span><b>{highFindings}</b> {t('report.high')}</span><span><b>{score?.coverage || 0}%</b> {t('report.coverage')}</span></div></div><div className="report-origin"><span>{source === 'cloud' ? t('report.savedAccount') : t('report.savedLocal')}</span><strong>{scan.mode === 'quick' ? 'QUICK' : 'FULL'} {t('report.punchMode')}</strong><small>{new Date(scan.created_at).toLocaleString(locale)}</small>{scan.sync_error && <em>{scan.sync_error}</em>}</div></section>
    <section className="category-grid">{Object.entries(score?.categories || {}).map(([category, value]) => <article key={category}><span>{categoryNames[category] ? t(categoryNames[category]) : category}</span><strong>{value}</strong><div><i style={{ width: `${value}%` }}/></div></article>)}</section>
    <div className="report-tabs">{([['findings', t('report.findings'), report.findings.length], ['pages', t('report.pages'), report.pages.length], ['screenshots', t('report.screenshots'), report.screenshots.length], ['metrics', t('report.metrics'), report.metrics.length]] as const).map(([value, label, count]) => <button key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{label} {count}</button>)}</div>
    {tab === 'findings' && <section className="report-content"><div className="finding-filters"><label><MagnifyingGlass size={17}/><input aria-label={t('report.searchLabel')} value={query} onChange={event => setQuery(event.target.value)} placeholder={t('report.search')}/></label><Dropdown<string> className="finding-severity-filter" ariaLabel={t('report.filterSeverity')} value={severity} onChange={setSeverity} options={[{ value: '', label: t('report.allSeverities') }, ...['BLOCKER','CRITICAL','HIGH','MEDIUM','LOW','OPPORTUNITY','PASSED'].map(value => ({ value, label: severityLabel(value) }))]}/></div><div className="desktop-findings">{filtered.map(finding => { const localized = localizeFinding(finding, locale); return <button key={finding.id} onClick={() => setSelected(finding)}><span className={`severity ${finding.severity}`}>{severityLabel(finding.severity)}</span><span><strong>{localized.title}</strong><small>{categoryLabel(finding.category)}</small><p>{localized.evidence}</p></span><Eye size={18}/></button>; })}</div>{!filtered.length && <div className="empty-panel"><Check size={28}/><strong>{t('report.noneMatch')}</strong></div>}</section>}
    {tab === 'pages' && <section className="report-content table-panel"><table><thead><tr><th>{t('report.page')}</th><th>{t('report.status')}</th><th>{t('report.indexable')}</th><th>{t('report.loadTime')}</th></tr></thead><tbody>{report.pages.map(page => <tr key={page.id}><td>{page.url}</td><td>{page.status_code}</td><td>{page.indexable ? t('report.yes') : t('report.no')}</td><td>{Math.round(page.load_time)} ms</td></tr>)}</tbody></table></section>}
    {tab === 'screenshots' && <section className="report-content screenshot-grid">{report.screenshots.map(shot => <figure key={shot.id}>{shot.data_url ? <img src={shot.data_url} alt={t('report.captureAlt', { viewport: shot.viewport })}/> : <div className="missing-shot">{t('report.imageUnavailable')}</div>}<figcaption><strong>{shot.viewport}</strong><span>{shot.url}</span></figcaption></figure>)}{!report.screenshots.length && <div className="empty-panel large"><strong>{t('report.screenshotsLocal')}</strong></div>}</section>}
    {tab === 'metrics' && <section className="report-content table-panel"><table><thead><tr><th>{t('report.metric')}</th><th>{t('report.value')}</th><th>{t('report.page')}</th></tr></thead><tbody>{report.metrics.map((metric, index) => <tr key={`${metric.key}-${index}`}><td>{metric.key}</td><td>{metric.value} {metric.unit}</td><td>{metric.url}</td></tr>)}</tbody></table></section>}
    {selected && (() => { const localized = localizeFinding(selected, locale); return <aside className="finding-drawer"><div className="drawer-head"><span className={`severity ${selected.severity}`}>{severityLabel(selected.severity)}</span><Tooltip content={t('report.closeDetails')}><button aria-label={t('report.closeDetails')} onClick={() => setSelected(null)}><X size={20}/></button></Tooltip></div><h2>{localized.title}</h2><Detail title={t('report.why')} value={localized.why_it_matters}/><Detail title={t('report.evidence')} value={localized.evidence}/><Detail title={t('report.reproduce')} value={localized.reproduction}/><Detail title={t('report.recommendation')} value={localized.recommendation}/></aside>; })()}
  </div>;
}

function Detail({ title, value }: { title: string; value: string }) { return <section className="finding-detail"><h3>{title}</h3><p>{value}</p></section>; }
