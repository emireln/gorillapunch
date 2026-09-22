import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { assertProductionReady, env } from '../server/env';
import { log } from '../server/errors';
import { claimJob, updateJob, event } from './queue';
import { punch } from './crawler';
import { fixtureTransport } from './fixtures';
import { saveResult } from './persist';
import { heartbeat as announceWorker, maintenance } from './maintenance';
assertProductionReady('worker');
const config = env(), processId = randomUUID();
// SQLite only supports one writer at a time. Production uses Postgres and can
// safely honor the configured worker concurrency.
const concurrency = config.APP_MODE === 'local' ? 1 : config.WORKER_CONCURRENCY;
const shutdown = new AbortController();
process.on('SIGTERM', () => shutdown.abort()); process.on('SIGINT', () => shutdown.abort());
async function consume(slot: number) {
  while (!shutdown.signal.aborted) {
    // Each claim has a distinct lease, even when the same process recovers a job.
    const workerId = randomUUID();
    try {
      const scan = await claimJob(workerId);
      if (!scan) { await delay(1200, undefined, { signal: shutdown.signal }).catch(() => {}); continue; }
      log('punch_started', { scan_id: scan.id, worker: workerId, slot });
      const cancelled = new AbortController();
      let heartbeatBusy = false;
      const heartbeat = setInterval(() => { if (heartbeatBusy) return; heartbeatBusy = true; void updateJob(scan.id, workerId, { heartbeat_at: new Date().toISOString() }).then(ok => { if (!ok) cancelled.abort(); }).catch(() => cancelled.abort()).finally(() => { heartbeatBusy = false; }); }, 10000);
      try {
        const result = await punch(scan.target_url, { mode: scan.mode, maxPages: config.MAX_PAGES, maxDepth: config.MAX_DEPTH, maxBytes: config.MAX_RESPONSE_BYTES, maxRequests: config.MAX_REQUESTS_PER_HOST, duration: config.MAX_SCAN_DURATION_MS, signal: AbortSignal.any([shutdown.signal, cancelled.signal]), transport: config.APP_MODE === 'local' ? fixtureTransport(scan.target_url) : undefined,
          progress: async (stage, pages, checks) => { const ok = await updateJob(scan.id, workerId, { stage, pages_scanned: pages, checks_completed: checks, heartbeat_at: new Date().toISOString() }); if (!ok) throw new Error('SCAN_CANCELLED'); await event(scan.id, stage, checks); },
        });
        if (!await updateJob(scan.id, workerId, { stage: 'Saving the Punch Report' })) continue;
        if (!await saveResult(scan, workerId, result)) continue;
        log('punch_completed', { scan_id: scan.id, coverage: result.score.coverage, duration_ms: Date.now() - Date.parse(scan.started_at || scan.created_at) });
      } catch (error) { await updateJob(scan.id, workerId, { status: 'failed', stage: 'This punch was interrupted', error_code: shutdown.signal.aborted ? 'WORKER_STOPPED' : 'PUNCH_FAILED', finished_at: new Date().toISOString() }); log('punch_failed', { scan_id: scan.id, error: error instanceof Error ? error.message : 'Unknown error' }); }
      finally { clearInterval(heartbeat); }
    } catch (error) { log('worker_error', { worker: workerId, error: error instanceof Error ? error.message : 'Unknown error' }); await delay(5000); }
  }
}
async function housekeeping() {
  let tick = 0;
  while (!shutdown.signal.aborted) {
    try { await announceWorker(processId); if (tick++ % 30 === 0) await maintenance(); }
    catch (error) { log('maintenance_failed', { error: error instanceof Error ? error.message : 'Unknown error' }); }
    await delay(10000, undefined, { signal: shutdown.signal }).catch(() => {});
  }
}
log('worker_online', { worker: processId, concurrency, mode: config.APP_MODE });
await Promise.all([housekeeping(), ...Array.from({ length: concurrency }, (_, i) => consume(i))]);
