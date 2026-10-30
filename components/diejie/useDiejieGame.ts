// Owns one play session of the maze: the game state (lib/diejie/game), the canvas
// renderer, keyboard / pointer input, and the ranked-run requests. The component
// that uses it only has to render panels from what it returns.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { signIn } from 'next-auth/react';
import {
  advance,
  canPulse,
  createGame,
  currentPenaltyMs,
  currentScoreMs,
  elapsedMs,
  move,
  pulse,
  startGame,
  type GameMode,
  type GameState,
  type Phase,
} from '../../lib/diejie/game';
import { shortestPathLength, type MazeWall } from '../../lib/diejie/maze';
import { DiejieRenderer } from '../../lib/diejie/renderer';
import { MAX_PULSES } from '../../lib/diejie/rules';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export type Hud = {
  phase: Phase;
  /** Time spent moving plus penalties: the number that ranks. */
  scoreMs: number;
  bumps: number;
  pulsesLeft: number;
  canPulse: boolean;
  previewLeftMs: number;
};

export type RunResult = {
  steps: number;
  bumps: number;
  pulses: number;
  timeMs: number;
  penaltyMs: number;
  scoreMs: number;
  /** Fewest steps the maze allows, for comparison with `steps`. */
  shortest: number;
};

export type Standing = {
  rank: number;
  total: number;
  scoreMs: number;
  timeMs: number;
  steps: number;
  bumps: number;
  pulses: number;
};

export type SubmitState =
  | { kind: 'idle' }
  | { kind: 'practice' }
  | { kind: 'guest' }
  | { kind: 'unranked'; reason: string }
  | { kind: 'submitting' }
  | { kind: 'done'; run: Omit<RunResult, 'shortest'>; best: Standing | null }
  | { kind: 'error'; message: string };

const DIR_KEYS: Record<string, MazeWall> = {
  ArrowUp: 'N',
  KeyW: 'N',
  ArrowDown: 'S',
  KeyS: 'S',
  ArrowLeft: 'W',
  KeyA: 'W',
  ArrowRight: 'E',
  KeyD: 'E',
};
const DIR_VEC: Record<MazeWall, [number, number]> = {
  N: [0, -1],
  S: [0, 1],
  E: [1, 0],
  W: [-1, 0],
};
/** Show the result panel a beat after the win, so the maze reveal is seen first. */
const RESULT_DELAY_MS = 1000;
/** Height kept free under the maze for the on-screen pad (portrait touch devices). */
const TOUCH_PAD_RESERVE = 210;

const randomSeed = () => Math.floor(Math.random() * 2 ** 32);
const vibrate = (pattern: number | number[]) => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
};

