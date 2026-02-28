import IDB from './idb';

export interface ProgressState {
  xp: number;
  level: number;
  affection: number; // 0-100
  lastDecay: number; // timestamp
}

const PROG_KEY = 'NOTE_PROGRESSION';

const BASE_XP = 100;
const AFFECTION_DECAY_RATE = 1; // point per day

async function loadProgress(): Promise<ProgressState> {
  const data = await IDB.getItem<ProgressState>(PROG_KEY);
  if (data) return data;
  const init: ProgressState = { xp: 0, level: 1, affection: 50, lastDecay: Date.now() };
  await saveProgress(init);
  return init;
}

async function saveProgress(state: ProgressState): Promise<void> {
  await IDB.setItem(PROG_KEY, state);
}

function xpForNext(level: number): number {
  return BASE_XP * level;
}

async function addXp(amount: number): Promise<ProgressState> {
  const state = await loadProgress();
  state.xp += amount;
  while (state.xp >= xpForNext(state.level)) {
    state.xp -= xpForNext(state.level);
    state.level += 1;
  }
  await saveProgress(state);
  return state;
}

async function addAffection(amount: number): Promise<ProgressState> {
  const state = await loadProgress();
  state.affection = Math.max(0, Math.min(100, state.affection + amount));
  await saveProgress(state);
  return state;
}

async function decayAffection(): Promise<ProgressState> {
  const state = await loadProgress();
  const now = Date.now();
  const days = Math.floor((now - state.lastDecay) / (24 * 3600 * 1000));
  if (days > 0) {
    state.affection = Math.max(0, state.affection - days * AFFECTION_DECAY_RATE);
    state.lastDecay = now;
    await saveProgress(state);
  }
  return state;
}

export default {
  loadProgress,
  saveProgress,
  addXp,
  addAffection,
  decayAffection,
  xpForNext,
};
