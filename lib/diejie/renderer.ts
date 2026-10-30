// Canvas renderer for the 叠界 · 光域迷宫. It only draws: game rules live in ./game.
// The page feeds it the current GameState every frame and calls the small effect
// hooks (step / bump / pulse / win) when something happens.
import { drawPlantAt, drawTreeAt } from './decor';
import type { GameState } from './game';
import {
  MAZE_COLS,
  MAZE_ROWS,
  cellCenterAt,
  wallMidAt,
  type MazeCell,
  type MazeWall,
} from './maze';
import { PREVIEW_LIGHT_CELLS, PULSE_DURATION_MS, PULSE_LIGHT_CELLS } from './rules';

const DIRS: MazeWall[] = ['N', 'E', 'S', 'W'];
/** The preview light dims over its last stretch so the end is felt coming. */
const LIGHT_FADE_MS = 800;
/** After the preview ends, what the light touched lingers and fades. */
const AFTERGLOW_MS = 1200;
const SHAKE_MS = 280;
const TRAIL_MS = 1100;

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  size: number;
  rgb: string;
};
type Ripple = { x: number; y: number; born: number; life: number; maxR: number; rgb: string };
type Firefly = { x: number; y: number; ox: number; oy: number; speed: number; phase: number };

function makeCanvas() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  return { canvas, ctx };
}

export class DiejieRenderer {
  private ctx: CanvasRenderingContext2D;
  private bg = makeCanvas();
  private decor = makeCanvas();
  private mask = makeCanvas();
  private reveal = makeCanvas();
  private memory = makeCanvas();

  private dpr: number;
  private rect: DOMRect;
  cell = 56;
  private W = MAZE_COLS * 56;
  private H = MAZE_ROWS * 56;

  private maze: MazeCell[][] | null = null;
  private px = 0;
  private py = 0;
  private pointer = { x: -9999, y: -9999, on: false };

