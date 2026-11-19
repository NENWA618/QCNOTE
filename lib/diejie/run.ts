// A ranked run is a string of tokens, one per action the player took after the
// preview ended. The server replays it against the maze rebuilt from the run's
// seed, so the numbers on the leaderboard are derived, not reported.
//
//   N E S W  a step that moved the player
//   n e s w  an attempt into a tree (or off the grid) that did not move them
//   L        a lantern pulse
import { MAX_PULSES } from './rules';
import type { MazeCell, MazeWall } from './maze';

/** Generous upper bound on a run's length; a real 7×11 run is far shorter. */
export const RUN_PATTERN = /^[NESWneswL]{1,5000}$/;

export type RunTally = { steps: number; bumps: number; pulses: number };

const DELTAS: Record<MazeWall, [number, number]> = {
  N: [-1, 0],
  S: [1, 0],
  E: [0, 1],
  W: [0, -1],
};

export const bumpToken = (dir: MazeWall) => dir.toLowerCase();

/**
 * Replays a run from the entrance. Returns the tally if every step went through
 * an open wall, every bump really hit a wall, no more than MAX_PULSES pulses were
 * used, and the last token — and only the last — reached the exit; otherwise null.
 */
export function replayRun(cells: MazeCell[][], run: string): RunTally | null {
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;
  let r = 0;
  let c = 0;
  let steps = 0;
  let bumps = 0;
  let pulses = 0;
  for (const token of run) {
    if (r === rows - 1 && c === cols - 1) return null; // kept going after the exit
    if (token === 'L') {
      pulses++;
      if (pulses > MAX_PULSES) return null;
      continue;
    }
    const isBump = token >= 'a' && token <= 'z';
    const dir = token.toUpperCase() as MazeWall;
    const delta = DELTAS[dir];
    if (!delta) return null;
    const nr = r + delta[0];
    const nc = c + delta[1];
    const blocked = cells[r][c][dir] || nr < 0 || nr >= rows || nc < 0 || nc >= cols;
    if (isBump) {
      if (!blocked) return null; // claimed a bump where the way was open
      bumps++;
      continue;
    }
    if (blocked) return null;
    r = nr;
    c = nc;
    steps++;
  }
  return r === rows - 1 && c === cols - 1 ? { steps, bumps, pulses } : null;
}
