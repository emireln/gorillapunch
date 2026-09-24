import { safeStorage } from 'electron';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { DesktopReport, DesktopScan, CloudCredentials, CloudState, ShotDeviceSummary, SignUpCredentials } from '../shared/types';
import type { DesktopDatabase } from './database';
import { readShotSummary } from '../shared/shot-progress';

const SESSION_KEY = 'cloud_session_v1';
const SHOT_METADATA_PREFIX = 'gorilla_shot_v1_';
const SHOT_PROGRESS_TABLE = 'gorilla_shot_progress';
const DEFAULT_SUPABASE_URL = 'https://siuktrgrqxjrecvoqdek.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpdWt0cmdycXhqcmVjdm9xZGVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0MjgyNzUsImV4cCI6MjEwNTAwNDI3NX0.x3_ySfCdDAezadpABVFzoVSfktFSqCfE92qJdDtNE9I';
const DEFAULT_API_URL = 'https://www.gorillapunch.run';

function resolveCloudTarget(): { url: string; anonKey: string; apiUrl: string } {
  const urlCandidate = (typeof __GP_SUPABASE_URL__ === 'string' && __GP_SUPABASE_URL__)
    || process.env.VITE_GP_SUPABASE_URL
    || process.env.NEXT_PUBLIC_SUPABASE_URL
    || DEFAULT_SUPABASE_URL;

  const keyCandidate = (typeof __GP_SUPABASE_ANON_KEY__ === 'string' && __GP_SUPABASE_ANON_KEY__)
    || process.env.VITE_GP_SUPABASE_ANON_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || DEFAULT_SUPABASE_ANON_KEY;

  const apiCandidate = (typeof __GP_API_URL__ === 'string' && __GP_API_URL__)
    || process.env.VITE_GP_API_URL
    || process.env.APP_URL
    || DEFAULT_API_URL;

  return {
    url: validCloudConfig(urlCandidate, keyCandidate) ? urlCandidate : '',
    anonKey: validCloudConfig(urlCandidate, keyCandidate) ? keyCandidate : '',
    apiUrl: safeApiUrl(apiCandidate),
  };
}

export class CloudService {
  private client: SupabaseClient | null = null;
  private currentSession: Session | null = null;
  private avatarDataUrl: string | null = null;
  private readonly apiUrl: string;

  constructor(private readonly database: DesktopDatabase) {
    const config = resolveCloudTarget();
    this.apiUrl = config.apiUrl;
    if (config.url && config.anonKey) {
      this.client = createClient(config.url, config.anonKey, {
        auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
        global: { headers: { 'X-Client-Info': 'gorillapunch-desktop/1.0' } },
      });
      this.client.auth.onAuthStateChange((_event, session) => {
        this.currentSession = session;
        void this.persistSession(session);
      });
    }
  }

  async initialize() {
    return this.restoreSession();
  }

  async restoreSession(): Promise<CloudState> {
    if (!this.client || !safeStorage.isEncryptionAvailable() || this.currentSession) return this.state();
    const encrypted = await this.database.getValue(SESSION_KEY);
    if (!encrypted) return this.state();
    let saved: { access_token: string; refresh_token: string };
    try {
      const parsed = JSON.parse(safeStorage.decryptString(Buffer.from(encrypted, 'base64'))) as Partial<typeof saved>;
      if (typeof parsed.access_token !== 'string' || typeof parsed.refresh_token !== 'string') throw new Error('Invalid saved session.');
      saved = { access_token: parsed.access_token, refresh_token: parsed.refresh_token };
    } catch {
      await this.database.removeValue(SESSION_KEY);
      return this.state();
    }
    try {
      const { data, error } = await this.client.auth.setSession(saved);
      if (error) {
        if (isExpiredRefreshSession(error)) await this.database.removeValue(SESSION_KEY);
        return this.state();
      }
      if (!data.session) {
        await this.database.removeValue(SESSION_KEY);
        return this.state();
      }
      this.currentSession = data.session;
      try { await this.loadAvatar(); } catch { this.avatarDataUrl = null; }
    } catch { /* Keep the encrypted refresh token so a temporary network failure can be retried later. */ }
    return this.state();
  }

