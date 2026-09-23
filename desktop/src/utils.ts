import type { DesktopScan, WorkspaceMode } from '../shared/types';

export interface ScanItem { scan: DesktopScan; source: WorkspaceMode }

export function host(value: string) {
  try { return new URL(value).host; } catch { return value; }
}

export function relativeDate(value: string) {
  const delta = Date.now() - Date.parse(value);
  if (delta < 60_000) return 'Just now';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  if (delta < 604_800_000) return `${Math.floor(delta / 86_400_000)}d ago`;
  return new Date(value).toLocaleDateString();
}

export function statusLabel(scan: DesktopScan) {
  if (scan.status === 'completed') return scan.score?.verdict || 'Complete';
  if (scan.status === 'running') return scan.stage;
  if (scan.status === 'queued') return 'Queued';
  if (scan.status === 'cancelled') return 'Cancelled';
  return 'Failed';
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
