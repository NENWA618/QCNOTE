// The game as a pure state machine: no DOM, no canvas, no timers. Every function
// takes the current time as an argument and returns a new state, so rules can be
// tested directly and the renderer / input layers stay thin.
import {
  MAZE_COLS,
  MAZE_ROWS,
  MOVE_DELTAS,
  generateMaze,
  mulberry32,
  type MazeCell,
  type MazeWall,
} from './maze';
import { MAX_PULSES, PREVIEW_MS, PULSE_DURATION_MS, penaltyMs, scoreMs } from './rules';
import { bumpToken } from './run';

export type GameMode = 'daily' | 'practice';
export type Phase = 'ready' | 'preview' | 'playing' | 'won';

export type GameState = {
  mode: GameMode;
  seed: number;
  maze: MazeCell[][];
  phase: Phase;
  r: number;
  c: number;
  steps: number;
  bumps: number;
  pulses: number;
  /** The run so far, in the token format of ./run.ts (what gets submitted). */
  run: string;
  previewEndsAt: number;
  /** When movement unlocked; the clock for the score starts here. */
  playStartedAt: number;
  finishedAt: number;
  pulseUntil: number;
};

export type MoveOutcome = 'moved' | 'bumped' | 'won' | 'ignored';

export function createGame(seed: number, mode: GameMode): GameState {
  return {
    mode,
    seed,
    maze: generateMaze(MAZE_ROWS, MAZE_COLS, mulberry32(seed)),
    phase: 'ready',
    r: 0,
    c: 0,
    steps: 0,
    bumps: 0,
    pulses: 0,
    run: '',
    previewEndsAt: 0,
    playStartedAt: 0,
    finishedAt: 0,
    pulseUntil: 0,
  };
}

export function startGame(state: GameState, now: number): GameState {
  if (state.phase !== 'ready') return state;
  return { ...state, phase: 'preview', previewEndsAt: now + PREVIEW_MS };
}

/** Moves the preview on to the playing phase once its time is up. */
export function advance(state: GameState, now: number): GameState {
  if (state.phase === 'preview' && now >= state.previewEndsAt) {
    return { ...state, phase: 'playing', playStartedAt: state.previewEndsAt };
  }
  return state;
}

export function move(
  input: GameState,
  dir: MazeWall,
  now: number,
): { state: GameState; outcome: MoveOutcome } {
  const state = advance(input, now);
  if (state.phase !== 'playing') return { state, outcome: 'ignored' };

  const [dr, dc] = MOVE_DELTAS[dir];
  const nr = state.r + dr;
  const nc = state.c + dc;
  const blocked =
    state.maze[state.r][state.c][dir] || nr < 0 || nr >= MAZE_ROWS || nc < 0 || nc >= MAZE_COLS;
  if (blocked) {
    return {
      state: { ...state, bumps: state.bumps + 1, run: state.run + bumpToken(dir) },
      outcome: 'bumped',
    };
  }

  const next = { ...state, r: nr, c: nc, steps: state.steps + 1, run: state.run + dir };
  if (nr === MAZE_ROWS - 1 && nc === MAZE_COLS - 1) {
    return { state: { ...next, phase: 'won', finishedAt: now }, outcome: 'won' };
  }
  return { state: next, outcome: 'moved' };
}

export function canPulse(state: GameState, now: number) {
  return state.phase === 'playing' && state.pulses < MAX_PULSES && now >= state.pulseUntil;
}

export function pulse(input: GameState, now: number): GameState {
  const state = advance(input, now);
  if (!canPulse(state, now)) return state;
  return {
    ...state,
    pulses: state.pulses + 1,
    run: state.run + 'L',
    pulseUntil: now + PULSE_DURATION_MS,
  };
}

/** Time spent moving, from unlock to now (or to the exit once won). */
export function elapsedMs(state: GameState, now: number) {
  if (state.phase === 'won') return state.finishedAt - state.playStartedAt;
  if (state.phase !== 'playing') return 0;
  return Math.max(0, now - state.playStartedAt);
}

export function currentPenaltyMs(state: GameState) {
  return penaltyMs(state.bumps, state.pulses);
}

export function currentScoreMs(state: GameState, now: number) {
  return scoreMs(elapsedMs(state, now), state.bumps, state.pulses);
}
