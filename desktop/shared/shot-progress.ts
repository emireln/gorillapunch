import type { ShotDeviceSummary, ShotRun, ShotRunRecord, ShotStats } from './types';

const MAX_TOTAL = 1_000_000_000_000;
const MAX_RUN_MS = 7 * 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const emptyShotStats = (): ShotStats => ({
  runs: 0,
  clears: 0,
  highestLevel: 1,
  bestScore: 0,
  bestTimeMs: 0,
  totalTimeMs: 0,
  totalKills: 0,
  totalSystems: 0,
});

const bounded = (value: unknown, max = MAX_TOTAL) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? Math.min(value, max) : 0;

const validDate = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 32 && !Number.isNaN(Date.parse(value));

export function summarizeShotRuns(deviceId: string, runs: ShotRun[]): ShotDeviceSummary {
  const stats = emptyShotStats();
  let updatedAt = new Date(0).toISOString();
  for (const run of runs) {
    if (run.updatedAt > updatedAt) updatedAt = run.updatedAt;
    stats.highestLevel = Math.max(stats.highestLevel, run.levelReached);
    if (run.status === 'active') continue;
    stats.runs++;
    if (run.status === 'cleared') stats.clears++;
    stats.bestScore = Math.max(stats.bestScore, run.score);
    stats.bestTimeMs = Math.max(stats.bestTimeMs, run.durationMs);
    stats.totalTimeMs = Math.min(MAX_TOTAL, stats.totalTimeMs + run.durationMs);
    stats.totalKills = Math.min(MAX_TOTAL, stats.totalKills + run.kills);
    stats.totalSystems = Math.min(MAX_TOTAL, stats.totalSystems + run.systems);
  }
  const recentRuns = runs.filter(run => run.status !== 'active')
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 8)
    .map(run => ({ id: run.id, startedAt: run.startedAt, updatedAt: run.updatedAt, finishedAt: run.finishedAt, status: run.status, startingLevel: run.startingLevel, levelReached: run.levelReached, durationMs: run.durationMs, score: run.score, kills: run.kills, systems: run.systems }));
  return { version: 1, deviceId, updatedAt, stats, recentRuns };
}

export function readShotSummary(value: unknown): ShotDeviceSummary | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<ShotDeviceSummary>;
  if (raw.version !== 1 || typeof raw.deviceId !== 'string' || !UUID.test(raw.deviceId) || !validDate(raw.updatedAt)) return null;
  if (!raw.stats || typeof raw.stats !== 'object') return null;
  const stats: ShotStats = {
    runs: bounded(raw.stats.runs),
    clears: bounded(raw.stats.clears),
    highestLevel: Math.max(1, Math.min(3, bounded(raw.stats.highestLevel, 3))),
    bestScore: bounded(raw.stats.bestScore),
    bestTimeMs: bounded(raw.stats.bestTimeMs, MAX_RUN_MS),
    totalTimeMs: bounded(raw.stats.totalTimeMs),
    totalKills: bounded(raw.stats.totalKills),
    totalSystems: bounded(raw.stats.totalSystems),
  };
  const recentRuns: ShotRunRecord[] = [];
  for (const candidate of Array.isArray(raw.recentRuns) ? raw.recentRuns.slice(0, 8) : []) {
    if (!candidate || typeof candidate !== 'object') continue;
    const run = candidate as Partial<ShotRunRecord>;
    if (typeof run.id !== 'string' || !UUID.test(run.id) || !validDate(run.startedAt) || !validDate(run.updatedAt)) continue;
    if (!['failed', 'cleared', 'abandoned'].includes(String(run.status))) continue;
    recentRuns.push({
      id: run.id,
      startedAt: run.startedAt,
      updatedAt: run.updatedAt,
      finishedAt: validDate(run.finishedAt) ? run.finishedAt : null,
      status: run.status as ShotRunRecord['status'],
      startingLevel: Math.max(1, Math.min(3, bounded(run.startingLevel, 3))),
      levelReached: Math.max(1, Math.min(3, bounded(run.levelReached, 3))),
      durationMs: bounded(run.durationMs, MAX_RUN_MS),
      score: bounded(run.score),
      kills: bounded(run.kills),
      systems: bounded(run.systems),
    });
  }
  return { version: 1, deviceId: raw.deviceId, updatedAt: raw.updatedAt, stats, recentRuns };
}

export function mergeShotSummaries(summaries: ShotDeviceSummary[]) {
  const byDevice = new Map<string, ShotDeviceSummary>();
  for (const summary of summaries) {
    const current = byDevice.get(summary.deviceId);
    if (!current || current.updatedAt <= summary.updatedAt) byDevice.set(summary.deviceId, summary);
  }
  const stats = emptyShotStats();
  const runs = new Map<string, ShotRunRecord>();
  for (const summary of byDevice.values()) {
    stats.runs = Math.min(MAX_TOTAL, stats.runs + summary.stats.runs);
    stats.clears = Math.min(MAX_TOTAL, stats.clears + summary.stats.clears);
    stats.highestLevel = Math.max(stats.highestLevel, summary.stats.highestLevel);
    stats.bestScore = Math.max(stats.bestScore, summary.stats.bestScore);
    stats.bestTimeMs = Math.max(stats.bestTimeMs, summary.stats.bestTimeMs);
    stats.totalTimeMs = Math.min(MAX_TOTAL, stats.totalTimeMs + summary.stats.totalTimeMs);
    stats.totalKills = Math.min(MAX_TOTAL, stats.totalKills + summary.stats.totalKills);
    stats.totalSystems = Math.min(MAX_TOTAL, stats.totalSystems + summary.stats.totalSystems);
    for (const run of summary.recentRuns) runs.set(run.id, run);
  }
  return {
    stats,
    recentRuns: [...runs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 8),
  };
}
