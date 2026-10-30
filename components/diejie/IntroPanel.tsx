// Start screen: pick the mode, read the three rules, begin.
import { BUMP_PENALTY_MS, MAX_PULSES, PREVIEW_MS, PULSE_PENALTY_MS } from '../../lib/diejie/rules';
import type { GameMode } from '../../lib/diejie/game';
import type { AuthStatus } from './useDiejieGame';

type Props = {
  mode: GameMode;
  onMode: (mode: GameMode) => void;
  day: string | null;
  dailyFailed: boolean;
  canStart: boolean;
  authStatus: AuthStatus;
  onStart: () => void;
  onLogin: () => void;
};

const formatDay = (day: string) => {
  const [, m, d] = day.split('-').map(Number);
  return m && d ? `${m} 月 ${d} 日` : day;
};

export default function IntroPanel({
  mode,
  onMode,
  day,
  dailyFailed,
  canStart,
  authStatus,
  onStart,
  onLogin,
}: Props) {
  const seconds = PREVIEW_MS / 1000;
  return (
    <div className="dj-overlay" role="dialog" aria-label="光域迷宫">
      <div className="dj-card">
        <div className="dj-mark">光域迷宫</div>

        <div className="dj-tabs" role="tablist" aria-label="模式">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'daily'}
            disabled={dailyFailed}
            onClick={() => onMode('daily')}
          >
            每日挑战
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'practice'}
            onClick={() => onMode('practice')}
          >
            自由练习
          </button>
        </div>
        <p className="dj-sub">
          {mode === 'daily'
            ? day
              ? `${formatDay(day)} · 全站同一张迷宫，计入排行榜`
              : '正在获取今日迷宫…'
            : dailyFailed
              ? '暂时连不上服务器，只能自由练习'
              : '每次随机一张迷宫，不计入排行榜'}
        </p>

        <ol className="dj-rules">
          <li>
            <b>{seconds} 秒光源</b>
            <span>移动鼠标或手指照亮迷宫，记住出口在哪</span>
          </li>
          <li>
            <b>凭记忆走出去</b>
            <span>方向键 / WASD，手机上滑动或用方向键</span>
          </li>
          <li>
            <b>成绩 = 用时 + 罚时</b>
            <span>
              撞树 +{BUMP_PENALTY_MS / 1000} 秒；回光（E / 空格）+{PULSE_PENALTY_MS / 1000} 秒，
              最多 {MAX_PULSES} 次
            </span>
          </li>
        </ol>

        <button type="button" className="dj-primary" disabled={!canStart} onClick={onStart}>
          开始
        </button>

        {mode === 'daily' && authStatus === 'unauthenticated' && (
          <p className="dj-note">
            未登录也能玩，登录后成绩才会计入今日排行榜。
            <button type="button" className="dj-link" onClick={onLogin}>
              去登录
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