  state(): CloudState {
    return {
      configured: !!this.client,
      authenticated: !!this.currentSession?.user,
      email: this.currentSession?.user.email || null,
      userId: this.currentSession?.user.id || null,
      apiUrl: this.apiUrl,
      avatarDataUrl: this.currentSession?.user ? this.avatarDataUrl : null,
    };
  }

  async signIn(credentials: CloudCredentials) {
    const client = this.requireClient();
    const { data, error } = await client.auth.signInWithPassword({ email: credentials.email.trim().toLowerCase(), password: credentials.password });
    if (error || !data.session) throw new Error(error ? authErrorMessage(error, 'sign-in') : 'We could not sign in. Please try again.');
    this.currentSession = data.session;
    await this.loadAvatar();
    await this.persistSession(data.session);
    return this.state();
  }

  async signUp(credentials: SignUpCredentials) {
    const client = this.requireClient();
    const { data, error } = await client.auth.signUp({
      email: credentials.email.trim().toLowerCase(),
      password: credentials.password,
      options: { data: { display_name: credentials.displayName.trim().slice(0, 80) }, emailRedirectTo: `${this.apiUrl}/auth/callback` },
    });
    if (error) throw new Error(authErrorMessage(error, 'sign-up'));
    this.currentSession = data.session;
    if (data.session) await this.loadAvatar();
    if (data.session) await this.persistSession(data.session);
    return { state: this.state(), needsEmailConfirmation: !data.session };
  }

  async signOut() {
    if (this.client) await this.client.auth.signOut({ scope: 'local' });
    this.currentSession = null;
    this.avatarDataUrl = null;
    await this.database.removeValue(SESSION_KEY);
    return this.state();
  }

  async history(): Promise<DesktopScan[]> {
    const client = await this.authenticatedClient();
    const { data, error } = await client.from('scans').select('*').order('created_at', { ascending: false }).limit(500);
    if (error) throw new Error('Your account reports could not be loaded. Please try again.');
    return (data || []).map(row => cloudScan(row as DesktopScan));
  }

  async report(scanId: string): Promise<DesktopReport | null> {
    const client = await this.authenticatedClient();
    const [scanResult, findingsResult, pagesResult, metricsResult, resourcesResult] = await Promise.all([
      client.from('scans').select('*').eq('id', scanId).maybeSingle(),
      client.from('scan_findings').select('*').eq('scan_id', scanId).order('created_at'),
      client.from('scan_pages').select('*').eq('scan_id', scanId).order('created_at'),
      client.from('scan_metrics').select('*').eq('scan_id', scanId).order('created_at'),
      client.from('scan_resources').select('url,status,bytes,duration,type').eq('scan_id', scanId).order('created_at'),
    ]);
    const error = scanResult.error || findingsResult.error || pagesResult.error || metricsResult.error || resourcesResult.error;
    if (error) throw new Error('This report could not be loaded. Please try again.');
    if (!scanResult.data) return null;
    const findings = (findingsResult.data || []) as DesktopReport['findings'];
    return {
      scan: cloudScan(scanResult.data as DesktopScan),
      findings,
      pages: (pagesResult.data || []) as DesktopReport['pages'],
      metrics: (metricsResult.data || []) as DesktopReport['metrics'],
      resources: (resourcesResult.data || []) as DesktopReport['resources'],
      screenshots: [],
      total: findings.length,
      gateFindings: findings.filter(finding => finding.severity === 'BLOCKER'),
    };
  }

  async sync(report: DesktopReport): Promise<DesktopScan> {
    const client = await this.authenticatedClient();
    const payload = {
      local_scan_id: report.scan.id,
      target_url: report.scan.target_url,
      mode: report.scan.mode,
      score: report.scan.score,
      findings: report.findings.slice(0, 1000),
      pages: report.pages.slice(0, 100),
      metrics: report.metrics.slice(0, 1000),
      resources: report.resources.slice(0, 5000),
    };
    const { data, error } = await client.rpc('sync_desktop_punch', { payload });
    if (error) {
      if (error.code === 'PGRST202') throw new Error('Cloud report sync is not enabled on this server yet. Apply the desktop report migration and try again.');
      throw new Error(`Report sync failed: ${safeCloudError(error.message)}`);
    }
    return cloudScan(data as DesktopScan);
  }