  private lastFrame = 0;
  private lastPhase: GameState['phase'] = 'ready';
  private afterglowAt = 0;
  private shakeAt = -Infinity;
  private winAt = 0;
  private particles: Particle[] = [];
  private ripples: Ripple[] = [];
  private trail: Array<{ x: number; y: number; born: number }> = [];
  private fireflies: Firefly[] = [];
  private builtCell = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private reducedMotion = false,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available');
    this.ctx = ctx;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.rect = canvas.getBoundingClientRect();
  }

  /** Sizes the canvas to fit the available space; returns the cell size in px. */
  layout(availW: number, availH: number) {
    const cell = Math.max(
      26,
      Math.min(Math.floor(availW / MAZE_COLS), Math.floor(availH / MAZE_ROWS), 120),
    );
    // keep the player and the light where they were, whatever the new size
    const scale = cell / this.cell;
    this.px *= scale;
    this.py *= scale;
    this.pointer.x *= scale;
    this.pointer.y *= scale;
    if (scale !== 1) {
      this.particles = [];
      this.ripples = [];
      this.trail = [];
    }
    this.cell = cell;
    this.W = MAZE_COLS * cell;
    this.H = MAZE_ROWS * cell;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { canvas } = this;
    canvas.style.width = `${this.W}px`;
    canvas.style.height = `${this.H}px`;
    canvas.width = this.W * this.dpr;
    canvas.height = this.H * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Offscreen layers are expensive to rebuild (gradients, shadows), so only do it
    // when the cell size really changed — not on every mobile address-bar wobble.
    if (cell !== this.builtCell) {
      for (const layer of [this.bg, this.decor, this.mask, this.reveal, this.memory]) {
        layer.canvas.width = this.W;
        layer.canvas.height = this.H;
      }
      this.buildBackground();
      if (this.maze) this.buildDecor();
      this.initFireflies();
      this.builtCell = cell;
    }
    this.rect = canvas.getBoundingClientRect();
    return cell;
  }

  refreshRect() {
    this.rect = this.canvas.getBoundingClientRect();
  }

  setMaze(maze: MazeCell[][]) {
    this.maze = maze;
    this.memory.ctx.clearRect(0, 0, this.W, this.H);
    this.buildDecor();
  }

  /** Clears effects and puts the player back on the entrance. */
  reset(state: GameState) {
    const p = cellCenterAt(this.cell, state.r, state.c);
    this.px = p.x;
    this.py = p.y;
    this.pointer = { x: -9999, y: -9999, on: false };
    this.particles = [];
    this.ripples = [];
    this.trail = [];
    this.afterglowAt = 0;
    this.shakeAt = -Infinity;
    this.winAt = 0;
    this.lastPhase = 'ready';
    this.memory.ctx.clearRect(0, 0, this.W, this.H);
  }

  // ---- input helpers -------------------------------------------------------

  setPointerFromClient(clientX: number, clientY: number) {
    const { rect } = this;
    this.pointer.x = ((clientX - rect.left) * this.W) / rect.width;
    this.pointer.y = ((clientY - rect.top) * this.H) / rect.height;
    this.pointer.on = true;
  }

  /** Puts the light on the player (start of the preview) or nudges it by keyboard. */
  centerLightOnPlayer() {
    this.pointer = { x: this.px, y: this.py, on: true };
  }

  nudgeLight(dx: number, dy: number) {
    if (!this.pointer.on) this.centerLightOnPlayer();
    this.pointer.x = Math.max(0, Math.min(this.W, this.pointer.x + dx * this.cell * 0.6));
    this.pointer.y = Math.max(0, Math.min(this.H, this.pointer.y + dy * this.cell * 0.6));
  }

  // ---- effects ---------------------------------------------------------------

  step(now: number) {
    this.trail.push({ x: this.px, y: this.py, born: now });
    if (this.trail.length > 24) this.trail.shift();
  }

  bump(state: GameState, dir: MazeWall, now: number) {
    const mid = wallMidAt(this.cell, state.r, state.c, dir);
    this.shakeAt = now;
    this.ripples.push({
      x: mid.x,
      y: mid.y,
      born: now,
      life: 520,
      maxR: this.cell * 0.5,
      rgb: '229,72,77',
    });
    this.burst(mid.x, mid.y, 9, '229,72,77', now, 0.16);
  }

  pulse(now: number) {
    this.ripples.push({
      x: this.px,
      y: this.py,
      born: now,
      life: 700,
      maxR: this.cell * PULSE_LIGHT_CELLS,
      rgb: '166,243,217',
    });
  }

  win(now: number) {
    this.winAt = now;
    const exit = cellCenterAt(this.cell, MAZE_ROWS - 1, MAZE_COLS - 1);
    this.ripples.push({
      x: exit.x,
      y: exit.y,
      born: now,
      life: 1100,
      maxR: this.cell * 3.2,
      rgb: '242,201,76',
    });
    this.burst(exit.x, exit.y, 28, '242,201,76', now, 0.28);
  }

  private burst(x: number, y: number, n: number, rgb: string, now: number, speed: number) {
    if (this.reducedMotion) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.9);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        born: now,
        life: 450 + Math.random() * 450,
        size: 1.5 + Math.random() * 2.2,
        rgb,
      });
    }
  }

  // ---- static layers -----------------------------------------------------------

  private buildBackground() {
    const { ctx } = this.bg;
    const { W, H, cell } = this;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#d9d4c9';
    ctx.fillRect(0, 0, W, H);
    const vg = ctx.createRadialGradient(W / 2, H / 2, cell * 1.5, W / 2, H / 2, W * 0.75);
    vg.addColorStop(0, 'rgba(217,212,201,0)');
    vg.addColorStop(1, 'rgba(185,179,165,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  private buildDecor() {
    const maze = this.maze;
    if (!maze) return;
    const { ctx } = this.decor;
    const { cell } = this;
    ctx.clearRect(0, 0, this.W, this.H);
    for (let r = 0; r < MAZE_ROWS; r++) {
      for (let c = 0; c < MAZE_COLS; c++) {
        for (const dir of DIRS) {
          if (maze[r][c][dir]) drawTreeAt(ctx, cell, r, c, dir);
          else drawPlantAt(ctx, cell, r, c, dir);
        }
      }
    }
    const exit = cellCenterAt(cell, MAZE_ROWS - 1, MAZE_COLS - 1);
    ctx.save();
    ctx.translate(exit.x, exit.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#f2c94c';
    ctx.shadowColor = 'rgba(242,201,76,0.8)';
    ctx.shadowBlur = 14;
    ctx.fillRect(-7, -7, 14, 14);
    ctx.restore();
  }

  private initFireflies() {
    this.fireflies = this.reducedMotion
      ? []
      : Array.from({ length: 16 }, () => ({
          x: Math.random() * this.W,
          y: Math.random() * this.H,
          ox: 6 + Math.random() * 18,
          oy: 6 + Math.random() * 18,
          speed: 0.0003 + Math.random() * 0.0005,
          phase: Math.random() * Math.PI * 2,
        }));
  }

  // ---- frame -----------------------------------------------------------------------

  render(state: GameState, now: number) {
    if (state.maze !== this.maze) {
      this.setMaze(state.maze);
      // a new maze starts with the player on its entrance, wherever the last one ended
      const entrance = cellCenterAt(this.cell, state.r, state.c);
      this.px = entrance.x;
      this.py = entrance.y;
    }
    const dt = this.lastFrame ? Math.min(64, now - this.lastFrame) : 16;
    this.lastFrame = now;

    // the player glides toward their cell
    const target = cellCenterAt(this.cell, state.r, state.c);
    const k = 1 - Math.exp(-dt / 45);
    this.px += (target.x - this.px) * k;
    this.py += (target.y - this.py) * k;
    if (Math.hypot(target.x - this.px, target.y - this.py) < 0.5) {
      this.px = target.x;
      this.py = target.y;
    }

    if (this.lastPhase === 'preview' && state.phase !== 'preview') this.afterglowAt = now;
    this.lastPhase = state.phase;

    const { ctx, W, H } = this;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    const shakeAge = now - this.shakeAt;
    if (shakeAge < SHAKE_MS && !this.reducedMotion) {
      const amp = 5 * (1 - shakeAge / SHAKE_MS);
      ctx.translate((Math.random() - 0.5) * 2 * amp, (Math.random() - 0.5) * 2 * amp);
    }
    ctx.drawImage(this.bg.canvas, 0, 0);

    this.drawMemory(state, now);
    this.drawLights(state, now);
    if (state.phase === 'won') this.drawFullMaze(now);
    this.drawFireflies(now);
    this.drawTrail(now);
    this.drawRipples(now);
    this.drawParticles(now, dt);
    this.drawWinBloom(now);
    this.drawPlayer(state, now);
    ctx.restore();
  }

  /** Paints a light into the mask and reveals the decor through it. */
  private lightReveal(lights: Array<{ x: number; y: number; r: number; a: number }>) {
    const { ctx: mctx } = this.mask;
    const { ctx: rctx } = this.reveal;
    mctx.globalCompositeOperation = 'source-over';
    mctx.clearRect(0, 0, this.W, this.H);
    mctx.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      const g = mctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      g.addColorStop(0, `rgba(255,255,255,${l.a})`);
      g.addColorStop(0.7, `rgba(255,255,255,${0.9 * l.a})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      mctx.fillStyle = g;
      mctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    rctx.globalCompositeOperation = 'source-over';
    rctx.clearRect(0, 0, this.W, this.H);
    rctx.drawImage(this.decor.canvas, 0, 0);
    rctx.globalCompositeOperation = 'destination-in';
    rctx.drawImage(this.mask.canvas, 0, 0);
    rctx.globalCompositeOperation = 'source-over';
  }

  private drawLights(state: GameState, now: number) {
    const { cell, ctx } = this;
    const lights: Array<{ x: number; y: number; r: number; a: number }> = [];

    if (state.phase === 'preview') {
      const a = Math.max(0, Math.min(1, (state.previewEndsAt - now) / LIGHT_FADE_MS));
      if (this.pointer.on) {
        lights.push({
          x: this.pointer.x,
          y: this.pointer.y,
          r: cell * PREVIEW_LIGHT_CELLS * (0.7 + 0.3 * a),
          a,
        });
      }
      lights.push({ x: this.px, y: this.py, r: cell * 0.82, a });
    }
    if (state.phase === 'playing' && now < state.pulseUntil) {
      const p = 1 - (state.pulseUntil - now) / PULSE_DURATION_MS; // 0 → 1
      const grow = 1 - Math.pow(1 - Math.min(1, p * 4), 3);
      const a = p < 0.55 ? 1 : Math.max(0, 1 - (p - 0.55) / 0.45);
      lights.push({ x: this.px, y: this.py, r: cell * PULSE_LIGHT_CELLS * grow, a });
    }
    if (!lights.length) return;

    this.lightReveal(lights);
    if (state.phase === 'preview') {
      // remember where the light has been, for the afterglow once movement unlocks
      const m = this.memory.ctx;
      m.globalAlpha = 0.3;
      m.drawImage(this.reveal.canvas, 0, 0);
      m.globalAlpha = 1;
    }
    ctx.drawImage(this.reveal.canvas, 0, 0);

    if (state.phase === 'preview' && this.pointer.on) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = 'rgba(166,243,217,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.pointer.x, this.pointer.y, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawMemory(state: GameState, now: number) {
    if (!this.afterglowAt || state.phase === 'preview') return;
    const t = (now - this.afterglowAt) / AFTERGLOW_MS;
    if (t >= 1) return;
    this.ctx.save();
    this.ctx.globalAlpha = 0.7 * (1 - t) * (1 - t);
    this.ctx.drawImage(this.memory.canvas, 0, 0);
    this.ctx.restore();
  }

  /** On a win the whole maze fades in, so you can see the route you missed. */
  private drawFullMaze(now: number) {
    const t = Math.min(1, (now - this.winAt) / 900);
    this.ctx.save();
    this.ctx.globalAlpha = 0.9 * t;
    this.ctx.drawImage(this.decor.canvas, 0, 0);
    this.ctx.restore();
  }

  private drawFireflies(now: number) {
    const { ctx } = this;
    ctx.save();
    for (const f of this.fireflies) {
      const t = now * f.speed + f.phase;
      const x = f.x + Math.sin(t) * f.ox;
      const y = f.y + Math.cos(t * 1.3) * f.oy;
      const a = 0.18 + 0.32 * (0.5 + 0.5 * Math.sin(t * 3));
      const g = ctx.createRadialGradient(x, y, 0, x, y, 6);
      g.addColorStop(0, `rgba(36,176,132,${a})`);
      g.addColorStop(1, 'rgba(36,176,132,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 6, y - 6, 12, 12);
    }
    ctx.restore();
  }

  private drawTrail(now: number) {
    this.trail = this.trail.filter((t) => now - t.born < TRAIL_MS);
    const { ctx } = this;
    ctx.save();
    for (const t of this.trail) {
      const a = 1 - (now - t.born) / TRAIL_MS;
      ctx.fillStyle = `rgba(255,139,94,${0.35 * a})`;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 2.5 + 2 * a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawRipples(now: number) {
    this.ripples = this.ripples.filter((r) => now - r.born < r.life);
    const { ctx } = this;
    ctx.save();
    for (const r of this.ripples) {
      const t = (now - r.born) / r.life;
      const radius = 6 + (r.maxR - 6) * (1 - Math.pow(1 - t, 3));
      ctx.strokeStyle = `rgba(${r.rgb},${0.8 * (1 - t)})`;
      ctx.lineWidth = 2.2 * (1 - t) + 0.6;
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawParticles(now: number, dt: number) {
    this.particles = this.particles.filter((p) => now - p.born < p.life);
    const { ctx } = this;
    ctx.save();
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.97;
      p.vy *= 0.97;
      const a = 1 - (now - p.born) / p.life;
      ctx.fillStyle = `rgba(${p.rgb},${a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * a), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawWinBloom(now: number) {
    if (!this.winAt) return;
    const t = (now - this.winAt) / 1400;
    if (t >= 1) return;
    const exit = cellCenterAt(this.cell, MAZE_ROWS - 1, MAZE_COLS - 1);
    const r = this.cell * (0.6 + 3 * t);
    const g = this.ctx.createRadialGradient(exit.x, exit.y, 0, exit.x, exit.y, r);
    g.addColorStop(0, `rgba(242,201,76,${0.55 * (1 - t)})`);
    g.addColorStop(1, 'rgba(242,201,76,0)');
    this.ctx.fillStyle = g;
    this.ctx.fillRect(exit.x - r, exit.y - r, r * 2, r * 2);
  }

  private drawPlayer(state: GameState, now: number) {
    const { ctx, px, py } = this;
    const lit = state.phase === 'preview' || (state.phase === 'playing' && now < state.pulseUntil);
    ctx.save();
    if (lit) {
      const pulse = 1 + Math.sin(now / 260) * 0.06;
      const radius = 22 * pulse;
      const g = ctx.createRadialGradient(px, py, 0, px, py, radius);
      g.addColorStop(0, 'rgba(255,192,138,0.55)');
      g.addColorStop(1, 'rgba(255,192,138,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = lit ? '#ff8b5e' : 'rgba(255,139,94,0.7)';
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
