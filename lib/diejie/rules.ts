// Rules shared by the client and the server that verifies ranked runs.

/** The light preview: the maze is visible under the cursor, movement is locked. */
export const PREVIEW_MS = 5000;
/** Walking into a tree costs this much time on the final score. */
export const BUMP_PENALTY_MS = 3000;
/** Each lantern pulse costs this much time on the final score. */
export const PULSE_PENALTY_MS = 4000;
/** Lantern pulses allowed per run. */
export const MAX_PULSES = 2;
/** How long one pulse keeps the surroundings lit. */
export const PULSE_DURATION_MS = 1400;
/** Light radii, in cells. */
export const PREVIEW_LIGHT_CELLS = 2.3;
export const PULSE_LIGHT_CELLS = 1.9;

/**
 * The ranked score: the time spent moving plus the penalties, in ms. Lower wins.
 * `timeMs` runs from the moment movement unlocks to the moment the exit is reached.
 */
export function scoreMs(timeMs: number, bumps: number, pulses: number) {
  return Math.round(timeMs) + bumps * BUMP_PENALTY_MS + pulses * PULSE_PENALTY_MS;
}

export function penaltyMs(bumps: number, pulses: number) {
  return bumps * BUMP_PENALTY_MS + pulses * PULSE_PENALTY_MS;
}

/** Time as m:ss.t, e.g. 1:07.4, used for scores where tenths matter. */
export function fmtScore(ms: number) {
  const tenths = Math.floor(Math.max(0, ms) / 100);
  const m = Math.floor(tenths / 600);
  const s = Math.floor((tenths % 600) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${tenths % 10}`;
}
