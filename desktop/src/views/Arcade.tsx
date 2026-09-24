import { useState } from 'react';
import { GameController, Pause, Play } from '@phosphor-icons/react';
import { PixelGame } from '../components/PixelGame';

export function Arcade() {
  const [paused, setPaused] = useState(false);
  return <div className="view arcade-view">
    <div className="page-heading"><div><span className="eyebrow">OPTIONAL BREAK</span><h1>Gorilla Run</h1><p>Play whenever you like. Your punches continue in the background.</p></div></div>
    <section className="desktop-arcade-card">
      <div className="desktop-arcade-header"><div className="arcade-title-group"><span className="arcade-pill"><GameController size={14} weight="bold"/> ARCADE</span><strong>Gorilla Run</strong></div><div className="arcade-header-controls"><span className="arcade-tip">Space / click to jump · P to pause</span><button className="secondary-btn arcade-control-btn" type="button" aria-label={paused ? 'Resume game' : 'Pause game'} onClick={() => setPaused(value => !value)}>{paused ? <Play size={15} weight="fill"/> : <Pause size={15} weight="fill"/>}{paused ? 'Resume' : 'Pause'}</button></div></div>
      <div className="desktop-arcade-canvas-wrap"><PixelGame background="var(--arcade-bg, #24202b)" ink="var(--arcade-ink, #957cdf)" paused={paused} onPauseToggle={() => setPaused(value => !value)}/>{paused && <div className="arcade-pause-overlay" role="status"><strong>Paused</strong><span>Press P or Resume to keep playing</span></div>}</div>
    </section>
  </div>;
}
