import { CheckCircle, CloudArrowUp, Crosshair, ShieldCheck } from '@phosphor-icons/react';
import type { DesktopScan, LocalServer, ScanMode, WorkspaceMode } from '../../shared/types';
import type { ScanItem } from '../utils';
import { PunchForm } from '../components/PunchForm';
import { ScanList } from '../components/ScanList';
import { useDesktopI18n } from '../i18n';

export function Dashboard({ items, localHistory, workspace, autoSync, cloudConnected, defaultMode, servers, onPunch, onOpen, onHistory }: {
  items: ScanItem[];
  localHistory: DesktopScan[];
  workspace: WorkspaceMode;
  autoSync: boolean;
  cloudConnected: boolean;
  defaultMode: Exclude<ScanMode, 'deep'>;
  servers: LocalServer[];
  onPunch(url: string, mode: 'quick' | 'full'): Promise<void>;
  onOpen(item: ScanItem): void;
  onHistory(): void;
}) {
  const { t } = useDesktopI18n();
  const completed = items.filter(item => item.scan.status === 'completed');
  const scores = completed.map(item => item.scan.score?.overall).filter((score): score is number => typeof score === 'number');
  const active = localHistory.filter(scan => ['queued', 'running'].includes(scan.status));

  const stats = [
    { label: t('dashboard.punches'), value: completed.length, icon: Crosshair },
    { label: t('dashboard.averageScore'), value: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : '—', icon: ShieldCheck },
    { label: t('dashboard.readyLaunch'), value: completed.filter(item => item.scan.score?.launch).length, icon: CheckCircle },
    { label: t('dashboard.syncedReports'), value: localHistory.filter(scan => scan.synced_at).length, icon: CloudArrowUp },
  ];

  return (
    <div className="view dashboard-view">
      <PunchForm workspace={workspace} autoSync={autoSync} cloudConnected={cloudConnected} defaultMode={defaultMode} servers={servers} onPunch={onPunch}/>
      {active.length > 0 && (
        <section className="active-queue">
          <div>
            <span className="pulse-dot"/>
            <strong>{t(active.length === 1 ? 'dashboard.activePunch' : 'dashboard.activePunches', { count: active.length })}</strong>
          </div>
          {active.map(scan => (
            <div className="queue-row" key={scan.id}>
              <span>{new URL(scan.target_url).host}</span>
              <div className="progress-track"><i/></div>
              <small>{scan.stage}</small>
              <button onClick={() => void window.gorillaPunch.scans.cancel(scan.id)}>{t('dashboard.cancel')}</button>
            </div>
          ))}
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

      <section className="panel recent-panel">
        <div className="section-title">
          <div>
            <span className="eyebrow">{t('dashboard.latestEvidence')}</span>
            <h2>{t('dashboard.recentPunches')}</h2>
          </div>
          <button className="text-btn" onClick={onHistory}>{t('dashboard.viewAll')}</button>
        </div>
        <ScanList items={items.slice(0, 6)} onOpen={onOpen}/>
      </section>
    </div>
  );
}
