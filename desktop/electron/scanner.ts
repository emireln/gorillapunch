import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { DesktopReport, DesktopScan, StartPunchOptions } from '../shared/types';
import type { DesktopDatabase } from './database';
import type { CloudService } from './cloud';

interface Job { scan: DesktopScan; controller: AbortController }

export class ScanManager extends EventEmitter {
  private queue: Job[] = [];
  private active = new Map<string, Job>();
  private paused = false;

  constructor(
    private readonly database: DesktopDatabase,
    private readonly cloud: CloudService,
    private readonly notify: (report: DesktopReport) => void,
  ) { super(); }

  async start(input: string, options: StartPunchOptions) {
    const { normalizeDesktopUrl } = await import('../../src/core/url');
    const targetUrl = normalizeDesktopUrl(input);
    if (options.workspace === 'cloud' && !this.cloud.state().authenticated) throw new Error('Sign in before using the cloud workspace.');
    const now = new Date().toISOString();
    const scan: DesktopScan = {
      id: randomUUID(), owner_id: null, anonymous_session_id: null, project_id: null,
      target_url: targetUrl, mode: options.mode, status: 'queued', stage: this.paused ? 'Queue paused' : 'Waiting for a local browser',
      score: null, pages_scanned: 0, checks_completed: 0, created_at: now, started_at: null, finished_at: null,
      error_code: null, attempts: 0, heartbeat_at: null, storage: options.workspace, cloud_id: null, synced_at: null, sync_error: null,
    };
    await this.database.saveScan(scan);
    this.queue.push({ scan, controller: new AbortController() });
    this.emit('progress', { scan });
    void this.pump();
    return scan;
  }

  async cancel(scanId: string) {
    const queued = this.queue.find(job => job.scan.id === scanId);
    if (queued) {
      this.queue = this.queue.filter(job => job.scan.id !== scanId);
      queued.scan = { ...queued.scan, status: 'cancelled', stage: 'Punch cancelled', error_code: 'CANCELLED', finished_at: new Date().toISOString() };
      await this.database.saveScan(queued.scan);
      this.emit('error', queued.scan);
      return;
    }
    this.active.get(scanId)?.controller.abort();
  }

  async setPaused(paused: boolean) {
    this.paused = paused;
    if (!paused) void this.pump();
    return this.paused;
  }

  isPaused() { return this.paused; }

  async sync(scanId: string) {
    const report = await this.database.report(scanId);
    if (!report) throw new Error('The local report is unavailable.');
    if (report.scan.storage !== 'cloud') throw new Error('Local workspace reports stay on this device. Start the punch in Cloud workspace to sync it.');
    if (report.scan.status !== 'completed') throw new Error('Only completed reports can be synced.');
    const cloudScan = await this.cloud.sync(report);
    const scan: DesktopScan = { ...report.scan, cloud_id: cloudScan.id, synced_at: new Date().toISOString(), sync_error: null };
    const updated = { ...report, scan };
    await this.database.saveScan(scan);
    await this.database.saveReport(updated);
    this.emit('progress', { scan });
    return scan;
  }

  private async pump() {
    if (this.paused) return;
    const settings = await this.database.settings();
    while (this.active.size < settings.concurrency && this.queue.length) {
      const job = this.queue.shift()!;
      this.active.set(job.scan.id, job);
      void this.execute(job).finally(() => {
        this.active.delete(job.scan.id);
        void this.pump();
      });
    }
  }

  private async execute(job: Job) {
    const settings = await this.database.settings();
    const started = new Date().toISOString();
    job.scan = { ...job.scan, status: 'running', stage: 'Warming up the gloves', started_at: started, attempts: job.scan.attempts + 1, heartbeat_at: started };
    await this.database.saveScan(job.scan);
    this.emit('progress', { scan: job.scan });
    try {
      const [{ punch }, { normalizeDesktopUrl }] = await Promise.all([
        import('../../src/worker/crawler'),
        import('../../src/core/url'),
      ]);
      const result = await punch(job.scan.target_url, {
        mode: job.scan.mode,
        maxPages: settings.maxPages,
        maxDepth: settings.maxDepth,
        maxBytes: 8 * 1024 * 1024,
        maxRequests: 180,
        duration: settings.maxDurationSeconds * 1000,
        signal: job.controller.signal,
        normalize: normalizeDesktopUrl,
        allowPrivateNetwork: true,
        progress: async (stage, pages, checks) => {
          if (job.controller.signal.aborted) throw new Error('SCAN_CANCELLED');
          job.scan = { ...job.scan, stage, pages_scanned: pages, checks_completed: checks, heartbeat_at: new Date().toISOString() };
          await this.database.saveScan(job.scan);
          this.emit('progress', { scan: job.scan });
        },
      });
      const finished = new Date().toISOString();
      job.scan = { ...job.scan, status: 'completed', stage: 'Punch complete', score: result.score, pages_scanned: result.pages.length, checks_completed: result.score.completed, finished_at: finished, heartbeat_at: null };
      await this.database.saveScan(job.scan);
      const screenshots = [];
      for (const shot of result.screenshots) screenshots.push(await this.database.saveScreenshot(job.scan.id, shot));
      let report: DesktopReport = {
        scan: job.scan,
        findings: result.findings,
        pages: result.pages,
        metrics: result.metrics,
        resources: result.resources,
        screenshots,
        total: result.findings.length,
        gateFindings: result.findings.filter(finding => finding.severity === 'BLOCKER'),
      };
      await this.database.saveReport(report);
      if (job.scan.storage === 'cloud' && settings.autoSync) {
        try {
          const cloudScan = await this.cloud.sync(report);
          job.scan = { ...job.scan, cloud_id: cloudScan.id, synced_at: new Date().toISOString(), sync_error: null };
        } catch (error) {
          job.scan = { ...job.scan, sync_error: error instanceof Error ? error.message.slice(0, 300) : 'Cloud sync failed.' };
        }
        report = { ...report, scan: job.scan };
        await this.database.saveScan(job.scan);
        await this.database.saveReport(report);
      }
      const hydrated = await this.database.report(job.scan.id) || report;
      this.emit('complete', hydrated);
      this.notify(hydrated);
    } catch (error) {
      const cancelled = job.controller.signal.aborted;
      job.scan = {
        ...job.scan,
        status: cancelled ? 'cancelled' : 'failed',
        stage: cancelled ? 'Punch cancelled' : 'This punch was interrupted',
        error_code: cancelled ? 'CANCELLED' : 'PUNCH_FAILED',
        finished_at: new Date().toISOString(),
        heartbeat_at: null,
        sync_error: cancelled ? null : safeError(error),
      };
      await this.database.saveScan(job.scan);
      this.emit('error', job.scan);
    }
  }
}

function safeError(error: unknown) {
  const value = error instanceof Error ? error.message : 'Unknown error';
  return value.replace(/eyJ[\w.-]+|sb_[\w-]+/g, '[redacted]').slice(0, 300);
}
