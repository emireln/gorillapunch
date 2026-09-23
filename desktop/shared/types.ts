import type { Finding, Metric, PageRecord, Report, Scan, ScanMode } from '../../src/core/types';

export type WorkspaceMode = 'local' | 'cloud';
export type DesktopTheme = 'system' | 'dark' | 'light';

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
  };
  scans: {
    start(url: string, options: StartPunchOptions): Promise<DesktopScan>;
    cancel(scanId: string): Promise<void>;
    history(): Promise<DesktopScan[]>;
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
    signIn(credentials: CloudCredentials): Promise<CloudState>;
    signUp(credentials: SignUpCredentials): Promise<{ state: CloudState; needsEmailConfirmation: boolean }>;
    signOut(): Promise<CloudState>;
    history(): Promise<DesktopScan[]>;
    report(scanId: string): Promise<DesktopReport | null>;
    remove(scanId: string): Promise<void>;
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
  };
  game: {
    getHighScore(): Promise<number>;
    saveScore(score: number): Promise<{ localBest: number; lastScore: number }>;
  };
}

export type { Finding, Metric, PageRecord, ScanMode };
