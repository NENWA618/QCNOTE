// End to end through the real hook, state machine and panels; only the canvas
// renderer, the session and the network are stubbed.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import DiejieGame from '../components/diejie/DiejieGame';
import { MAZE_COLS, MAZE_ROWS, MOVE_DELTAS, generateMaze, mulberry32 } from '../lib/diejie/maze';
import type { MazeWall } from '../lib/diejie/maze';
import { PREVIEW_MS } from '../lib/diejie/rules';

const session = vi.hoisted(() => ({ status: 'authenticated' as string }));
vi.mock('next-auth/react', () => ({
  useSession: () => ({ status: session.status }),
  signIn: vi.fn(),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('../lib/diejie/renderer', () => ({
  DiejieRenderer: class {
    cell = 50;
    layout() {
      return 50;
    }
    refreshRect() {}
    reset() {}
    setMaze() {}
    setPointerFromClient() {}
    centerLightOnPlayer() {}
    nudgeLight() {}
    step() {}
    bump() {}
    pulse() {}
    win() {}
    render() {}
  },
}));

const SEED = 42;
const KEY: Record<MazeWall, string> = { N: 'KeyW', S: 'KeyS', E: 'KeyD', W: 'KeyA' };

function route(seed: number): MazeWall[] {
  const maze = generateMaze(MAZE_ROWS, MAZE_COLS, mulberry32(seed));
  const prev = new Map<string, [string, MazeWall]>();
  const queue: Array<[number, number]> = [[0, 0]];
  const seen = new Set(['0,0']);
  for (let i = 0; i < queue.length; i++) {
    const [r, c] = queue[i];
    for (const dir of ['N', 'E', 'S', 'W'] as MazeWall[]) {
      const [dr, dc] = MOVE_DELTAS[dir];
      const nr = r + dr;
      const nc = c + dc;
      if (maze[r][c][dir] || nr < 0 || nr >= MAZE_ROWS || nc < 0 || nc >= MAZE_COLS) continue;
      if (seen.has(`${nr},${nc}`)) continue;
      seen.add(`${nr},${nc}`);
      prev.set(`${nr},${nc}`, [`${r},${c}`, dir]);
      queue.push([nr, nc]);
    }
  }
  const out: MazeWall[] = [];
  for (let at = `${MAZE_ROWS - 1},${MAZE_COLS - 1}`; at !== '0,0';) {
    const [from, dir] = prev.get(at)!;
    out.unshift(dir);
    at = from;
  }
  return out;
}

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

let calls: Array<{ url: string; body?: string }>;

function stubNetwork() {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string | undefined });
      if (url.endsWith('/maze/daily'))
        return json({ success: true, day: '2026-10-30', seed: SEED });
      if (url.endsWith('/maze/start')) return json({ success: true, token: 'tok', seed: SEED });
      if (url.endsWith('/maze/submit')) {
        return json({
          success: true,
          run: { steps: 0, bumps: 1, pulses: 1, timeMs: 9000, penaltyMs: 7000, scoreMs: 16000 },
          best: { rank: 3, total: 10, scoreMs: 16000, timeMs: 9000, steps: 0, bumps: 1, pulses: 1 },
        });
      }
      return json({}, 404);
    }),
  );
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const press = (code: string) => fireEvent.keyDown(window, { code });

beforeEach(() => {
  session.status = 'authenticated';
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
      'Date',
    ],
  });
  stubNetwork();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('DiejieGame', () => {
  it('plays a ranked daily run and shows the server verdict', async () => {
    render(<DiejieGame />);
    await flush(50);

    // today's maze arrives and the start screen names the day
    expect(screen.getByText(/10 月 30 日/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '开始' }));
    await flush(0);
    expect(calls.some((c) => c.url.endsWith('/maze/start'))).toBe(true);

    // movement is locked for the preview, then unlocks
    press(KEY.E);
    await flush(PREVIEW_MS + 100);

    press(KEY.W); // into the outer wall: a bump
    press('KeyE'); // lantern pulse
    for (const dir of route(SEED)) {
      press(KEY[dir]);
      await flush(40);
    }
    await flush(1100);

    // the result panel appears and the run was submitted as played
    expect(screen.getByText('已找到出口')).toBeTruthy();
    expect(screen.getByText(/今日第/)).toBeTruthy();
    const submit = calls.find((c) => c.url.endsWith('/maze/submit'))!;
    const sent = JSON.parse(submit.body!) as { token: string; moves: string };
    expect(sent.token).toBe('tok');
    expect(sent.moves).toBe('wL' + route(SEED).join(''));
  });

  it('lets a guest play but does not submit, and offers to log in', async () => {
    session.status = 'unauthenticated';
    render(<DiejieGame />);
    await flush(50);
    expect(screen.getByText(/登录后成绩才会计入/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '开始' }));
    await flush(PREVIEW_MS + 100);
    for (const dir of route(SEED)) {
      press(KEY[dir]);
      await flush(40);
    }
    await flush(1100);

    expect(screen.getByRole('button', { name: '登录后挑战计入排行榜' })).toBeTruthy();
    expect(calls.some((c) => c.url.endsWith('/maze/start'))).toBe(false);
    expect(calls.some((c) => c.url.endsWith('/maze/submit'))).toBe(false);
  });

  it('practice mode never touches the ranked endpoints', async () => {
    render(<DiejieGame />);
    await flush(50);
    fireEvent.click(screen.getByRole('tab', { name: '自由练习' }));
    fireEvent.click(screen.getByRole('button', { name: '开始' }));
    await flush(PREVIEW_MS + 100);
    expect(calls.some((c) => c.url.endsWith('/maze/start'))).toBe(false);
    expect(screen.getByText(/回光/)).toBeTruthy();
  });

  it('falls back to practice when today’s maze cannot be fetched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    render(<DiejieGame />);
    await flush(50);
    expect(screen.getByText(/只能自由练习/)).toBeTruthy();
    expect((screen.getByRole('tab', { name: '每日挑战' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: '开始' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});
