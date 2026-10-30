// Result screen: the score and where it came from, the server's verdict, what next.
import Link from 'next/link';
import { BUMP_PENALTY_MS, PULSE_PENALTY_MS, fmtScore } from '../../lib/diejie/rules';
import type { GameMode } from '../../lib/diejie/game';
import type { RunResult, SubmitState } from './useDiejieGame';

type Props = {
  mode: GameMode;
  result: RunResult;
  submit: SubmitState;
  onAgain: () => void;
  onLogin: () => void;
};

function Cell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="dj-cell">
      <div className="dj-cell-n">{value}</div>
      <div className="dj-cell-l">{label}</div>
      {hint && <div className="dj-cell-h">{hint}</div>}
    </div>
  );
}

function Standing({ submit, result }: { submit: SubmitState; result: RunResult }) {
  switch (submit.kind) {
    case 'submitting':
      return <p className="dj-status">正在提交排行榜…</p>;
    case 'practice':
      return <p className="dj-status">自由练习不计入排行榜</p>;
    case 'unranked':
      return <p className="dj-status">{submit.reason}</p>;
    case 'error':
      return <p className="dj-status dj-bad">排行榜提交失败：{submit.message}</p>;
    case 'guest':
      return <p className="dj-status">未登录，这一局没有计入排行榜</p>;
    case 'done': {
      const { best } = submit;
      const keptBetter = best && best.scoreMs < submit.run.scoreMs;
      return (
        <div className="dj-standing">
          {best && (
            <p className="dj-rank">
              今日第 <b>{best.rank}</b> 名<span> / 共 {best.total} 人</span>
            </p>
          )}
          <p className="dj-status">
            {keptBetter
              ? `这一局没能超过你今天的最好成绩 ${fmtScore(best.scoreMs)}，已保留更好的`
              : result.scoreMs === submit.run.scoreMs || !best
                ? '已提交，这是你今天的最好成绩'
                : '已提交排行榜'}
          </p>
        </div>
      );
    }
    default:
      return null;
  }
}

export default function ResultPanel({ mode, result, submit, onAgain, onLogin }: Props) {
  const extra = result.steps - result.shortest;
  return (
    <div className="dj-overlay" role="dialog" aria-label="通关结果">
      <div className="dj-card">
        <div className="dj-mark">已找到出口</div>
        <div className="dj-score">{fmtScore(result.scoreMs)}</div>
        <div className="dj-score-l">总成绩 · 越低越好</div>

        <div className="dj-grid">
          <Cell label="用时" value={fmtScore(result.timeMs)} />
          <Cell
            label="撞树"
            value={String(result.bumps)}
            hint={result.bumps ? `+${(result.bumps * BUMP_PENALTY_MS) / 1000} 秒` : undefined}
          />
          <Cell
            label="回光"
            value={String(result.pulses)}
            hint={result.pulses ? `+${(result.pulses * PULSE_PENALTY_MS) / 1000} 秒` : undefined}
          />
          <Cell
            label="步数"
            value={String(result.steps)}
            hint={extra > 0 ? `最短 ${result.shortest}` : '最短路线'}
          />
        </div>

        <Standing submit={submit} result={result} />

        <div className="dj-actions">
          <button type="button" className="dj-primary" onClick={onAgain}>
            {mode === 'daily' ? '再走一次' : '换一张'}
          </button>
          {submit.kind === 'guest' ? (
            <button type="button" className="dj-ghost" onClick={onLogin}>
              登录后挑战计入排行榜
            </button>
          ) : (
            <Link href="/leaderboard" className="dj-ghost">
              看排行榜
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
