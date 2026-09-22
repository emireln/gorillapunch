import { randomUUID } from 'node:crypto';
import type { Scan } from '../core/types';
import { adminDb, localDb, one, put } from '../server/db';
import { env } from '../server/env';
import { localReturnCredits } from '../server/credits';
export async function claimJob(workerId: string): Promise<Scan | null> {
  if (env().APP_MODE === 'supabase') {
    const { data, error } = await adminDb().rpc('claim_punch', { worker: workerId }); if (error) throw new Error(`Queue claim failed (${error.code})`); return data as Scan | null;
  }
  const db = await (await localDb()).transaction('write'); const now = new Date().toISOString(), stale = new Date(Date.now() - 60000).toISOString();
  try {
  // A dead worker's lease expires. Attempts are bounded and terminal failures remain visible.
  const recovered = await db.execute({ sql: `UPDATE records SET body=json_set(body,'$.status',CASE WHEN json_extract(body,'$.attempts')<3 THEN 'queued' ELSE 'failed' END,'$.stage','Worker interrupted; recovering','$.error_code','WORKER_INTERRUPTED') WHERE kind='scans' AND json_extract(body,'$.status')='running' AND json_extract(body,'$.heartbeat_at')<? RETURNING body`, args: [stale] });
  for (const row of recovered.rows) { const scan = JSON.parse(String(row.body)) as Scan; if (scan.status === 'failed') await localReturnCredits(db, scan); }
  const result = await db.execute({ sql: `UPDATE records SET body=json_set(body,'$.status','running','$.stage','Warming up the gloves','$.started_at',?,'$.heartbeat_at',?,'$.worker_id',?,'$.attempts',json_extract(body,'$.attempts')+1) WHERE kind='scans' AND id=(SELECT q.id FROM records q WHERE q.kind='scans' AND json_extract(q.body,'$.status')='queued' AND NOT EXISTS(SELECT 1 FROM records busy WHERE busy.kind='scans' AND json_extract(busy.body,'$.status')='running' AND json_extract(busy.body,'$.hostname')=json_extract(q.body,'$.hostname')) ORDER BY json_extract(q.body,'$.created_at') LIMIT 1) RETURNING body`, args: [now, now, workerId] });
  await db.commit(); return result.rows.length ? JSON.parse(String(result.rows[0].body)) as Scan : null;
  } finally { db.close(); }
}
export async function updateJob(id: string, workerId: string, patch: Partial<Scan>) {
  if (env().APP_MODE === 'supabase') { const { data, error } = await adminDb().from('scans').update(patch).eq('id', id).eq('worker_id', workerId).eq('status', 'running').select('id'); if (error) throw new Error(`Queue update failed (${error.code})`); return !!data?.length; }
  const tx = await (await localDb()).transaction('write');
  try {
    const result = await tx.execute({ sql: `UPDATE records SET body=json_patch(body,?) WHERE kind='scans' AND id=? AND json_extract(body,'$.worker_id')=? AND json_extract(body,'$.status')='running' RETURNING body`, args: [JSON.stringify(patch), id, workerId] });
    if (result.rows.length && (patch.status === 'failed' || patch.status === 'cancelled' || (patch.status === 'completed' && patch.score?.verdict === 'INSUFFICIENT COVERAGE'))) await localReturnCredits(tx, JSON.parse(String(result.rows[0].body)) as Scan);
    await tx.commit(); return !!result.rows.length;
  } finally { tx.close(); }
}
export async function event(scanId: string, stage: string, completed: number) {
  if (await one('scans', { id: scanId })) await put('scan_events', { id: randomUUID(), scan_id: scanId, stage, checks_completed: completed, created_at: new Date().toISOString() });
}