export function useDiejieGame({
  canvasRef,
  stageRef,
  authStatus,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  authStatus: AuthStatus;
}) {
  const rendererRef = useRef<DiejieRenderer | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const tokenRef = useRef<string | null>(null);
  const runIdRef = useRef(0);
  const authRef = useRef(authStatus);
  useEffect(() => {
    authRef.current = authStatus;
  }, [authStatus]);

  const [ready, setReady] = useState(false);
  const [mode, setModeState] = useState<GameMode>('daily');
  const modeRef = useRef<GameMode>('daily');
  const dailyRef = useRef<{ day: string; seed: number } | null>(null);
  const [daily, setDaily] = useState<{ day: string; seed: number } | null>(null);
  const [dailyFailed, setDailyFailed] = useState(false);
  const [phase, setPhase] = useState<Phase>('ready');
  const [hud, setHud] = useState<Hud | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [resultVisible, setResultVisible] = useState(false);
  const [submit, setSubmit] = useState<SubmitState>({ kind: 'idle' });
  const [reserve, setReserve] = useState(0);

  // ---- a fresh game ---------------------------------------------------------------
  const resetGame = useCallback((nextMode: GameMode, seed: number) => {
    runIdRef.current++;
    tokenRef.current = null;
    const game = createGame(seed, nextMode);
    gameRef.current = game;
    rendererRef.current?.reset(game);
    setPhase('ready');
    setHud(null);
    setResult(null);
    setResultVisible(false);
    setSubmit({ kind: 'idle' });
  }, []);

  /** The game for the chosen mode: today's maze, or a random one for practice. */
  const prepare = useCallback(
    (nextMode: GameMode) => {
      if (nextMode === 'practice') return resetGame('practice', randomSeed());
      const today = dailyRef.current;
      if (today) resetGame('daily', today.seed);
    },
    [resetGame],
  );

  // ---- today's maze ------------------------------------------------------------
  // Fetched once; the start screen shows today's maze as soon as it arrives.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/ugc/maze/daily', { credentials: 'same-origin' })
      .then((res) => res.json() as Promise<{ success?: boolean; day?: unknown; seed?: unknown }>)
      .then((data) => {
        if (cancelled) return;
        if (data.success && typeof data.day === 'string' && typeof data.seed === 'number') {
          dailyRef.current = { day: data.day, seed: data.seed };
          setDaily(dailyRef.current);
          if (modeRef.current === 'daily' && gameRef.current?.phase !== 'preview') {
            prepare('daily');
          }
        } else {
          throw new Error('no daily maze');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setDailyFailed(true);
        modeRef.current = 'practice';
        setModeState('practice');
        prepare('practice');
      });
    return () => {
      cancelled = true;
    };
  }, [prepare]);

  const setMode = useCallback(
    (next: GameMode) => {
      const game = gameRef.current;
      if (game && game.phase !== 'ready') return;
      modeRef.current = next;
      setModeState(next);
      prepare(next);
    },
    [prepare],
  );

  const restart = useCallback(() => prepare(modeRef.current), [prepare]);

  // ---- ranked run -------------------------------------------------------------------
  const beginRankedRun = useCallback(async (game: GameState) => {
    const run = ++runIdRef.current;
    try {
      const res = await fetch('/api/ugc/maze/start', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = (await res.json().catch(() => null)) as {
        token?: unknown;
        seed?: unknown;
      } | null;
      if (run !== runIdRef.current) return;
      // A new day can start while the page is open; that run would not be the maze played.
      if (res.ok && typeof data?.token === 'string' && data.seed === game.seed) {
        tokenRef.current = data.token;
      }
    } catch {
      // offline: the run plays on, it just is not ranked
    }
  }, []);

  const submitRun = useCallback(async (game: GameState) => {
    if (game.mode === 'practice') return setSubmit({ kind: 'practice' });
    if (authRef.current === 'unauthenticated') return setSubmit({ kind: 'guest' });
    const token = tokenRef.current;
    if (!token) {
      return setSubmit({
        kind: 'unranked',
        reason: '本局没有连上排行榜（或已跨天），成绩未提交',
      });
    }
    setSubmit({ kind: 'submitting' });
    try {
      // steps, penalties and time are all derived by the server from the run
      const res = await fetch('/api/ugc/maze/submit', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, moves: game.run }),
      });
      if (res.status === 401) return setSubmit({ kind: 'guest' });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        run?: Omit<RunResult, 'shortest'>;
        best?: Standing | null;
      } | null;
      if (data?.success && data.run) {
        setSubmit({ kind: 'done', run: data.run, best: data.best ?? null });
        window.dispatchEvent(new Event('maze-submission-updated'));
      } else {
        setSubmit({ kind: 'error', message: data?.error || `提交失败（${res.status}）` });
      }
    } catch (error) {
      setSubmit({ kind: 'error', message: error instanceof Error ? error.message : '网络异常' });
    }
  }, []);

  // ---- actions ------------------------------------------------------------------------
  const start = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.phase !== 'ready') return;
    const started = startGame(game, performance.now());
    gameRef.current = started;
    rendererRef.current?.centerLightOnPlayer();
    setPhase('preview');
    if (started.mode === 'daily' && authRef.current === 'authenticated') {
      void beginRankedRun(started);
    }
  }, [beginRankedRun]);

  const act = useCallback(
    (dir: MazeWall) => {
      const game = gameRef.current;
      const renderer = rendererRef.current;
      if (!game || !renderer) return;
      const now = performance.now();
      const { state, outcome } = move(game, dir, now);
      gameRef.current = state;
      if (outcome === 'ignored') return;
      if (outcome === 'bumped') {
        renderer.bump(state, dir, now);
        vibrate(25);
        return;
      }
      renderer.step(now);
      if (outcome === 'won') {
        renderer.win(now);
        vibrate([30, 40, 60]);
        const timeMs = elapsedMs(state, now);
        const local: RunResult = {
          steps: state.steps,
          bumps: state.bumps,
          pulses: state.pulses,
          timeMs,
          penaltyMs: currentPenaltyMs(state),
          scoreMs: currentScoreMs(state, now),
          shortest: shortestPathLength(state.maze),
        };
        setResult(local);
        setHud(null);
        setPhase('won');
        void submitRun(state);
        window.setTimeout(() => setResultVisible(true), RESULT_DELAY_MS);
      }
    },
    [submitRun],
  );

  const lantern = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    const now = performance.now();
    const next = pulse(game, now);
    if (next.pulses !== game.pulses) {
      gameRef.current = next;
      rendererRef.current?.pulse(now);
      vibrate(10);
    }
  }, []);

  const login = useCallback(() => {
    void signIn(undefined, { callbackUrl: '/diejie' });
  }, []);

  // ---- canvas, loop and input ---------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let renderer: DiejieRenderer;
    try {
      renderer = new DiejieRenderer(canvas, reduced);
    } catch (error) {
      console.error('diejie init failed', error);
      return;
    }
    rendererRef.current = renderer;

    const layout = () => {
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      const portrait = stage.clientHeight > stage.clientWidth;
      // on a phone held upright there is room under the maze for the touch pad
      const reserved = coarse && portrait ? TOUCH_PAD_RESERVE : 0;
      setReserve(reserved);
      renderer.layout(stage.clientWidth, stage.clientHeight - reserved);
    };
    // fold the resize bursts of a mobile address bar into one layout per frame
    let layoutQueued = false;
    const queueLayout = () => {
      if (layoutQueued) return;
      layoutQueued = true;
      requestAnimationFrame(() => {
        layoutQueued = false;
        layout();
      });
    };
    layout();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(queueLayout) : null;
    observer?.observe(stage);
    window.addEventListener('resize', queueLayout);

    // frame loop
    let raf = 0;
    let lastHud = 0;
    let announced = false;
    const frame = (now: number) => {
      if (!announced) {
        announced = true;
        setReady(true);
      }
      const game = gameRef.current;
      if (game) {
        const advanced = advance(game, now);
        if (advanced !== game) {
          gameRef.current = advanced;
          setPhase(advanced.phase);
        }
        renderer.render(advanced, now);
        if ((advanced.phase === 'preview' || advanced.phase === 'playing') && now - lastHud > 100) {
          lastHud = now;
          const next: Hud = {
            phase: advanced.phase,
            scoreMs: Math.floor(currentScoreMs(advanced, now) / 100) * 100,
            bumps: advanced.bumps,
            pulsesLeft: MAX_PULSES - advanced.pulses,
            canPulse: canPulse(advanced, now),
            previewLeftMs:
              advanced.phase === 'preview' ? Math.max(0, advanced.previewEndsAt - now) : 0,
          };
          setHud((prev) =>
            prev &&
            prev.phase === next.phase &&
            prev.scoreMs === next.scoreMs &&
            prev.bumps === next.bumps &&
            prev.pulsesLeft === next.pulsesLeft &&
            prev.canPulse === next.canPulse &&
            Math.ceil(prev.previewLeftMs / 1000) === Math.ceil(next.previewLeftMs / 1000)
              ? prev
              : next,
          );
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(frame);
    };
    document.addEventListener('visibilitychange', onVisibility);

    // keyboard: arrows / WASD walk (or steer the light during the preview), E / F / Space = lantern
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const game = gameRef.current;
      if (!game || (game.phase !== 'preview' && game.phase !== 'playing')) return;
      const dir = DIR_KEYS[e.code];
      if (dir) {
        e.preventDefault();
        if (game.phase === 'preview') {
          const [dx, dy] = DIR_VEC[dir];
          renderer.nudgeLight(dx, dy);
        } else {
          act(dir);
        }
      } else if ((e.code === 'KeyE' || e.code === 'KeyF' || e.code === 'Space') && !e.repeat) {
        e.preventDefault();
        lantern();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    // pointer: moves the light during the preview; touch / pen drags walk the maze
    let anchor: { x: number; y: number } | null = null;
    const onPointerDown = (e: PointerEvent) => {
      renderer.refreshRect();
      renderer.setPointerFromClient(e.clientX, e.clientY);
      if (e.pointerType !== 'mouse') anchor = { x: e.clientX, y: e.clientY };
    };
    const onPointerMove = (e: PointerEvent) => {
      renderer.setPointerFromClient(e.clientX, e.clientY);
      const game = gameRef.current;
      if (!anchor || !game || game.phase !== 'playing') return;
      const dx = e.clientX - anchor.x;
      const dy = e.clientY - anchor.y;
      const threshold = renderer.cell * 0.55;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;
      act(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N');
      anchor = { x: e.clientX, y: e.clientY };
    };
    const onPointerEnd = () => {
      anchor = null;
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerEnd);
    canvas.addEventListener('pointercancel', onPointerEnd);

    // Handlers above read the latest game through refs, so this effect runs once.
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener('resize', queueLayout);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerEnd);
      canvas.removeEventListener('pointercancel', onPointerEnd);
      rendererRef.current = null;
    };
  }, [act, lantern, canvasRef, stageRef]);

  return {
    ready,
    reserve,
    mode,
    setMode,
    daily,
    dailyFailed,
    phase,
    hud,
    result,
    resultVisible,
    submit,
    start,
    restart,
    act,
    lantern,
    login,
  };
}
