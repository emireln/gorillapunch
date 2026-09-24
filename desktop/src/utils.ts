import type { DesktopScan, WorkspaceMode } from '../shared/types';
import { translate, type DesktopLocale, type Translate } from './i18n';

export interface ScanItem { scan: DesktopScan; source: WorkspaceMode }

export function host(value: string) {
  try { return new URL(value).host; } catch { return value; }
}

export function relativeDate(value: string, locale: DesktopLocale = 'en') {
  const delta = Date.now() - Date.parse(value);
  if (delta < 60_000) return translate(locale, 'misc.justNow');
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  if (delta < 3_600_000) return formatter.format(-Math.floor(delta / 60_000), 'minute');
  if (delta < 86_400_000) return formatter.format(-Math.floor(delta / 3_600_000), 'hour');
  if (delta < 604_800_000) return formatter.format(-Math.floor(delta / 86_400_000), 'day');
  return new Date(value).toLocaleDateString(locale);
}

export function statusLabel(scan: DesktopScan, locale: DesktopLocale = 'en', t?: Translate) {
  const text = t || ((key: Parameters<Translate>[0]) => translate(locale, key));
  if (scan.status === 'completed') {
    const verdict = scan.score?.verdict;
    if (verdict === 'READY TO LAUNCH') return text('verdict.ready');
    if (verdict === 'ALMOST READY') return text('verdict.almost');
    if (verdict === 'NOT READY') return text('verdict.notReady');
    if (verdict === 'DO NOT LAUNCH') return text('verdict.doNotLaunch');
    if (verdict === 'INSUFFICIENT COVERAGE') return text('verdict.insufficient');
    return verdict || text('misc.complete');
  }
  if (scan.status === 'running') return stageLabel(scan.stage, text);
  if (scan.status === 'queued') return text('misc.queued');
  if (scan.status === 'cancelled') return text('misc.cancelled');
  return text('misc.failed');
}

function stageLabel(stage: string, t: Translate) {
  const labels: Record<string, Parameters<Translate>[0]> = {
    'Resolving domain': 'stage.resolving', 'Opening application': 'stage.opening', 'Reading response headers': 'stage.headers', 'Inspecting browser runtime': 'stage.runtime', 'Walking internal links': 'stage.links', 'Calculating the damage': 'stage.damage', 'Saving the Punch Report': 'stage.saving', 'Punch complete': 'stage.complete', 'Punch cancelled': 'stage.cancelled', 'This punch was interrupted': 'stage.interrupted', 'Desktop app closed before this punch completed': 'stage.closed', 'Queue paused': 'stage.queuePaused', 'Waiting for a local browser': 'stage.waitingBrowser', 'Warming up the gloves': 'stage.warming',
  };
  return labels[stage] ? t(labels[stage]) : stage;
}

export function scoreBand(value: number | null | undefined) {
  return value === null || value === undefined ? 'neutral' : value >= 90 ? 'good' : value >= 70 ? 'warn' : 'bad';
}

export function errorMessage(error: unknown) {
  const raw = typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
        ? error.message
        : '';
  const message = raw.replace(/^Error invoking remote method '[^']+': Error: /, '').trim();
  return (message || 'Something went wrong.').slice(0, 360);
}
