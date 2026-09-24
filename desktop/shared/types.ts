import type { Finding, Metric, PageRecord, Report, Scan, ScanMode } from '../../src/core/types';

export type WorkspaceMode = 'local' | 'cloud';
export type DesktopTheme = 'system' | 'dark' | 'light';
export type DesktopLocalePreference = 'auto' | 'en' | 'pt-BR';

export type DesktopUpdateState =
  | { status: 'idle' | 'current' }
  | { status: 'available' | 'downloaded'; version: string }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'error'; version?: string };

export interface DesktopScan extends Scan {
  storage: WorkspaceMode;
  cloud_id: string | null;
  synced_at: string | null;
  sync_error: string | null;
}

export interface ScanResource {
  url: string;
  status: number;
  bytes: number;
  duration: number;
  type: string;
}

export interface DesktopScreenshot {
  id: string;
  scan_id: string;
  url: string;
  viewport: string;
  path: string;
  data_url?: string;
}

export interface DesktopReport extends Omit<Report, 'scan'> {
  scan: DesktopScan;
  screenshots: DesktopScreenshot[];
  resources: ScanResource[];
}

export interface DesktopSettings {
  workspace: WorkspaceMode;
  theme: DesktopTheme;
  locale: DesktopLocalePreference;
  closeToTray: boolean;
  notifications: boolean;
  autoSync: boolean;
  defaultMode: Exclude<ScanMode, 'deep'>;
  maxPages: number;
  maxDepth: number;
  maxDurationSeconds: number;
  concurrency: number;
  portScan: boolean;
  launchAtStartup: boolean;
}

export interface LocalServer {
  port: number;
  url: string;
  service: string;
}

export interface CloudState {
  configured: boolean;
  authenticated: boolean;
  email: string | null;
  userId: string | null;
  apiUrl: string;
  avatarDataUrl: string | null;
}

export type ShotRunStatus = 'active' | 'failed' | 'cleared' | 'abandoned';

export interface ShotRun {
  id: string;
  accountId: string | null;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  status: ShotRunStatus;
  startingLevel: number;
  levelReached: number;
  durationMs: number;
  score: number;
  kills: number;
  systems: number;
}

export type ShotRunSnapshot = Pick<ShotRun, 'levelReached' | 'durationMs' | 'score' | 'kills' | 'systems'>;
export type ShotRunRecord = Omit<ShotRun, 'accountId'>;

export interface ShotStats {
  runs: number;
  clears: number;
  highestLevel: number;
  bestScore: number;
  bestTimeMs: number;
  totalTimeMs: number;
  totalKills: number;
  totalSystems: number;
}

export interface ShotDeviceSummary {
  version: 1;
  deviceId: string;
  updatedAt: string;
  stats: ShotStats;
  recentRuns: ShotRunRecord[];
}

export interface ShotProgress {
  stats: ShotStats;
  recentRuns: ShotRunRecord[];
  sync: 'device' | 'synced' | 'pending';
  lastSyncedAt: string | null;
  syncError: string | null;
}

export interface WatchProject {
  id: string;
  folder: string;
  targetUrl: string;
  mode: 'quick' | 'full';
  enabled: boolean;
  lastTriggeredAt: string | null;
}

export interface PunchProgress {
  scan: DesktopScan;
}

export interface StartPunchOptions {
  mode: 'quick' | 'full';
  workspace: WorkspaceMode;
}

export interface CloudCredentials {
  email: string;
  password: string;
}

export type IpcActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface SignUpCredentials extends CloudCredentials {
  displayName: string;
}

export type ExportFormat = 'pdf' | 'json' | 'csv' | 'markdown';

export interface DesktopAPI {
  window: {
    minimize(): Promise<void>;
    maximize(): Promise<void>;
    close(): Promise<void>;
    isMaximized(): Promise<boolean>;
    onMaximized(callback: (maximized: boolean) => void): () => void;
    isFullscreen(): Promise<boolean>;
    setFullscreen(enabled: boolean): Promise<boolean>;
    onFullscreen(callback: (fullscreen: boolean) => void): () => void;
  };
  scans: {
    start(url: string, options: StartPunchOptions): Promise<DesktopScan>;
    cancel(scanId: string): Promise<void>;
    history(): Promise<DesktopScan[]>;
    pending(): Promise<DesktopScan[]>;
    report(scanId: string): Promise<DesktopReport | null>;
    remove(scanId: string): Promise<void>;
    sync(scanId: string): Promise<DesktopScan>;
    pause(paused: boolean): Promise<boolean>;
    onProgress(callback: (progress: PunchProgress) => void): () => void;
    onComplete(callback: (report: DesktopReport) => void): () => void;
    onError(callback: (scan: DesktopScan) => void): () => void;
  };
  cloud: {
    state(): Promise<CloudState>;
    restoreSession(): Promise<CloudState>;
    signIn(credentials: CloudCredentials): Promise<CloudState>;
    signUp(credentials: SignUpCredentials): Promise<{ state: CloudState; needsEmailConfirmation: boolean }>;
    signOut(): Promise<CloudState>;
    history(): Promise<DesktopScan[]>;
    report(scanId: string): Promise<DesktopReport | null>;
    remove(scanId: string): Promise<void>;
    saveAvatar(webpBase64: string | null): Promise<CloudState>;
  };
  settings: {
    get(): Promise<DesktopSettings>;
    update(patch: Partial<DesktopSettings>): Promise<DesktopSettings>;
  };
  servers: { detect(): Promise<LocalServer[]> };
  watchers: {
    list(): Promise<WatchProject[]>;
    add(targetUrl: string, mode: 'quick' | 'full'): Promise<WatchProject | null>;
    update(id: string, patch: Pick<WatchProject, 'enabled' | 'targetUrl' | 'mode'>): Promise<WatchProject>;
    remove(id: string): Promise<void>;
  };
  reports: {
    export(scanId: string, source: WorkspaceMode, format: ExportFormat): Promise<string | null>;
    copyPrompt(scanId: string, source: WorkspaceMode): Promise<number>;
    inspect(url: string, selector?: string): Promise<void>;
  };
  system: {
    openExternal(url: string): Promise<void>;
    checkForUpdates(): Promise<string>;
    getUpdateState(): Promise<DesktopUpdateState>;
    downloadUpdate(): Promise<void>;
    installUpdate(): Promise<void>;
    onUpdateState(callback: (state: DesktopUpdateState) => void): () => void;
  };
  game: {
    progress(): Promise<ShotProgress>;
    start(level: number): Promise<ShotRun>;
    checkpoint(runId: string, snapshot: ShotRunSnapshot): Promise<ShotProgress>;
    finish(runId: string, outcome: 'failed' | 'cleared' | 'abandoned', snapshot: ShotRunSnapshot): Promise<ShotProgress>;
    sync(): Promise<ShotProgress>;
  };
}

export type { Finding, Metric, PageRecord, ScanMode };
