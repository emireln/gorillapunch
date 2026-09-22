import { randomUUID } from 'node:crypto';
import type { Scan } from '../core/types';
import { adminDb, localDb } from '../server/db';
import { env } from '../server/env';
import { localReturnCredits } from '../server/credits';
import type { punch } from './crawler';

export async function saveResult(scan: Scan, worker: string, result: Awaited<ReturnType<typeof punch>>) {
  const created_at = new Date().toISOString();
  const rows: Record<string, { id: string; [key: string]: unknown }[]> = {
    scan_findings: result.findings.map(f => ({ ...f })),
    scan_pages: result.pages.map(p => ({ ...p, created_at })),
    scan_metrics: result.metrics.map(m => ({ ...m, id: randomUUID(), created_at })),
    scan_resources: result.resources.slice(0, 500).map(r => ({ ...r, id: randomUUID(), created_at })),
    scan_categories: Object.entries(result.score.categories).map(([category, score]) => ({ id: randomUUID(), category, score, created_at })),
    scan_screenshots: [],
  };
  if (env().APP_MODE === 'supabase') {
    const db = adminDb(), uploaded: string[] = [];
    try {
      for (const shot of result.screenshots) {
        const id = randomUUID(), path = `${scan.id}/${id}.jpg`;
        const { error } = await db.storage.from('scan-artifacts').upload(path, shot.bytes, { contentType: 'image/jpeg' });
        if (error) throw new Error('Screenshot persistence failed');
        uploaded.push(path); rows.scan_screenshots.push({ id, path, viewport: shot.viewport, url: shot.url, created_at });
      }
      const { data, error } = await db.rpc('complete_punch', { scan_uuid: scan.id, worker, result: { ...rows, score: result.score } });
      if (error) throw new Error(`Report persistence failed (${error.code})`);
      if (!data && uploaded.length) await db.storage.from('scan-artifacts').remove(uploaded);
      return !!data;
    } catch (error) {
      // A response can be lost after DB commit. Do not delete possibly committed
      // screenshots; deletion/retention cleanup handles abandoned attempts later.
      throw error;
    }
  }
  const tx = await (await localDb()).transaction('write');
  try {
    const existing = await tx.execute({ sql: "SELECT body FROM records WHERE kind='scans' AND id=? AND json_extract(body,'$.status')='running' AND json_extract(body,'$.worker_id')=?", args: [scan.id, worker] });
    if (!existing.rows.length) { await tx.rollback(); return false; }
    for (const [table, values] of Object.entries(rows)) {
      await tx.execute({ sql: "DELETE FROM records WHERE kind=? AND json_extract(body,'$.scan_id')=?", args: [table, scan.id] });
      for (const row of values) await tx.execute({ sql: 'INSERT INTO records(kind,id,body) VALUES(?,?,?)', args: [table, row.id, JSON.stringify({ ...row, scan_id: scan.id })] });
    }
    const completed: Scan = { ...JSON.parse(String(existing.rows[0].body)), status: 'completed', stage: 'Punch complete', score: result.score, pages_scanned: result.pages.length, checks_completed: result.score.completed, finished_at: created_at, error_code: null };
    await tx.execute({ sql: "UPDATE records SET body=? WHERE kind='scans' AND id=?", args: [JSON.stringify(completed), scan.id] });
    if (result.score.verdict === 'INSUFFICIENT COVERAGE') await localReturnCredits(tx, completed);
    await tx.commit(); return true;
  } finally { tx.close(); }
}
