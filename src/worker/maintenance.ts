import { adminDb } from '../server/db';
import { env } from '../server/env';

export async function heartbeat(workerId: string) {
  if (env().APP_MODE !== 'supabase') return;
  const { error } = await adminDb().from('worker_heartbeats').upsert({ id: workerId, seen_at: new Date().toISOString() });
  if (error) throw new Error(`Worker heartbeat failed (${error.code})`);
}
export async function maintenance() {
  if (env().APP_MODE !== 'supabase') return;
  const db = adminDb(), cutoff = new Date(Date.now() - env().ANONYMOUS_RETENTION_DAYS * 86400000).toISOString();
  const expired = await db.from('scans').select('id').is('owner_id', null).lt('created_at', cutoff).limit(100);
  if (expired.error) throw new Error('Retention query failed');
  if (expired.data?.length) { const { error } = await db.from('scans').delete().in('id', expired.data.map(s => s.id)); if (error) throw new Error('Retention deletion failed'); }
  const tasks = await db.from('artifact_deletions').select('scan_id').lt('not_before', new Date().toISOString()).limit(100);
  if (tasks.error) throw new Error('Artifact cleanup query failed');
  for (const task of tasks.data || []) {
    let complete = false;
    // Flat, UUID-scoped prefixes only. A bounded batch leaves remaining files queued.
    for (let batch = 0; batch < 10; batch++) {
      const objects = await db.storage.from('scan-artifacts').list(task.scan_id, { limit: 100 });
      if (objects.error) throw new Error('Artifact listing failed');
      if (!objects.data.length) { complete = true; break; }
      const removed = await db.storage.from('scan-artifacts').remove(objects.data.map(o => `${task.scan_id}/${o.name}`));
      if (removed.error) throw new Error('Artifact removal failed');
    }
    if (complete) { const { error } = await db.from('artifact_deletions').delete().eq('scan_id', task.scan_id); if (error) throw new Error('Artifact cleanup completion failed'); }
  }
  const old = new Date(Date.now() - 86400000).toISOString();
  const { error } = await db.from('worker_heartbeats').delete().lt('seen_at', old);
  if (error) throw new Error('Heartbeat retention failed');
  const usageCutoff = new Date(Date.now() - 400 * 86400000).toISOString();
  const [anonymous, quotas] = await Promise.all([
    db.from('anonymous_scan_usage').delete().lt('created_at', usageCutoff),
    db.from('quota_usage').delete().lt('created_at', usageCutoff),
  ]);
  if (anonymous.error || quotas.error) throw new Error('Usage retention failed');
}