  async remove(scanId: string) {
    const client = await this.authenticatedClient();
    const { data, error } = await client.rpc('delete_owned_punch', { scan_uuid: scanId });
    if (error) throw new Error('This report could not be deleted. Please try again.');
    if (!data) throw new Error('This report is no longer available.');
  }

  async updateFinding(findingId: string, status: 'open' | 'resolved' | 'ignored') {
    const client = await this.authenticatedClient();
    const { data, error } = await client.rpc('update_owned_finding', { finding_uuid: findingId, next_status: status });
    if (error || !data) throw new Error('This finding could not be updated. Please try again.');
  }

  async saveAvatar(webpBase64: string | null): Promise<CloudState> {
    const client = await this.authenticatedClient();
    const userId = this.currentSession?.user.id;
    if (!userId) throw new Error('Sign in to change your profile picture.');
    if (webpBase64 !== null) {
      if (webpBase64.length > 65536 || !/^[A-Za-z0-9+/]+={0,2}$/.test(webpBase64)) throw new Error('Choose a smaller profile picture.');
      const bytes = Buffer.from(webpBase64, 'base64');
      if (bytes.length > 49152 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') throw new Error('The profile picture must be a compressed WebP image.');
    }
    const { error } = await client.from('profiles').update({ avatar_webp: webpBase64 }).eq('id', userId);
    if (error) throw new Error(['42703', 'PGRST204'].includes(error.code) ? 'Profile pictures are not enabled on this server yet. Apply the profile migration and try again.' : `Could not save profile picture: ${safeCloudError(error.message)}`);
    this.avatarDataUrl = webpBase64 ? `data:image/webp;base64,${webpBase64}` : null;
    return this.state();
  }

  async shotSummaries(): Promise<ShotDeviceSummary[]> {
    const client = await this.authenticatedClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw new Error('Game progress could not be loaded from your account.');
    return this.loadShotSummaries(client, data.user.id, data.user.user_metadata);
  }

  async saveShotSummary(summary: ShotDeviceSummary): Promise<ShotDeviceSummary[]> {
    const client = await this.authenticatedClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw new Error('Sign in to sync Gorilla Shot progress.');
    const existing = await this.loadShotSummaries(client, data.user.id, data.user.user_metadata);
    const previous = existing.find(item => item.deviceId === summary.deviceId);
    const latest = previous && previous.updatedAt > summary.updatedAt ? previous : summary;
    await this.writeShotSummary(client, data.user.id, latest);
    return this.loadShotSummaries(client, data.user.id, data.user.user_metadata);
  }

  private async loadShotSummaries(client: SupabaseClient, userId: string, metadata: Record<string, unknown> | null): Promise<ShotDeviceSummary[]> {
    const { data, error } = await client.from(SHOT_PROGRESS_TABLE)
      .select('device_id,version,updated_at,stats,recent_runs')
      .eq('owner_id', userId);
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') throw new Error('Gorilla Shot cloud storage is not set up yet. Apply migration 202609240001_gorilla_shot_progress.sql.');
      throw new Error(`Game progress could not be loaded: ${safeCloudError(error.message)}`);
    }
    const saved = (data || []).flatMap(row => {
      const summary = readShotSummary({
        version: row.version,
        deviceId: row.device_id,
        updatedAt: row.updated_at,
        stats: row.stats,
        recentRuns: row.recent_runs,
      });
      return summary ? [summary] : [];
    });
    const byDevice = new Map(saved.map(summary => [summary.deviceId, summary]));
    // Import summaries written by earlier desktop versions to auth metadata.
    for (const legacy of readShotMetadata(metadata)) {
      const current = byDevice.get(legacy.deviceId);
      if (!current || current.updatedAt < legacy.updatedAt) {
        await this.writeShotSummary(client, userId, legacy);
        byDevice.set(legacy.deviceId, legacy);
      }
    }
    return [...byDevice.values()];
  }

