import { describe, it, expect } from 'vitest';
import {
  advance,
  canPulse,
  createGame,
  currentScoreMs,
  elapsedMs,
  move,
  pulse,
  startGame,
  type GameState,
} from '../lib/diejie/game';
import { replayRun } from '../lib/diejie/run';
import { MAX_PULSES, PREVIEW_MS, BUMP_PENALTY_MS, PULSE_PENALTY_MS } from '../lib/diejie/rules';
import type { MazeWall } from '../lib/diejie/maze';

const T0 = 1_000_000;
const PLAY = T0 + PREVIEW_MS;

function bfsRoute(state: GameState): MazeWall[] {
  const { maze } = state;
  const rows = maze.length;
  const cols = maze[0].length;
  const d: Record<MazeWall, [number, number]> = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] };
  const prev = new Map<string, [string, MazeWall]>();
  const q: Array<[number, number]> = [[0, 0]];
  const seen = new Set(['0,0']);
  for (let i = 0; i < q.length; i++) {
    const [r, c] = q[i];
    for (const dir of ['N', 'E', 'S', 'W'] as MazeWall[]) {
      const nr = r + d[dir][0];
      const nc = c + d[dir][1];
      if (maze[r][c][dir] || nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (seen.has(`${nr},${nc}`)) continue;
      seen.add(`${nr},${nc}`);
      prev.set(`${nr},${nc}`, [`${r},${c}`, dir]);
      q.push([nr, nc]);
    }
  }
  const out: MazeWall[] = [];
  for (let at = `${rows - 1},${cols - 1}`; at !== '0,0';) {
    const [from, dir] = prev.get(at)!;
    out.unshift(dir);
    at = from;
  }
  return out;
}

describe('game state machine', () => {
  it('locks movement during the preview, then unlocks it', () => {
    const ready = createGame(5, 'daily');
    expect(move(ready, 'E', T0).outcome).toBe('ignored');

    const previewing = startGame(ready, T0);
    expect(previewing.phase).toBe('preview');
    expect(move(previewing, 'E', T0 + PREVIEW_MS - 1).outcome).toBe('ignored');
    expect(advance(previewing, PLAY).phase).toBe('playing');
    // the clock starts when movement unlocks, not when the player first moves
    expect(elapsedMs(advance(previewing, PLAY + 2500), PLAY + 2500)).toBe(2500);
  });

  it('counts a bump into a tree without moving', () => {
    let s = advance(startGame(createGame(5, 'daily'), T0), PLAY);
    const result = move(s, 'W', PLAY + 100);
    expect(result.outcome).toBe('bumped');
    s = result.state;
    expect([s.r, s.c, s.steps, s.bumps, s.run]).toEqual([0, 0, 0, 1, 'w']);
  });

  it('limits and spaces out lantern pulses', () => {
    let s = advance(startGame(createGame(5, 'daily'), T0), PLAY);
    expect(canPulse(s, PLAY)).toBe(true);
    s = pulse(s, PLAY);
    expect(s.pulses).toBe(1);
    expect(canPulse(s, PLAY + 100)).toBe(false); // still lit
    s = pulse(s, PLAY + 100);
    expect(s.pulses).toBe(1);
    s = pulse(s, PLAY + 5000);
    s = pulse(s, PLAY + 10000);
    expect(s.pulses).toBe(MAX_PULSES);
    expect(canPulse(s, PLAY + 20000)).toBe(false);
  });

  it('wins at the exit and produces a run the server accepts', () => {
    let s = advance(startGame(createGame(9, 'daily'), T0), PLAY);
    s = move(s, 'W', PLAY + 50).state; // bump
    s = pulse(s, PLAY + 100);
    const route = bfsRoute(s);
    let outcome = 'ignored';
    route.forEach((dir, i) => {
      const r = move(s, dir, PLAY + 1000 + i * 100);
      s = r.state;
      outcome = r.outcome;
    });
    expect(outcome).toBe('won');
    expect(s.phase).toBe('won');
    expect(move(s, 'E', PLAY + 99999).outcome).toBe('ignored');
    expect(replayRun(s.maze, s.run)).toEqual({ steps: route.length, bumps: 1, pulses: 1 });
    expect(currentScoreMs(s, 0)).toBe(
      s.finishedAt - s.playStartedAt + BUMP_PENALTY_MS + PULSE_PENALTY_MS,
    );
  });
});
