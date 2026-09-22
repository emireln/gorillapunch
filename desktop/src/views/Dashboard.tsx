import { useState } from 'react';
import { CheckCircle, CloudArrowUp, Crosshair, GameController, ShieldCheck } from '@phosphor-icons/react';
import type { DesktopScan, LocalServer, ScanMode, WorkspaceMode } from '../../shared/types';
import type { ScanItem } from '../utils';
import { PunchForm } from '../components/PunchForm';
import { ScanList } from '../components/ScanList';
import { PixelGame } from '../components/PixelGame';

export function Dashboard({ items, localHistory, workspace, defaultMode, servers, onPunch, onOpen, onHistory }: {
  items: ScanItem[];
  localHistory: DesktopScan[];
  workspace: WorkspaceMode;
  defaultMode: Exclude<ScanMode, 'deep'>;
  servers: LocalServer[];
  onPunch(url: string, mode: 'quick' | 'full'): void;
  onOpen(item: ScanItem): void;
  onHistory(): void;
}) {
  const [arcadeOpen, setArcadeOpen] = useState(false);
  const completed = items.filter(item => item.scan.status === 'completed');
  const scores = completed.map(item => item.scan.score?.overall).filter((score): score is number => typeof score === 'number');
  const active = localHistory.filter(scan => ['queued', 'running'].includes(scan.status));
  const isWorkerRunning = active.length > 0;
  const showArcade = isWorkerRunning || arcadeOpen;

  const stats = [
    { label: 'Punches', value: completed.length, icon: Crosshair },
    { label: 'Average score', value: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : '—', icon: ShieldCheck },
    { label: 'Ready to launch', value: completed.filter(item => item.scan.score?.launch).length, icon: CheckCircle },
    { label: 'Synced reports', value: localHistory.filter(scan => scan.synced_at).length, icon: CloudArrowUp },
  ];

  return (
    <div className="view dashboard-view">
      <PunchForm workspace={workspace} defaultMode={defaultMode} servers={servers} busy={active.length > 0} onPunch={onPunch}/>
      {active.length > 0 && (
        <section className="active-queue">
          <div>
            <span className="pulse-dot"/>
            <strong>{active.length} active {active.length === 1 ? 'punch' : 'punches'}</strong>
          </div>
          {active.map(scan => (
            <div className="queue-row" key={scan.id}>
              <span>{new URL(scan.target_url).host}</span>
              <div className="progress-track"><i/></div>
              <small>{scan.stage}</small>
              <button onClick={() => void window.gorillaPunch.scans.cancel(scan.id)}>Cancel</button>
            </div>
          ))}
        </section>
      )}

      {showArcade && (
        <section className={`desktop-arcade-card ${isWorkerRunning ? 'running-mode' : ''}`}>
          <div className="desktop-arcade-header">
            <div className="arcade-title-group">
              <span className={`arcade-pill ${isWorkerRunning ? 'active-pulse' : ''}`}>
                <GameController size={14} weight="bold" />
                {isWorkerRunning ? 'WORKER RUNNING' : 'ARCADE'}
              </span>
              <strong>{isWorkerRunning ? 'Play Gorilla Run while worker inspects target' : 'Gorilla Run'}</strong>
            </div>
            <div className="arcade-header-controls">
              <span className="arcade-tip">Space / Click to jump • Scores saved to database</span>
              {!isWorkerRunning && (
                <button className="text-btn" onClick={() => setArcadeOpen(false)}>
                  Close
                </button>
              )}
            </div>
          </div>
          <div className="desktop-arcade-canvas-wrap">
            <PixelGame background="#141119" ink="#a78bfa" />
          </div>
        </section>
      )}

      <section className="overview-grid">
        {stats.map(stat => (
          <article key={stat.label}>
            <stat.icon size={21}/>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </article>
        ))}
      </section>

      {!showArcade && (
        <div className="arcade-launcher-bar">
          <button className="arcade-launch-btn" onClick={() => setArcadeOpen(true)}>
            <GameController size={18} weight="duotone" />
            <span>Play Gorilla Run</span>
            <small>Retro mini-game while waiting</small>
          </button>
        </div>
      )}

      <section className="panel recent-panel">
        <div className="section-title">
          <div>
            <span className="eyebrow">LATEST EVIDENCE</span>
            <h2>Recent punches</h2>
          </div>
          <button className="text-btn" onClick={onHistory}>View all</button>
        </div>
        <ScanList items={items.slice(0, 6)} onOpen={onOpen}/>
      </section>
    </div>
  );
}