  private async writeShotSummary(client: SupabaseClient, userId: string, summary: ShotDeviceSummary) {
    const { error } = await client.from(SHOT_PROGRESS_TABLE).upsert({
      owner_id: userId,
      device_id: summary.deviceId,
      version: summary.version,
      updated_at: summary.updatedAt,
      stats: summary.stats,
      recent_runs: summary.recentRuns,
    }, { onConflict: 'owner_id,device_id' });
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') throw new Error('Gorilla Shot cloud storage is not set up yet. Apply migration 202609240001_gorilla_shot_progress.sql.');
      throw new Error(`Game progress sync failed: ${safeCloudError(error.message)}`);
    }
  }

  private async loadAvatar() {
    this.avatarDataUrl = null;
    const userId = this.currentSession?.user.id;
    if (!userId || !this.client) return;
    const { data } = await this.client.from('profiles').select('avatar_webp').eq('id', userId).maybeSingle();
    if (typeof data?.avatar_webp === 'string' && data.avatar_webp.length <= 65536) this.avatarDataUrl = `data:image/webp;base64,${data.avatar_webp}`;
  }

  private requireClient() {
    if (!this.client) throw new Error('Cloud sync is unavailable right now. Try again later or contact support.');
    return this.client;
  }

  private async authenticatedClient() {
    const client = this.requireClient();
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) throw new Error('Sign in to sync reports.');
    this.currentSession = data.session;
    return client;
  }

  private async persistSession(session: Session | null) {
    if (!session) { await this.database.removeValue(SESSION_KEY); return; }
    if (!safeStorage.isEncryptionAvailable()) return;
    const value = JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token });
    await this.database.setValue(SESSION_KEY, safeStorage.encryptString(value).toString('base64'));
  }
}

function readShotMetadata(metadata: Record<string, unknown> | null | undefined): ShotDeviceSummary[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const summaries: ShotDeviceSummary[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (!key.startsWith(SHOT_METADATA_PREFIX)) continue;
    const summary = readShotSummary(value);
    if (summary && key === `${SHOT_METADATA_PREFIX}${summary.deviceId.replaceAll('-', '')}`) summaries.push(summary);
    if (summaries.length >= 64) break;
  }
  return summaries;
}

function isExpiredRefreshSession(error: { message?: string; code?: string }) {
  return error.code === 'refresh_token_not_found'
    || /invalid_grant|invalid refresh token|refresh token (?:not found|expired|invalid)/i.test(error.message || '');
}

function authErrorMessage(error: { message: string; status?: number }, action: 'sign-in' | 'sign-up') {
  const message = error.message.toLowerCase();
  if (error.status === 429 || message.includes('rate limit') || message.includes('too many requests')) {
    return 'Too many attempts. Wait a moment and try again.';
  }
  if (/fetch|network|timeout|connection/.test(message)) {
    return 'We could not reach your account right now. Check your connection and try again.';
  }
  if (action === 'sign-in') return 'Email or password is incorrect. Please try again.';
  if (/already registered|already exists|user exists/.test(message)) {
    return 'An account with this email already exists. Sign in instead.';
  }
  if (/invalid.*email|email.*invalid/.test(message)) return 'Enter a valid email address.';
  if (message.includes('password')) return 'Choose a stronger password and try again.';
  return 'We could not create your account. Please try again.';
}

function cloudScan(scan: DesktopScan): DesktopScan {
  return { ...scan, storage: 'cloud', cloud_id: scan.id, synced_at: scan.finished_at || scan.created_at, sync_error: null };
}

function safeCloudError(message: string) {
  return message.replace(/eyJ[\w.-]+|sb_[\w-]+/g, '[redacted]').slice(0, 180);
}

function validCloudConfig(url: string, key: string) {
  try { return new URL(url).protocol === 'https:' && key.length > 20; }
  catch { return false; }
}

function safeApiUrl(value: string) {
  try { const url = new URL(value); return url.protocol === 'https:' || url.hostname === 'localhost' ? url.origin : 'https://gorillapunch.run'; }
  catch { return 'https://gorillapunch.run'; }
}
