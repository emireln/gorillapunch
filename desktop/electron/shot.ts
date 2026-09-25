import { randomUUID } from 'node:crypto';
import type { ShotDeviceSummary, ShotGameMode, ShotProgress, ShotRun, ShotRunSnapshot } from '../shared/types';
import { mergeShotSummaries, readShotSummary, summarizeShotRuns } from '../shared/shot-progress';
import type { DesktopDatabase } from './database';
import type { CloudService } from './cloud';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RUN_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SCORE = 1_000_000_000;

interface ShotCache { syncedAt: string; summaries: ShotDeviceSummary[] }

export class ShotService {
  constructor(private readonly database: DesktopDatabase, private readonly cloud: CloudService) {}

  async progress(): Promise<ShotProgress> {
    const state = this.cloud.state();
    const settings = await this.database.settings();
    const cloudAccount = settings.workspace === 'cloud' && state.authenticated ? state.userId : null;
    const deviceId = await this.database.shotDeviceId();
    const runs = await this.database.shotRuns();
    const local = summarizeShotRuns(deviceId, cloudAccount ? runs.filter(run => run.accountId === null || run.accountId === cloudAccount) : runs);
    if (!cloudAccount) return { ...mergeShotSummaries([local]), sync: 'device', lastSyncedAt: null, syncError: null };
    const cache = await this.readCache(cloudAccount);
    const merged = mergeShotSummaries([...(cache?.summaries || []), local]);
    const ownCloud = cache?.summaries.find(summary => summary.deviceId === deviceId);
    const pending = !ownCloud || ownCloud.updatedAt < local.updatedAt;
    return { ...merged, sync: pending ? 'pending' : 'synced', lastSyncedAt: cache?.syncedAt || null, syncError: null };
  }

  async start(level: number, mode: ShotGameMode = 'campaign'): Promise<ShotRun> {
    if (mode !== 'campaign' && mode !== 'survival') throw new Error('Invalid game mode.');
    const progress = await this.progress();
    const chosen = mode === 'survival' ? 1 : Number.isInteger(level) ? Math.max(1, Math.min(3, level)) : 1;
    if (chosen > progress.stats.highestLevel) throw new Error('Clear the previous sector to unlock this one.');
    const settings = await this.database.settings();
    const state = this.cloud.state();
    const now = new Date().toISOString();
    return this.database.saveShotRun({
      id: randomUUID(),
      accountId: settings.workspace === 'cloud' && state.authenticated ? state.userId : null,
      startedAt: now,
      updatedAt: now,
      finishedAt: null,
      status: 'active',
      mode,
      startingLevel: chosen,
      levelReached: chosen,
      zonesGenerated: 0,
      durationMs: 0,
      score: 0,
      kills: 0,
      systems: 0,
    });
  }

  async checkpoint(runId: string, snapshot: ShotRunSnapshot): Promise<ShotProgress> {
    const current = await this.activeRun(runId);
    const next = { ...current, ...cleanSnapshot(current, snapshot), updatedAt: new Date().toISOString() };
    await this.database.saveShotRun(next);
    return this.maybeSync(next.levelReached > current.levelReached);
  }

  async finish(runId: string, outcome: 'failed' | 'cleared' | 'abandoned', snapshot: ShotRunSnapshot): Promise<ShotProgress> {
    const current = await this.database.shotRun(checkedId(runId));
    if (!current) throw new Error('Game run not found.');
    if (current.status !== 'active') return this.progress();
    if (!['failed', 'cleared', 'abandoned'].includes(outcome)) throw new Error('Invalid game outcome.');
    const now = new Date().toISOString();
    await this.database.saveShotRun({ ...current, ...cleanSnapshot(current, snapshot), status: outcome, updatedAt: now, finishedAt: now });
    return this.maybeSync(true);
  }

  async sync(): Promise<ShotProgress> {
    const state = this.cloud.state();
    const settings = await this.database.settings();
    if (settings.workspace !== 'cloud' || !state.authenticated || !state.userId) throw new Error('Sign in and switch to Cloud workspace to sync Gorilla Shot progress.');
    await this.database.claimAnonymousShotRuns(state.userId);
    const deviceId = await this.database.shotDeviceId();
    const runs = (await this.database.shotRuns()).filter(run => run.accountId === state.userId);
    const local = summarizeShotRuns(deviceId, runs);
    const summaries = await this.cloud.saveShotSummary(local);
    const cache: ShotCache = { syncedAt: new Date().toISOString(), summaries };
    await this.database.setValue(`gorilla_shot_cloud_${state.userId}`, JSON.stringify(cache));
    return { ...mergeShotSummaries(summaries), sync: 'synced', lastSyncedAt: cache.syncedAt, syncError: null };
  }

  private async maybeSync(changed: boolean): Promise<ShotProgress> {
    const settings = await this.database.settings();
    const state = this.cloud.state();
    if (!changed || !settings.autoSync || settings.workspace !== 'cloud' || !state.authenticated) return this.progress();
    try { return await this.sync(); }
    catch (error) {
      const progress = await this.progress();
      return { ...progress, syncError: error instanceof Error ? error.message : 'Game progress could not sync.' };
    }
  }

  private async activeRun(runId: string): Promise<ShotRun> {
    const run = await this.database.shotRun(checkedId(runId));
    if (!run || run.status !== 'active') throw new Error('The game run is no longer active.');
    return run;
  }

  private async readCache(accountId: string): Promise<ShotCache | null> {
    const raw = await this.database.getValue(`gorilla_shot_cloud_${accountId}`);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<ShotCache>;
      if (typeof parsed.syncedAt !== 'string' || !Array.isArray(parsed.summaries)) return null;
      return { syncedAt: parsed.syncedAt, summaries: parsed.summaries.flatMap(item => {
        const summary = readShotSummary(item);
        return summary ? [summary] : [];
      }) };
    } catch { return null; }
  }
}

function checkedId(value: string) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error('Invalid game run identifier.');
  return value;
}

function cleanSnapshot(current: ShotRun, value: ShotRunSnapshot): ShotRunSnapshot {
  if (!value || typeof value !== 'object') throw new Error('Invalid game progress.');
  const number = (candidate: unknown, previous: number, max: number) =>
    typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate >= previous && candidate <= max ? candidate : previous;
  return {
    mode: current.mode,
    levelReached: number(value.levelReached, current.levelReached, 3),
    zonesGenerated: number(value.zonesGenerated, current.zonesGenerated, 1_000_000),
    durationMs: number(value.durationMs, current.durationMs, MAX_RUN_MS),
    score: number(value.score, current.score, MAX_SCORE),
    kills: number(value.kills, current.kills, MAX_SCORE),
    systems: number(value.systems, current.systems, MAX_SCORE),
  };
}
