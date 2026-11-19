import { describe, it, expect } from 'vitest';
import {
  MAZE_COLS,
  MAZE_ROWS,
  generateMaze,
  mulberry32,
  replayMazeMoves,
  type MazeCell,
  type MazeWall,
} from '../lib/diejie/maze';

const DELTAS: Record<MazeWall, [number, number]> = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] };

/** Shortest route from the entrance to the exit, as a moves string. */
function solve(cells: MazeCell[][]): string {
  const rows = cells.length;
  const cols = cells[0].length;
  const prev = new Map<string, [string, MazeWall]>();
  const queue: [number, number][] = [[0, 0]];
  const seen = new Set(['0,0']);
  while (queue.length) {
    const [r, c] = queue.shift()!;
    if (r === rows - 1 && c === cols - 1) break;
    for (const dir of ['N', 'E', 'S', 'W'] as MazeWall[]) {
      const [dr, dc] = DELTAS[dir];
      const nr = r + dr;
      const nc = c + dc;
      if (cells[r][c][dir] || nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (seen.has(`${nr},${nc}`)) continue;
      seen.add(`${nr},${nc}`);
      prev.set(`${nr},${nc}`, [`${r},${c}`, dir]);
      queue.push([nr, nc]);
    }
  }
  let path = '';
  for (let at = `${rows - 1},${cols - 1}`; at !== '0,0';) {
    const [from, dir] = prev.get(at)!;
    path = dir + path;
    at = from;
  }
  return path;
}

const mazeFor = (seed: number) => generateMaze(MAZE_ROWS, MAZE_COLS, mulberry32(seed));

describe('maze run verification', () => {
  it('rebuilds the same maze from the same seed', () => {
    expect(mazeFor(42)).toEqual(mazeFor(42));
    expect(mazeFor(42)).not.toEqual(mazeFor(43));
  });

  it('accepts moves that walk from the entrance to the exit, counting the steps', () => {
    const maze = mazeFor(7);
    const route = solve(maze);
    expect(replayMazeMoves(maze, route)).toBe(route.length);

    // a detour that steps back and forth still counts every step
    const [first] = route;
    const back = { N: 'S', S: 'N', E: 'W', W: 'E' }[first]!;
    const detour = first + back + route;
    expect(replayMazeMoves(maze, detour)).toBe(detour.length);
  });

  it('rejects moves through a wall, off the grid, short of the exit, or past it', () => {
    const maze = mazeFor(7);
    const route = solve(maze);

    // walking off the top edge at the entrance
    expect(replayMazeMoves(maze, 'N' + route)).toBeNull();
    // stopping one step early
    expect(replayMazeMoves(maze, route.slice(0, -1))).toBeNull();
    // carrying on after reaching the exit
    const lastBack = { N: 'S', S: 'N', E: 'W', W: 'E' }[route.at(-1)!]!;
    expect(replayMazeMoves(maze, route + lastBack)).toBeNull();
    // the route of another maze generally crosses a wall here
    expect(replayMazeMoves(mazeFor(8), route)).toBeNull();
    expect(replayMazeMoves(maze, '')).toBeNull();
    expect(replayMazeMoves(maze, 'X')).toBeNull();
  });
});
