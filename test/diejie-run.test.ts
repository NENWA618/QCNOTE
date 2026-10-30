import { describe, it, expect } from 'vitest';
import {
  MAZE_COLS,
  MAZE_ROWS,
  generateMaze,
  mulberry32,
  shortestPathLength,
  type MazeCell,
  type MazeWall,
} from '../lib/diejie/maze';
import { RUN_PATTERN, replayRun } from '../lib/diejie/run';
import {
  BUMP_PENALTY_MS,
  MAX_PULSES,
  PULSE_PENALTY_MS,
  fmtScore,
  scoreMs,
} from '../lib/diejie/rules';

const DELTAS: Record<MazeWall, [number, number]> = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] };
const mazeFor = (seed: number) => generateMaze(MAZE_ROWS, MAZE_COLS, mulberry32(seed));

/** Shortest route as a moves string. */
function solve(cells: MazeCell[][]): string {
  const prev = new Map<string, [string, MazeWall]>();
  const queue: [number, number][] = [[0, 0]];
  const seen = new Set(['0,0']);
  for (let i = 0; i < queue.length; i++) {
    const [r, c] = queue[i];
    for (const dir of ['N', 'E', 'S', 'W'] as MazeWall[]) {
      const [dr, dc] = DELTAS[dir];
      const nr = r + dr;
      const nc = c + dc;
      if (cells[r][c][dir] || nr < 0 || nr >= MAZE_ROWS || nc < 0 || nc >= MAZE_COLS) continue;
      if (seen.has(`${nr},${nc}`)) continue;
      seen.add(`${nr},${nc}`);
      prev.set(`${nr},${nc}`, [`${r},${c}`, dir]);
      queue.push([nr, nc]);
    }
  }
  let path = '';
  for (let at = `${MAZE_ROWS - 1},${MAZE_COLS - 1}`; at !== '0,0';) {
    const [from, dir] = prev.get(at)!;
    path = dir + path;
    at = from;
  }
  return path;
}

/** A direction that is blocked at the entrance cell (it always has a tree on W). */
const BLOCKED_AT_START = 'w';

describe('replayRun', () => {
  it('counts steps, bumps and pulses of a valid run', () => {
    const maze = mazeFor(7);
    const route = solve(maze);
    expect(replayRun(maze, route)).toEqual({ steps: route.length, bumps: 0, pulses: 0 });

    const noisy = BLOCKED_AT_START + 'L' + route.slice(0, 3) + 'L' + route.slice(3);
    expect(replayRun(maze, noisy)).toEqual({ steps: route.length, bumps: 1, pulses: 2 });
  });

  it('rejects a bump claimed where the way is open', () => {
    const maze = mazeFor(7);
    const route = solve(maze);
    const fakeBump = route[0].toLowerCase();
    expect(replayRun(maze, fakeBump + route)).toBeNull();
  });

  it('rejects a step through a tree, short of the exit, or past it', () => {
    const maze = mazeFor(7);
    const route = solve(maze);
    expect(replayRun(maze, 'W' + route)).toBeNull();
    expect(replayRun(maze, route.slice(0, -1))).toBeNull();
    expect(replayRun(maze, route + 'L')).toBeNull();
    expect(replayRun(maze, '')).toBeNull();
  });

  it('allows at most MAX_PULSES pulses', () => {
    const maze = mazeFor(7);
    const route = solve(maze);
    const ok = 'L'.repeat(MAX_PULSES) + route;
    expect(replayRun(maze, ok)?.pulses).toBe(MAX_PULSES);
    expect(replayRun(maze, 'L' + ok)).toBeNull();
  });

  it('only accepts the token alphabet', () => {
    expect(RUN_PATTERN.test('NESWneswL')).toBe(true);
    expect(RUN_PATTERN.test('NX')).toBe(false);
    expect(RUN_PATTERN.test('')).toBe(false);
  });
});

describe('scoring', () => {
  it('adds penalties to the time spent', () => {
    expect(scoreMs(10000, 2, 1)).toBe(10000 + 2 * BUMP_PENALTY_MS + PULSE_PENALTY_MS);
    expect(fmtScore(67400)).toBe('1:07.4');
    expect(fmtScore(-5)).toBe('0:00.0');
  });

  it('knows the shortest route length', () => {
    const maze = mazeFor(11);
    expect(shortestPathLength(maze)).toBe(solve(maze).length);
  });
});
