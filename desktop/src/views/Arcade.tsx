import { useCallback, useEffect, useRef, useState } from 'react';
import { CloudArrowUp, CornersIn, CornersOut, GameController, Pause, Play, SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react';
import type { ShotProgress, ShotRunSnapshot, WorkspaceMode } from '../../shared/types';
import { Dropdown } from '../components/Dropdown';
import { Tooltip } from '../components/Tooltip';
import { useDesktopI18n } from '../i18n';

interface Props { workspace: WorkspaceMode; cloudConnected: boolean; online: boolean }
interface FrameState extends ShotRunSnapshot {
  runId: string; health: number; maxHealth: number; systemsTotal: number; totalSystems: number;
  status: 'idle' | 'running' | 'paused';
}
const blank: FrameState = { runId: '', levelReached: 1, durationMs: 0, score: 0, kills: 0, systems: 0, health: 5, maxHealth: 5, systemsTotal: 0, totalSystems: 0, status: 'idle' };
const timer = (ms: number) => `${Math.floor(ms / 60000).toString().padStart(2, '0')}:${Math.floor(ms / 1000 % 60).toString().padStart(2, '0')}`;
const snap = (s: FrameState): ShotRunSnapshot => ({ levelReached: s.levelReached, durationMs: s.durationMs, score: s.score, kills: s.kills, systems: s.totalSystems });

export function Arcade({ workspace, cloudConnected, online }: Props) {
  const { t, locale } = useDesktopI18n();
  const frame = useRef<HTMLIFrameElement>(null);
  const shell = useRef<HTMLElement>(null);
  const live = useRef<FrameState>(blank);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const starting = useRef(false);
  const ending = useRef(false);
  const checkpointAt = useRef(0);
  const [state, setState] = useState<FrameState>(blank);
  const [progress, setProgress] = useState<ShotProgress | null>(null);
  const [sector, setSector] = useState(1);
  const [muted, setMuted] = useState(readSavedMute);
  const [volume, setVolume] = useState(readSavedVolume);
  const [syncing, setSyncing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback((type: string, detail: Record<string, unknown> = {}) => {
    frame.current?.contentWindow?.postMessage({ channel: 'gorilla-shot-host', type, detail }, '*');
  }, []);
  const configure = useCallback(() => {
    const css = getComputedStyle(document.documentElement);
    const colors = Object.fromEntries(['bg', 'surface', 'overlay', 'purple', 'purple-light', 'red', 'text', 'muted', 'glow', 'ambient'].map(name => [name, css.getPropertyValue(`--shot-${name}`).trim()]));
    send('configure', { level: sector, colors, locale });
  }, [locale, sector, send]);
  const syncAudio = useCallback(() => send('audio', { muted, volume }), [muted, send, volume]);
  const write = useCallback((work: () => Promise<ShotProgress>) => {
    writes.current = writes.current.then(async () => { setProgress(await work()); }).catch(cause => setError(cause instanceof Error ? cause.message : t('arcade.saveError')));
  }, [t]);

  useEffect(() => { configure(); }, [configure]);
  useEffect(() => {
    syncAudio();
    try {
      localStorage.setItem('gp-shot-volume', String(volume));
      localStorage.setItem('gp-shot-muted', String(muted));
    } catch { /* Audio settings remain available for this session. */ }
  }, [muted, syncAudio, volume]);
  useEffect(() => {
    const gameKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'KeyP', 'Escape']);
    const routeKey = (event: KeyboardEvent, pressed: boolean) => {
      if (!live.current.runId || live.current.status === 'idle' || !gameKeys.has(event.code)) return;
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused.matches('input, textarea, select, [contenteditable="true"], .gp-dropdown-trigger')) return;
      if (pressed && event.repeat && (event.code === 'KeyP' || event.code === 'Escape')) return;
      if (pressed) event.preventDefault();
      send('input', { code: event.code, pressed, repeat: event.repeat });
    };
    const keydown = (event: KeyboardEvent) => routeKey(event, true);
    const keyup = (event: KeyboardEvent) => routeKey(event, false);
    const pauseWhenAppLeaves = () => { if (live.current.status === 'running') send('pause'); };
    const pauseWhenHidden = () => { if (document.hidden && live.current.status === 'running') send('pause'); };
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', pauseWhenAppLeaves);
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', pauseWhenAppLeaves);
      document.removeEventListener('visibilitychange', pauseWhenHidden);
    };
  }, [send]);
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === shell.current);
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  useEffect(() => {
    let mounted = true;
    void window.gorillaPunch.game.progress().then(p => { if (mounted) setProgress(p); }).catch(e => { if (mounted) setError(String(e)); });
    if (workspace === 'cloud' && cloudConnected && online) {
      void window.gorillaPunch.game.sync().then(p => { if (mounted) setProgress(p); }).catch(e => { if (mounted) setError(e instanceof Error ? e.message : t('arcade.cloudError')); });
    }
    return () => { mounted = false; };
  }, [workspace, cloudConnected, online, t]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.channel !== 'gorilla-shot-frame') return;
      const detail = event.data.detail as Partial<FrameState> & { level?: number; outcome?: 'failed' | 'cleared'; message?: string };
      if (event.data.type === 'ready') { configure(); syncAudio(); return; }
      if (event.data.type === 'loaded') { setFrameLoaded(true); return; }
      if (event.data.type === 'start-request') {
        if (starting.current || live.current.status !== 'idle') return;
        starting.current = true; ending.current = false; setError(null);
        void window.gorillaPunch.game.start(Number(detail.level) || sector).then(run => {
          const next = { ...blank, runId: run.id, levelReached: run.startingLevel, status: 'running' as const };
          live.current = next; setState(next); checkpointAt.current = 0;
          send('start', { runId: run.id, level: run.startingLevel, startedAt: run.startedAt });
        }).catch(e => { const message = e instanceof Error ? e.message : t('arcade.startError'); setError(message); send('error', { message }); }).finally(() => { starting.current = false; });
        return;
      }
      if (event.data.type === 'error') { setFrameLoaded(true); setError(String(detail.message || t('arcade.gameError'))); return; }
      if (!detail.runId || detail.runId !== live.current.runId || ending.current) return;
      const next = { ...live.current, ...detail } as FrameState;
      live.current = next; setState(next);
      if (event.data.type === 'checkpoint' || (event.data.type === 'state' && next.status === 'running' && Date.now() - checkpointAt.current > 10000)) {
        checkpointAt.current = Date.now();
        write(() => window.gorillaPunch.game.checkpoint(next.runId, snap(next)));
      }
      if (event.data.type === 'end') {
        ending.current = true;
        write(() => window.gorillaPunch.game.finish(next.runId, detail.outcome === 'cleared' ? 'cleared' : 'failed', snap(next)));
        live.current = { ...next, status: 'idle' }; setState(live.current);
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [configure, sector, send, syncAudio, write, t]);

  useEffect(() => () => {
    const s = live.current;
    if (s.runId && s.status !== 'idle' && !ending.current) void writes.current.then(() => window.gorillaPunch.game.finish(s.runId, 'abandoned', snap(s))).catch(() => {});
  }, []);

  const sync = async () => {
    setSyncing(true); setError(null);
    try { setProgress(await window.gorillaPunch.game.sync()); }
    catch (e) { setError(e instanceof Error ? e.message : t('arcade.cloudError')); }
    finally { setSyncing(false); }
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === shell.current) await document.exitFullscreen();
      else await shell.current?.requestFullscreen();
    } catch { setError(t('arcade.fullscreenError')); }
  };
  const inRun = state.status !== 'idle';
  const maxSector = Math.max(1, progress?.stats.highestLevel || 1);
  const syncLabel = workspace !== 'cloud' || !cloudConnected ? t('arcade.savedLocal') : !online ? t('arcade.offlinePending') : progress?.sync === 'synced' ? t('arcade.cloudSynced') : t('arcade.cloudPending');
  return <div className="view arcade-view">
    <div className="page-heading">
      <div><span className="eyebrow">{t('arcade.eyebrow')}</span><h1>{t('arcade.title')}</h1><p>{t('arcade.subtitle')}</p></div>
    </div>
    <section ref={shell} className="shot-shell panel" aria-label={t('arcade.gameLabel')}>
      <header className="shot-toolbar">
        <div className="shot-brand"><span className="shot-brand-icon"><GameController size={19} weight="fill"/></span><div><strong>{t('arcade.title')}</strong><span>{t('arcade.sectorSurvival')}</span></div></div>
        <div className="shot-toolbar-actions">
          <span className={`shot-sync-status ${progress?.sync === 'pending' ? 'pending' : ''}`}><i/>{syncLabel}</span>
          <div className="shot-volume-control">
            <Tooltip content={t(muted ? 'arcade.unmute' : 'arcade.mute')}><button type="button" className="secondary-btn shot-tool-btn" aria-label={t(muted ? 'arcade.unmute' : 'arcade.mute')} aria-pressed={muted} onClick={() => setMuted(value => !value)}>{muted || volume === 0 ? <SpeakerSlash size={17}/> : <SpeakerHigh size={17}/>}</button></Tooltip>
            <Tooltip content={`${t('arcade.volume')}: ${Math.round(volume * 100)}%`}><input aria-label={t('arcade.volume')} aria-valuetext={`${Math.round(volume * 100)}%`} type="range" min="0" max="1" step="0.05" value={volume} onChange={event => { const next = Number(event.target.value); setVolume(next); if (next > 0 && muted) setMuted(false); }}/></Tooltip>
            <span>{Math.round(volume * 100)}%</span>
          </div>
          <Tooltip content={t(state.status === 'paused' ? 'arcade.resume' : 'arcade.pause')}><button type="button" className="secondary-btn shot-tool-btn" aria-label={t(state.status === 'paused' ? 'arcade.resume' : 'arcade.pause')} disabled={!inRun} onClick={() => send(state.status === 'paused' ? 'resume' : 'pause')}>{state.status === 'paused' ? <Play size={17} weight="fill"/> : <Pause size={17} weight="fill"/>}</button></Tooltip>
          <Tooltip content={t(fullscreen ? 'arcade.exitFullscreen' : 'arcade.fullscreen')}><button type="button" className="secondary-btn shot-fullscreen-btn" disabled={!frameLoaded} onClick={() => void toggleFullscreen()} aria-label={t(fullscreen ? 'arcade.exitFullscreen' : 'arcade.fullscreen')}>{fullscreen ? <CornersIn size={17}/> : <CornersOut size={17}/>}<span>{t(fullscreen ? 'arcade.exitFullscreen' : 'arcade.fullscreen')}</span></button></Tooltip>
        </div>
      </header>
      <div className="shot-hud" aria-label={t('arcade.statsLabel')}>
        <div><span>{t('arcade.sector')}</span><strong>{state.levelReached.toString().padStart(2, '0')} <i>/ 03</i></strong></div>
        <div><span>{t('arcade.health')}</span><strong className="shot-health">{'♥'.repeat(Math.max(0, state.health))}<i>{'♥'.repeat(Math.max(0, state.maxHealth - state.health))}</i></strong></div>
        <div><span>{t('arcade.timeAlive')}</span><strong>{timer(state.durationMs)}</strong></div>
        <div><span>{t('arcade.score')}</span><strong>{state.score.toLocaleString(locale)}</strong></div>
        <div><span>{t('arcade.enemies')}</span><strong>{state.kills.toLocaleString(locale)}</strong></div>
        <div><span>{t('arcade.systems')}</span><strong>{state.systems.toLocaleString(locale)} <i>/ {state.systemsTotal.toLocaleString(locale)}</i></strong></div>
      </div>
      <div className="shot-frame-wrap">
        <iframe ref={frame} title={t('arcade.arena')} src="./gorilla-shot/index.html" allow="autoplay; fullscreen" allowFullScreen tabIndex={0} onLoad={() => { configure(); syncAudio(); }}/>
        {!frameLoaded && <div className="shot-frame-loading" role="status" aria-live="polite"><span className="shot-loading-mark">GP</span><span className="shot-loading-indicator"/><strong>{t('arcade.loading')}</strong><small>{t('arcade.loadingDescription')}</small></div>}
      </div>
      <footer className="shot-footer">
        <div className="shot-instructions"><span><kbd>WASD</kbd> {t('arcade.move')}</span><span><kbd>MOUSE</kbd> {t('arcade.aim')}</span><span><kbd>{locale === 'pt-BR' ? 'CLIQUE' : 'CLICK'}</kbd> {t('arcade.fire')}</span><span><kbd>P / ESC</kbd> {t('arcade.pause')}</span></div>
        <div className="shot-sector-picker"><span>{t('arcade.deploy')}</span><Dropdown<number> ariaLabel={t('arcade.deploy')} value={sector} disabled={!frameLoaded || inRun} onChange={setSector} options={Array.from({ length: maxSector }, (_, index) => index + 1).map(n => ({ value: n, label: t('arcade.sectorOption', { level: n }) }))}/></div>
      </footer>
    </section>
    {error && <div className="alert error shot-error" role="alert">{error}</div>}
    <section className="shot-progress panel" aria-label={t('arcade.progressLabel')}>
      <div className="section-title shot-progress-heading"><div><span className="eyebrow">{t('arcade.progress')}</span><h2>{t('arcade.record')}</h2></div>{workspace === 'cloud' && cloudConnected && <button type="button" className="secondary-btn" disabled={!online || syncing} onClick={() => void sync()}><CloudArrowUp size={16}/>{syncing ? t('settings.syncing') : t('arcade.syncNow')}</button>}</div>
      <div className="shot-stat-grid">
        <div className="shot-stat-card"><span>{t('arcade.bestScore')}</span><strong>{(progress?.stats.bestScore || 0).toLocaleString(locale)}</strong></div>
        <div className="shot-stat-card"><span>{t('arcade.longest')}</span><strong>{timer(progress?.stats.bestTimeMs || 0)}</strong></div>
        <div className="shot-stat-card"><span>{t('arcade.totalTime')}</span><strong>{timer(progress?.stats.totalTimeMs || 0)}</strong></div>
        <div className="shot-stat-card"><span>{t('arcade.runsClears')}</span><strong>{(progress?.stats.runs || 0).toLocaleString(locale)} / {(progress?.stats.clears || 0).toLocaleString(locale)}</strong></div>
      </div>
      <div className="shot-recent"><strong>{t('arcade.recentRuns')}</strong>{progress?.recentRuns.length ? <ol>{progress.recentRuns.slice(0, 5).map(run => <li key={run.id}><span className={run.status === 'cleared' ? 'cleared' : ''}>{t(run.status === 'cleared' ? 'arcade.cleared' : run.status === 'abandoned' ? 'arcade.abandoned' : 'arcade.failed')}</span><span>{t('arcade.runLabel', { level: run.levelReached })}</span><span>{timer(run.durationMs)}</span><strong>{run.score.toLocaleString(locale)} {t('arcade.points')}</strong></li>)}</ol> : <p>{t('arcade.firstRecord')}</p>}</div>
    </section>
  </div>;
}

function readSavedVolume() {
  try {
    const saved = localStorage.getItem('gp-shot-volume');
    if (saved === null) return 0.65;
    const value = Number(saved);
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.65;
  } catch { return 0.65; }
}

function readSavedMute() {
  try { return localStorage.getItem('gp-shot-muted') === 'true'; }
  catch { return false; }
}
