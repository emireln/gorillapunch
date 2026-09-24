import { useCallback, useEffect, useRef, useState } from 'react';
import { CloudArrowUp, GameController, Pause, Play, SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react';
import type { ShotProgress, ShotRunSnapshot, WorkspaceMode } from '../../shared/types';

interface Props { workspace: WorkspaceMode; cloudConnected: boolean; online: boolean }
interface FrameState extends ShotRunSnapshot {
  runId: string; health: number; maxHealth: number; systemsTotal: number; totalSystems: number;
  status: 'idle' | 'running' | 'paused';
}
const blank: FrameState = { runId: '', levelReached: 1, durationMs: 0, score: 0, kills: 0, systems: 0, health: 5, maxHealth: 5, systemsTotal: 0, totalSystems: 0, status: 'idle' };
const timer = (ms: number) => `${Math.floor(ms / 60000).toString().padStart(2, '0')}:${Math.floor(ms / 1000 % 60).toString().padStart(2, '0')}`;
const snap = (s: FrameState): ShotRunSnapshot => ({ levelReached: s.levelReached, durationMs: s.durationMs, score: s.score, kills: s.kills, systems: s.totalSystems });

export function Arcade({ workspace, cloudConnected, online }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const live = useRef<FrameState>(blank);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const starting = useRef(false);
  const ending = useRef(false);
  const checkpointAt = useRef(0);
  const [state, setState] = useState<FrameState>(blank);
  const [progress, setProgress] = useState<ShotProgress | null>(null);
  const [sector, setSector] = useState(1);
  const [muted, setMuted] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback((type: string, detail: Record<string, unknown> = {}) => {
    frame.current?.contentWindow?.postMessage({ channel: 'gorilla-shot-host', type, detail }, '*');
  }, []);
  const configure = useCallback(() => {
    const css = getComputedStyle(document.documentElement);
    const colors = Object.fromEntries(['bg', 'surface', 'overlay', 'purple', 'purple-light', 'red', 'text', 'muted', 'glow', 'ambient'].map(name => [name, css.getPropertyValue(`--shot-${name}`).trim()]));
    send('configure', { level: sector, colors });
  }, [sector, send]);
  const write = useCallback((work: () => Promise<ShotProgress>) => {
    writes.current = writes.current.then(async () => { setProgress(await work()); }).catch(cause => setError(cause instanceof Error ? cause.message : 'Game progress could not be saved.'));
  }, []);

  useEffect(() => { configure(); }, [configure]);
  useEffect(() => {
    let mounted = true;
    void window.gorillaPunch.game.progress().then(p => { if (mounted) setProgress(p); }).catch(e => { if (mounted) setError(String(e)); });
    if (workspace === 'cloud' && cloudConnected && online) {
      void window.gorillaPunch.game.sync().then(p => { if (mounted) setProgress(p); }).catch(e => { if (mounted) setError(e instanceof Error ? e.message : 'Cloud progress could not sync.'); });
    }
    return () => { mounted = false; };
  }, [workspace, cloudConnected, online]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.channel !== 'gorilla-shot-frame') return;
      const detail = event.data.detail as Partial<FrameState> & { level?: number; outcome?: 'failed' | 'cleared'; message?: string };
      if (event.data.type === 'ready') { configure(); return; }
      if (event.data.type === 'start-request') {
        if (starting.current || live.current.status !== 'idle') return;
        starting.current = true; ending.current = false; setError(null);
        void window.gorillaPunch.game.start(Number(detail.level) || sector).then(run => {
          const next = { ...blank, runId: run.id, levelReached: run.startingLevel, status: 'running' as const };
          live.current = next; setState(next); checkpointAt.current = 0;
          send('start', { runId: run.id, level: run.startingLevel, startedAt: run.startedAt });
        }).catch(e => { const message = e instanceof Error ? e.message : 'Could not start the game.'; setError(message); send('error', { message }); }).finally(() => { starting.current = false; });
        return;
      }
      if (event.data.type === 'error') { setError(String(detail.message || 'The game could not start.')); return; }
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
  }, [configure, sector, send, write]);

  useEffect(() => () => {
    const s = live.current;
    if (s.runId && s.status !== 'idle' && !ending.current) void writes.current.then(() => window.gorillaPunch.game.finish(s.runId, 'abandoned', snap(s))).catch(() => {});
  }, []);

  const sync = async () => {
    setSyncing(true); setError(null);
    try { setProgress(await window.gorillaPunch.game.sync()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Cloud progress could not sync.'); }
    finally { setSyncing(false); }
  };
  const inRun = state.status !== 'idle';
  const maxSector = Math.max(1, progress?.stats.highestLevel || 1);
  const syncLabel = workspace !== 'cloud' || !cloudConnected ? 'Saved on this device' : !online ? 'Offline · sync pending' : progress?.sync === 'synced' ? 'Cloud progress synced' : 'Cloud sync pending';
  return <div className="view arcade-view">
    <div className="page-heading"><div><span className="eyebrow">DESKTOP ARCADE</span><h1>Gorilla Shot</h1><p>Survive the arena, reboot its systems, and clear all three sectors.</p></div></div>
    <section className="shot-shell" aria-label="Gorilla Shot game">
      <div className="shot-toolbar"><div className="shot-brand"><GameController size={18} weight="fill"/><strong>GORILLA SHOT</strong><span>UNDER RUN // GP EDITION</span></div><div className="shot-toolbar-actions"><span>{syncLabel}</span><button type="button" aria-label={muted ? 'Unmute game' : 'Mute game'} onClick={() => { setMuted(!muted); send('mute', { muted: !muted }); }}>{muted ? <SpeakerSlash size={17}/> : <SpeakerHigh size={17}/>}</button><button type="button" aria-label={state.status === 'paused' ? 'Resume game' : 'Pause game'} disabled={!inRun} onClick={() => send(state.status === 'paused' ? 'resume' : 'pause')}>{state.status === 'paused' ? <Play size={17} weight="fill"/> : <Pause size={17} weight="fill"/>}</button></div></div>
      <div className="shot-hud"><div><span>SECTOR</span><strong>{state.levelReached.toString().padStart(2, '0')} / 03</strong></div><div><span>HEALTH</span><strong className="shot-health">{'♥'.repeat(Math.max(0, state.health))}<i>{'♥'.repeat(Math.max(0, state.maxHealth - state.health))}</i></strong></div><div><span>TIME ALIVE</span><strong>{timer(state.durationMs)}</strong></div><div><span>SCORE</span><strong>{state.score.toLocaleString()}</strong></div><div><span>ENEMIES</span><strong>{state.kills}</strong></div><div><span>SYSTEMS</span><strong>{state.systems} / {state.systemsTotal}</strong></div></div>
      <div className="shot-frame-wrap"><iframe ref={frame} title="Gorilla Shot arena" src="./gorilla-shot/index.html" allow="autoplay" onLoad={configure}/></div>
      <div className="shot-footer"><span><kbd>WASD</kbd> move · <kbd>MOUSE</kbd> aim · <kbd>CLICK</kbd> fire · <kbd>P</kbd> pause</span><div><label htmlFor="shot-sector">Start at</label><select id="shot-sector" value={sector} disabled={inRun} onChange={e => setSector(Number(e.target.value))}>{[1, 2, 3].map(n => <option key={n} value={n} disabled={n > maxSector}>Sector {n}{n > maxSector ? ' · locked' : ''}</option>)}</select></div></div>
    </section>
    {error && <p className="shot-error" role="alert">{error}</p>}
    <section className="shot-progress" aria-label="Gorilla Shot progress"><div className="shot-progress-heading"><div><span className="eyebrow">YOUR PROGRESS</span><h2>Mission record</h2></div>{workspace === 'cloud' && cloudConnected && <button type="button" className="secondary-btn" disabled={!online || syncing} onClick={() => void sync()}><CloudArrowUp size={16}/>{syncing ? 'Syncing…' : 'Sync now'}</button>}</div><div className="shot-stat-grid"><div><span>BEST SCORE</span><strong>{(progress?.stats.bestScore || 0).toLocaleString()}</strong></div><div><span>LONGEST SURVIVAL</span><strong>{timer(progress?.stats.bestTimeMs || 0)}</strong></div><div><span>TOTAL TIME</span><strong>{timer(progress?.stats.totalTimeMs || 0)}</strong></div><div><span>RUNS / CLEARS</span><strong>{progress?.stats.runs || 0} / {progress?.stats.clears || 0}</strong></div></div><div className="shot-recent"><strong>Recent runs</strong>{progress?.recentRuns.length ? <ol>{progress.recentRuns.slice(0, 5).map(run => <li key={run.id}><span className={run.status === 'cleared' ? 'cleared' : ''}>{run.status.toUpperCase()}</span><span>Sector {run.levelReached}</span><span>{timer(run.durationMs)}</span><strong>{run.score.toLocaleString()} pts</strong></li>)}</ol> : <p>Finish a run to begin your mission record.</p>}</div></section>
  </div>;
}
