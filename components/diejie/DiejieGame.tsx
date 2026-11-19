// The 叠界 · 光域迷宫 screen: canvas stage, HUD, start / result panels, touch pad.
import { useRef } from 'react';
import { useSession } from 'next-auth/react';
import { fmtScore } from '../../lib/diejie/rules';
import IntroPanel from './IntroPanel';
import ResultPanel from './ResultPanel';
import TouchControls from './TouchControls';
import { useDiejieGame } from './useDiejieGame';

export default function DiejieGame() {
  const { status } = useSession();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const game = useDiejieGame({ canvasRef, stageRef, authStatus: status });
  const { hud, phase } = game;
  const playing = phase === 'preview' || phase === 'playing';

  return (
    <div className="dj-stage" ref={stageRef} style={{ paddingBottom: game.reserve }}>
      <canvas ref={canvasRef} className="dj-canvas" aria-label="迷宫" />

      {playing && hud && (
        <div className="dj-hud" aria-live="off">
          {hud.phase === 'preview' ? (
            <div className="dj-hud-preview">
              光源 <b>{Math.ceil(hud.previewLeftMs / 1000)}</b> 秒
            </div>
          ) : (
            <>
              <div className="dj-hud-time">{fmtScore(hud.scoreMs)}</div>
              <div className="dj-hud-chips">
                {hud.bumps > 0 && <span className="dj-chip dj-chip-bad">撞树 ×{hud.bumps}</span>}
                <span className={`dj-chip ${hud.pulsesLeft === 0 ? 'dj-chip-dim' : ''}`}>
                  回光 {hud.pulsesLeft}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {phase === 'playing' && hud && (
        <TouchControls
          onDir={game.act}
          onLantern={game.lantern}
          pulsesLeft={hud.pulsesLeft}
          canPulse={hud.canPulse}
        />
      )}

      {game.ready && phase === 'ready' && (
        <IntroPanel
          mode={game.mode}
          onMode={game.setMode}
          day={game.daily?.day ?? null}
          dailyFailed={game.dailyFailed}
          canStart={game.mode === 'practice' || game.daily !== null}
          authStatus={status}
          onStart={game.start}
          onLogin={game.login}
        />
      )}

      {game.resultVisible && game.result && (
        <ResultPanel
          mode={game.mode}
          result={game.result}
          submit={game.submit}
          onAgain={game.restart}
          onLogin={game.login}
        />
      )}

      {!game.ready && (
        <div className="dj-loading">
          <div className="dj-spinner" />
          <div>QCNOTE · 初始化迷宫</div>
        </div>
      )}
    </div>
  );
}
