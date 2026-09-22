import { randomUUID } from 'node:crypto';
import chokidar, { type FSWatcher } from 'chokidar';
import type { DesktopDatabase } from './database';
import type { ScanManager } from './scanner';
import type { WatchProject } from '../shared/types';

export class WatcherService {
  private active = new Map<string, FSWatcher>();
  private timers = new Map<string, NodeJS.Timeout>();
  private triggering = new Set<string>();

  constructor(private readonly database: DesktopDatabase, private readonly scans: ScanManager) {}

  async initialize() {
    for (const watcher of await this.database.watchers()) if (watcher.enabled) await this.start(watcher);
  }

  list() { return this.database.watchers(); }

  async add(folder: string, targetUrl: string, mode: 'quick' | 'full') {
    const { normalizeDesktopUrl } = await import('../../src/core/url');
    const watcher: WatchProject = { id: randomUUID(), folder, targetUrl: normalizeDesktopUrl(targetUrl), mode, enabled: true, lastTriggeredAt: null };
    await this.database.saveWatcher(watcher);
    await this.start(watcher);
    return watcher;
  }

  async update(id: string, patch: Pick<WatchProject, 'enabled' | 'targetUrl' | 'mode'>) {
    const current = (await this.database.watchers()).find(item => item.id === id);
    if (!current) throw new Error('Watched project not found.');
    const { normalizeDesktopUrl } = await import('../../src/core/url');
    const watcher: WatchProject = {
      ...current,
      enabled: !!patch.enabled,
      targetUrl: normalizeDesktopUrl(patch.targetUrl),
      mode: patch.mode === 'full' ? 'full' : 'quick',
    };
    await this.stop(id);
    await this.database.saveWatcher(watcher);
    if (watcher.enabled) await this.start(watcher);
    return watcher;
  }

  async remove(id: string) {
    await this.stop(id);
    await this.database.removeWatcher(id);
  }

  async close() {
    await Promise.all([...this.active.values()].map(watcher => watcher.close()));
    this.active.clear();
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private async start(project: WatchProject) {
    if (this.active.has(project.id)) return;
    const watcher = chokidar.watch(project.folder, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 100 },
      ignored: /(^|[/\\])(?:\.git|node_modules|\.next|dist|build|coverage)([/\\]|$)/,
    });
    watcher.on('all', (_event, path) => {
      if (!/\.(?:[cm]?[jt]sx?|css|scss|sass|less|html|vue|svelte|astro|json|mdx?)$/i.test(path)) return;
      const previous = this.timers.get(project.id);
      if (previous) clearTimeout(previous);
      this.timers.set(project.id, setTimeout(() => { void this.trigger(project.id).catch(() => {}); }, 1800));
    });
    this.active.set(project.id, watcher);
  }

  private async stop(id: string) {
    const watcher = this.active.get(id);
    if (watcher) await watcher.close();
    this.active.delete(id);
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
  }

  private async trigger(id: string) {
    if (this.triggering.has(id)) return;
    this.triggering.add(id);
    try {
      const project = (await this.database.watchers()).find(item => item.id === id);
      if (!project?.enabled) return;
      const settings = await this.database.settings();
      await this.scans.start(project.targetUrl, { mode: project.mode, workspace: settings.workspace });
      await this.database.saveWatcher({ ...project, lastTriggeredAt: new Date().toISOString() });
    } finally {
      this.triggering.delete(id);
    }
  }
}
