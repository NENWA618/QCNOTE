import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import type { NextPage } from 'next';

const DiejiePage: NextPage = () => {
  const { status } = useSession();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stageEl = document.getElementById('stage');
    const canvasEl = document.getElementById('maze');
    if (!stageEl || !(canvasEl instanceof HTMLCanvasElement)) return;
    const canvas = canvasEl;

    const rawCtx = canvas.getContext('2d');
    if (!rawCtx) return;
    const ctx = rawCtx;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const decorCanvas = document.createElement('canvas');
    const rawDecorCtx = decorCanvas.getContext('2d');
    const maskCanvas = document.createElement('canvas');
    const rawMaskCtx = maskCanvas.getContext('2d');
    const revealCanvas = document.createElement('canvas');
    const rawRevealCtx = revealCanvas.getContext('2d');
    const bgCanvas = document.createElement('canvas');
    const rawBgCtx = bgCanvas.getContext('2d');
    if (!rawDecorCtx || !rawMaskCtx || !rawRevealCtx || !rawBgCtx) return;
    const decorCtx = rawDecorCtx;
    const maskCtx = rawMaskCtx;
    const revealCtx = rawRevealCtx;
    const bgCtx = rawBgCtx;

    let CELL = 56;
    let W = 11 * CELL;
    let H = 7 * CELL;
    let LIGHT_RADIUS = CELL * 2.3;
    let SELF_RADIUS = CELL * 0.82;
    // 记录上一次构建装饰层/背景层时使用的 CELL 尺寸，避免尺寸没变时重复做昂贵的重绘
    let lastBuiltCell = 0;
    // 缓存 canvas 的位置信息，避免每次 mousemove/touchmove 都强制触发同步布局回流
    let canvasRect = canvas.getBoundingClientRect();

    function resizeOffscreenLayers() {
      decorCanvas.width = W;
      decorCanvas.height = H;
      maskCanvas.width = W;
      maskCanvas.height = H;
      revealCanvas.width = W;
      revealCanvas.height = H;
      bgCanvas.width = W;
      bgCanvas.height = H;
    }

    // 背景（地板 + 暗角渐变）是静态的，只在 CELL 变化时重新生成一次，
    // 而不是像之前那样每一帧都重新创建渐变对象并两次 fillRect 整个画布。
    function buildBackgroundLayer() {
      bgCtx.clearRect(0, 0, W, H);
      bgCtx.fillStyle = '#d9d4c9';
      bgCtx.fillRect(0, 0, W, H);
      const vg = bgCtx.createRadialGradient(W / 2, H / 2, CELL * 1.5, W / 2, H / 2, W * 0.75);
      vg.addColorStop(0, 'rgba(217,212,201,0)');
      vg.addColorStop(1, 'rgba(185,179,165,0.55)');
      bgCtx.fillStyle = vg;
      bgCtx.fillRect(0, 0, W, H);
    }

    function layoutCanvas() {
      const availW = Math.max(240, window.innerWidth);
      const availH = Math.max(220, window.innerHeight);
      const cellByW = Math.floor(availW / 11);
      const cellByH = Math.floor(availH / 7);
      CELL = Math.max(26, Math.min(cellByW, cellByH, 120));
      W = 11 * CELL;
      H = 7 * CELL;
      LIGHT_RADIUS = CELL * 2.3;
      SELF_RADIUS = CELL * 0.82;

      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // 只有当 CELL 真正变化时才重建离屏图层，避免 resize 抖动、移动端地址栏
      // 收起展开等场景下反复触发昂贵的重绘（大量渐变 + 阴影绘制）造成卡顿
      if (CELL !== lastBuiltCell) {
        resizeOffscreenLayers();
        buildBackgroundLayer();
        if (maze) {
          buildDecorLayer();
        }
        lastBuiltCell = CELL;
      }
      if (maze) {
        const c = cellCenter(player.r, player.c);
        player.x = player.tx = c.x;
        player.y = player.ty = c.y;
      }
      canvasRect = canvas.getBoundingClientRect();
    }

    let maze: Array<Array<Record<string, boolean>>>;
    let player: { r: number; c: number; x: number; y: number; tx: number; ty: number };
    let mouse = { x: -9999, y: -9999 };
    let steps = 0;
    let bumps = 0;
    let startTime = performance.now();
    let won = false;
    let moving = false;
    let bumpFlash: { x: number; y: number; t: number } | null = null;
    let introActive = true;
    let lightActive = false;
    let movementAllowed = false;
    let lightExpiry = 0;

    function getCanvasCoords(clientX: number, clientY: number) {
      const rect = canvasRect;
      return {
        x: ((clientX - rect.left) * (canvas.width / dpr)) / rect.width,
        y: ((clientY - rect.top) * (canvas.height / dpr)) / rect.height,
      };
    }

    function generateMaze(rows: number, cols: number) {
      const cells: Array<Array<Record<string, boolean>>> = [];
      for (let r = 0; r < rows; r++) {
        const row: Array<Record<string, boolean>> = [];
        for (let c = 0; c < cols; c++)
          row.push({ N: true, E: true, S: true, W: true, visited: false });
        cells.push(row);
      }
      const dirs = [
        { name: 'N', dr: -1, dc: 0, opp: 'S' },
        { name: 'E', dr: 0, dc: 1, opp: 'W' },
        { name: 'S', dr: 1, dc: 0, opp: 'N' },
        { name: 'W', dr: 0, dc: -1, opp: 'E' },
      ];
      const stack = [{ r: 0, c: 0 }];
      cells[0][0].visited = true;
      while (stack.length) {
        const { r, c } = stack[stack.length - 1];
        const options: Array<any> = [];
        for (const d of dirs) {
          const nr = r + d.dr;
          const nc = c + d.dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !cells[nr][nc].visited)
            options.push({ ...d, nr, nc });
        }
        if (!options.length) {
          stack.pop();
          continue;
        }
        const pick = options[Math.floor(Math.random() * options.length)];
        cells[r][c][pick.name] = false;
        cells[pick.nr][pick.nc][pick.opp] = false;
        cells[pick.nr][pick.nc].visited = true;
        stack.push({ r: pick.nr, c: pick.nc });
      }
      cells[0][0].N = false;
      cells[rows - 1][cols - 1].S = false;
      return cells;
    }

    function cellCenter(r: number, c: number) {
      return { x: c * CELL + CELL / 2, y: r * CELL + CELL / 2 };
    }

    function buildDecorLayer() {
      decorCtx.clearRect(0, 0, W, H);
      const dirs: Array<'N' | 'E' | 'S' | 'W'> = ['N', 'E', 'S', 'W'];
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 11; c++) {
          const cell = maze[r][c];
          dirs.forEach((dir) => {
            if (cell[dir]) drawTree(decorCtx, r, c, dir);
            else drawPlant(decorCtx, r, c, dir);
          });
        }
      }
      const exitCenter = cellCenter(6, 10);
      decorCtx.save();
      decorCtx.translate(exitCenter.x, exitCenter.y);
      decorCtx.rotate(Math.PI / 4);
      decorCtx.fillStyle = '#f2c94c';
      decorCtx.shadowColor = 'rgba(242,201,76,0.8)';
      decorCtx.shadowBlur = 14;
      decorCtx.fillRect(-7, -7, 14, 14);
      decorCtx.restore();
    }

    function reset() {
      maze = generateMaze(7, 11);
      buildDecorLayer();
      const start = cellCenter(0, 0);
      player = { r: 0, c: 0, x: start.x, y: start.y, tx: start.x, ty: start.y };
      mouse = { x: -9999, y: -9999 };
      steps = 0;
      bumps = 0;
      startTime = performance.now();
      won = false;
      moving = false;
      bumpFlash = null;
      introActive = true;
      lightActive = false;
      movementAllowed = false;
      lightExpiry = 0;
      document.getElementById('winOverlay')?.classList.remove('show');
      document.getElementById('countdownText')?.setAttribute('style', 'display:none;');
      const submitStatus = document.getElementById('submitStatus');
      if (submitStatus) submitStatus.textContent = '排行榜结果将自动提交';
    }

    function updateHud() {
      // HUD removed to keep the screen clean.
    }

    function fmtTime(ms: number) {
      const s = Math.floor(ms / 1000);
      const mm = String(Math.floor(s / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      return `${mm}:${ss}`;
    }

    function smoothstep(t: number) {
      t = Math.min(1, Math.max(0, t));
      return t * t * (3 - 2 * t);
    }

    function revealAt(px: number, py: number) {
      const dm = Math.hypot(px - mouse.x, py - mouse.y);
      const dp = Math.hypot(px - player.x, py - player.y);
      const tm = smoothstep(1 - dm / LIGHT_RADIUS);
      const tp = smoothstep(1 - dp / SELF_RADIUS);
      return Math.max(tm, tp);
    }

    let bumpToastTimer: number | null = null;
    function showBumpToast() {
      const el = document.getElementById('bumpToast');
      if (!el) return;
      el.classList.add('show');
      if (bumpToastTimer) window.clearTimeout(bumpToastTimer);
      bumpToastTimer = window.setTimeout(() => el.classList.remove('show'), 700);
    }

    function tryMove(dir: 'N' | 'S' | 'E' | 'W') {
      if (won || introActive || !movementAllowed) return;
      const cell = maze[player.r][player.c];
      const deltas = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
      const [dc, dr] = deltas[dir];
      const nr = player.r + dr;
      const nc = player.c + dc;
      const blocked = cell[dir] === true || nr < 0 || nr >= 7 || nc < 0 || nc >= 11;
      if (blocked) {
        bumps++;
        updateHud();
        showBumpToast();
        const mid = wallMid(player.r, player.c, dir);
        bumpFlash = { x: mid.x, y: mid.y, t: performance.now() };
        return;
      }
      player.r = nr;
      player.c = nc;
      const target = cellCenter(nr, nc);
      player.tx = target.x;
      player.ty = target.y;
      moving = true;
      steps++;
      updateHud();
      if (nr === 6 && nc === 10) {
        window.setTimeout(() => {
          won = true;
          showWin();
        }, 160);
      }
    }

    function wallMid(r: number, c: number, dir: 'N' | 'S' | 'E' | 'W') {
      const cx = c * CELL;
      const cy = r * CELL;
      if (dir === 'N') return { x: cx + CELL / 2, y: cy };
      if (dir === 'S') return { x: cx + CELL / 2, y: cy + CELL };
      if (dir === 'W') return { x: cx, y: cy + CELL / 2 };
      return { x: cx + CELL, y: cy + CELL / 2 };
    }

    function showWin() {
      document.getElementById('finalSteps')!.textContent = String(steps);
      document.getElementById('finalBumps')!.textContent = String(bumps);
      document.getElementById('finalTime')!.textContent = fmtTime(performance.now() - startTime);
      document.getElementById('winOverlay')?.classList.add('show');
      document.getElementById('statsBox')?.setAttribute('style', '');
      submitMazeResult(steps, performance.now() - startTime);
    }

    async function submitMazeResult(steps: number, timeMs: number) {
      const statusEl = document.getElementById('submitStatus');
      if (!statusEl) return;
      statusEl.textContent = '正在提交排行榜...';
      try {
        const normalizedSteps = Math.round(steps);
        const normalizedTimeMs = Math.round(timeMs);
        const response = await fetch('/api/ugc/maze/submit', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ steps: normalizedSteps, timeMs: normalizedTimeMs }),
        });
        const responseText = await response.text();
        let result: any = {};
        try {
          result = JSON.parse(responseText);
        } catch (parseError) {
          console.warn('Maze submit returned invalid JSON', responseText);
        }
        console.debug('Maze submit response', { status: response.status, responseText, result });
        if (response.status === 401) {
          statusEl.textContent = '未登录，正在跳转登录...';
          signIn(undefined, { callbackUrl: '/diejie' });
          return;
        }
        if (result.success) {
          statusEl.textContent = '已提交排行榜，今日最佳成绩已保存';
          window.dispatchEvent(new Event('maze-submission-updated'));
        } else if (result.message === 'Already submitted for today') {
          statusEl.textContent = '今日已记录过成绩，已保留更优成绩';
          window.dispatchEvent(new Event('maze-submission-updated'));
        } else {
          const detail = result?.error || result?.message || '未知错误';
          statusEl.textContent = `排行榜提交失败：${detail}`;
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : '网络异常';
        statusEl.textContent = `排行榜提交失败：${detail}`;
      }
    }

    const keyMap: Record<string, 'N' | 'S' | 'E' | 'W'> = {
      ArrowUp: 'N',
      KeyW: 'N',
      ArrowDown: 'S',
      KeyS: 'S',
      ArrowLeft: 'W',
      KeyA: 'W',
      ArrowRight: 'E',
      KeyD: 'E',
    };

    function handleKeyDown(e: KeyboardEvent) {
      if (keyMap[e.code]) {
        e.preventDefault();
        tryMove(keyMap[e.code]);
      }
    }

    function handleMouseMove(e: MouseEvent) {
      const rect = canvasRect;
      mouse.x = ((e.clientX - rect.left) * (canvas.width / dpr)) / rect.width;
      mouse.y = ((e.clientY - rect.top) * (canvas.height / dpr)) / rect.height;
    }

    function handleTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      if (!t) return;
      const coord = getCanvasCoords(t.clientX, t.clientY);
      if (lightActive) {
        mouse.x = coord.x;
        mouse.y = coord.y;
      }
    }

    function handleTouchMove(e: TouchEvent) {
      e.preventDefault();
      const t = e.touches[0];
      if (!t) return;
      const coord = getCanvasCoords(t.clientX, t.clientY);
      if (lightActive) {
        mouse.x = coord.x;
        mouse.y = coord.y;
      }
    }

    function handleTouchEnd(e: TouchEvent) {
      e.preventDefault();
      const t = e.changedTouches[0];
      if (!t) return;
      const coord = getCanvasCoords(t.clientX, t.clientY);
      if (!lightActive && movementAllowed) {
        const dx = coord.x - player.x;
        const dy = coord.y - player.y;
        if (Math.hypot(dx, dy) < CELL * 0.2) return;
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N';
        tryMove(dir);
      }
    }

    function handleMouseLeave() {
      mouse.x = -9999;
      mouse.y = -9999;
    }

    function handleStartClick() {
      document.getElementById('introOverlay')?.classList.remove('show');
      introActive = false;
      lightActive = true;
      movementAllowed = false;
      lightExpiry = performance.now() + 7000;
      mouse = { x: player.x, y: player.y };
      document.getElementById('countdownText')?.setAttribute('style', '');
      startTime = performance.now();
    }

    function handlePlayAgainClick() {
      reset();
      document.getElementById('introOverlay')?.classList.add('show');
    }

    function handleLoginClick() {
      signIn(undefined, { callbackUrl: '/diejie' });
    }

    const playAgainBtn = document.getElementById('playAgainBtn');
    const startBtn = document.getElementById('startBtn');
    const loginSubmitBtn = document.getElementById('loginSubmitBtn');
    const introOverlayEl = document.getElementById('introOverlay');

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    window.addEventListener('keydown', handleKeyDown);

    playAgainBtn?.addEventListener('click', handlePlayAgainClick);
    playAgainBtn?.addEventListener('touchstart', handlePlayAgainClick, { passive: false });
    playAgainBtn?.addEventListener('pointerdown', handlePlayAgainClick);
    startBtn?.addEventListener('click', handleStartClick);
    startBtn?.addEventListener('touchstart', handleStartClick, { passive: false });
    startBtn?.addEventListener('pointerdown', handleStartClick);
    loginSubmitBtn?.addEventListener('click', handleLoginClick);
    loginSubmitBtn?.addEventListener('touchstart', handleLoginClick, { passive: false });
    loginSubmitBtn?.addEventListener('pointerdown', handleLoginClick);
    introOverlayEl?.addEventListener('pointerdown', (e) => {
      const active = e.target === startBtn;
      if (active) handleStartClick();
    });

    // 用 rAF 把同一帧内可能连续触发多次的 resize / ResizeObserver 回调合并成一次，
    // 避免布局抖动（例如移动端地址栏收起展开）时反复触发昂贵的 layoutCanvas 重建
    let layoutScheduled = false;
    function scheduleLayout() {
      if (layoutScheduled) return;
      layoutScheduled = true;
      window.requestAnimationFrame(() => {
        layoutScheduled = false;
        layoutCanvas();
      });
    }

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => scheduleLayout());
      resizeObserver.observe(stageEl);
    }
    window.addEventListener('resize', scheduleLayout);

    // 页面切到后台时暂停动画循环，避免不必要的 CPU/GPU 消耗，
    // 回到前台时再恢复渲染
    function handleVisibilityChange() {
      if (document.hidden) {
        if (rafId) {
          window.cancelAnimationFrame(rafId);
          rafId = 0;
        }
      } else if (!rafId) {
        rafId = window.requestAnimationFrame(render);
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    function mulberry32(seed: number) {
      let a = seed >>> 0;
      return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    function seedFor(r: number, c: number, dir: 'N' | 'E' | 'S' | 'W') {
      const dirIdx = { N: 0, E: 1, S: 2, W: 3 }[dir];
      return (r * 97 + c * 131 + dirIdx * 181 + 907) >>> 0;
    }

    function qbez(
      p0: { x: number; y: number },
      p1: { x: number; y: number },
      p2: { x: number; y: number },
      t: number,
    ) {
      const mt = 1 - t;
      return {
        x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
        y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
      };
    }

    function drawTree(
      tctx: CanvasRenderingContext2D,
      r: number,
      c: number,
      dir: 'N' | 'E' | 'S' | 'W',
    ) {
      const mid = wallMid(r, c, dir);
      const rand = mulberry32(seedFor(r, c, dir));
      const horizontal = dir === 'N' || dir === 'S';
      const along = horizontal ? { x: 1, y: 0 } : { x: 0, y: 1 };
      const into = horizontal
        ? { x: 0, y: dir === 'N' ? 1 : -1 }
        : { x: dir === 'W' ? 1 : -1, y: 0 };

      tctx.save();
      tctx.strokeStyle = '#3a2a4d';
      tctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const t = i / 2 - 0.5;
        const bx = mid.x + along.x * t * CELL * 0.7;
        const by = mid.y + along.y * t * CELL * 0.7;
        const branchLen = CELL * (0.22 + rand() * 0.16);
        const bend = (rand() - 0.5) * 14;
        const ex = bx + into.x * branchLen + along.x * bend;
        const ey = by + into.y * branchLen + along.y * bend;
        const cxp = bx + into.x * branchLen * 0.5 + along.x * (rand() - 0.5) * 16;
        const cyp = by + into.y * branchLen * 0.5 + along.y * (rand() - 0.5) * 16;
        tctx.lineWidth = 2 + rand() * 1.4;
        tctx.beginPath();
        tctx.moveTo(bx, by);
        tctx.quadraticCurveTo(cxp, cyp, ex, ey);
        tctx.stroke();
      }
      tctx.shadowColor = 'rgba(75,56,102,0.55)';
      tctx.shadowBlur = 7;
      const nBlobs = 5;
      for (let i = 0; i < nBlobs; i++) {
        const t = i / (nBlobs - 1) - 0.5;
        const jx = (rand() - 0.5) * 10;
        const jy = (rand() - 0.5) * 10;
        const px = mid.x + along.x * t * CELL * 0.82 + jx + into.x * rand() * 8;
        const py = mid.y + along.y * t * CELL * 0.82 + jy + into.y * rand() * 8;
        const rad = 6.5 + rand() * 6.5;
        const grad = tctx.createRadialGradient(px, py, 0, px, py, rad);
        grad.addColorStop(0, '#2f2242');
        grad.addColorStop(1, '#1a1224');
        tctx.fillStyle = grad;
        tctx.beginPath();
        tctx.arc(px, py, rad, 0, Math.PI * 2);
        tctx.fill();
        tctx.strokeStyle = 'rgba(75,56,102,0.5)';
        tctx.lineWidth = 1;
        tctx.stroke();
      }
      tctx.restore();
    }

    function drawPlant(
      tctx: CanvasRenderingContext2D,
      r: number,
      c: number,
      dir: 'N' | 'E' | 'S' | 'W',
    ) {
      const mid = wallMid(r, c, dir);
      const rand = mulberry32(seedFor(r, c, dir) + 5000);
      const center = cellCenter(r, c);
      const into = { x: center.x - mid.x, y: center.y - mid.y };
      const invLen = 1 / Math.max(1, Math.hypot(into.x, into.y));
      const dirIn = { x: into.x * invLen, y: into.y * invLen };
      const along = { x: -dirIn.y, y: dirIn.x };
      tctx.save();
      tctx.globalCompositeOperation = 'lighter';
      const pool = tctx.createRadialGradient(mid.x, mid.y, 0, mid.x, mid.y, CELL * 0.36);
      pool.addColorStop(0, 'rgba(73,223,174,0.20)');
      pool.addColorStop(1, 'rgba(73,223,174,0)');
      tctx.fillStyle = pool;
      tctx.beginPath();
      tctx.arc(mid.x, mid.y, CELL * 0.36, 0, Math.PI * 2);
      tctx.fill();
      const nStems = 3;
      for (let i = 0; i < nStems; i++) {
        const spread = (i / (nStems - 1) - 0.5) * 0.7;
        const p0 = {
          x: mid.x + along.x * spread * CELL * 0.5,
          y: mid.y + along.y * spread * CELL * 0.5,
        };
        const len = CELL * (0.34 + rand() * 0.22);
        const curve = (rand() - 0.5) * CELL * 0.5;
        const p2 = {
          x: p0.x + dirIn.x * len + along.x * curve * 0.6,
          y: p0.y + dirIn.y * len + along.y * curve * 0.6,
        };
        const p1 = {
          x: p0.x + dirIn.x * len * 0.5 + along.x * curve,
          y: p0.y + dirIn.y * len * 0.5 + along.y * curve,
        };
        tctx.strokeStyle = 'rgba(73,223,174,0.75)';
        tctx.lineWidth = 1.6;
        tctx.lineCap = 'round';
        tctx.beginPath();
        tctx.moveTo(p0.x, p0.y);
        tctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
        tctx.stroke();
        [0.35, 0.65, 1].forEach((t) => {
          const bp = qbez(p0, p1, p2, t);
          const budR = (t === 1 ? 3.2 : 2) + rand() * 1.1;
          tctx.shadowColor = 'rgba(73,223,174,0.9)';
          tctx.shadowBlur = 9;
          const bg = tctx.createRadialGradient(bp.x, bp.y, 0, bp.x, bp.y, budR * 1.6);
          bg.addColorStop(0, 'rgba(216,251,236,0.95)');
          bg.addColorStop(0.5, 'rgba(73,223,174,0.85)');
          bg.addColorStop(1, 'rgba(73,223,174,0)');
          tctx.fillStyle = bg;
          tctx.beginPath();
          tctx.arc(bp.x, bp.y, budR * 1.6, 0, Math.PI * 2);
          tctx.fill();
        });
      }
      tctx.restore();
    }

    function render(now: number) {
      const ease = 0.42;
      player.x += (player.tx - player.x) * ease;
      player.y += (player.ty - player.y) * ease;
      if (Math.hypot(player.tx - player.x, player.ty - player.y) < 0.6) {
        player.x = player.tx;
        player.y = player.ty;
        moving = false;
      }
      maskCtx.clearRect(0, 0, W, H);
      maskCtx.globalCompositeOperation = 'source-over';
      if (lightActive) {
        const remaining = Math.max(0, Math.ceil((lightExpiry - now) / 1000));
        const countdownEl = document.getElementById('countdownText');
        if (countdownEl) countdownEl.textContent = `光源倒计时：${remaining}s`;
        if (now >= lightExpiry) {
          lightActive = false;
          movementAllowed = true;
          countdownEl?.setAttribute('style', 'display:none;');
        }
      }
      if (lightActive) {
        const mg = maskCtx.createRadialGradient(
          mouse.x,
          mouse.y,
          0,
          mouse.x,
          mouse.y,
          LIGHT_RADIUS,
        );
        mg.addColorStop(0, 'rgba(255,255,255,1)');
        mg.addColorStop(0.7, 'rgba(255,255,255,0.9)');
        mg.addColorStop(1, 'rgba(255,255,255,0)');
        maskCtx.fillStyle = mg;
        maskCtx.fillRect(0, 0, W, H);
        maskCtx.globalCompositeOperation = 'lighter';
        const pg = maskCtx.createRadialGradient(
          player.x,
          player.y,
          0,
          player.x,
          player.y,
          SELF_RADIUS,
        );
        pg.addColorStop(0, 'rgba(255,255,255,1)');
        pg.addColorStop(1, 'rgba(255,255,255,0)');
        maskCtx.fillStyle = pg;
        maskCtx.fillRect(0, 0, W, H);
        revealCtx.clearRect(0, 0, W, H);
        revealCtx.globalCompositeOperation = 'source-over';
        revealCtx.drawImage(decorCanvas, 0, 0);
        revealCtx.globalCompositeOperation = 'destination-in';
        revealCtx.drawImage(maskCanvas, 0, 0);
      }
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(bgCanvas, 0, 0);
      if (lightActive) {
        ctx.drawImage(revealCanvas, 0, 0);
      }
      if (bumpFlash) {
        const age = now - bumpFlash.t;
        if (age < 420) {
          const a = 1 - age / 420;
          ctx.save();
          ctx.globalAlpha = a * 0.8;
          ctx.fillStyle = '#e5484d';
          ctx.shadowColor = 'rgba(229,72,77,0.8)';
          ctx.shadowBlur = 16;
          ctx.beginPath();
          ctx.arc(bumpFlash.x, bumpFlash.y, 10 + age * 0.03, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          bumpFlash = null;
        }
      }
      if (lightActive && mouse.x > -100) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = 'rgba(166,243,217,0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      if (lightActive) {
        const pulse = 1 + Math.sin(now / 260) * 0.06;
        const grad2 = ctx.createRadialGradient(
          player.x,
          player.y,
          0,
          player.x,
          player.y,
          22 * pulse,
        );
        grad2.addColorStop(0, 'rgba(255,192,138,0.55)');
        grad2.addColorStop(1, 'rgba(255,192,138,0)');
        ctx.fillStyle = grad2;
        ctx.beginPath();
        ctx.arc(player.x, player.y, 22 * pulse, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = lightActive ? '#ff8b5e' : 'rgba(255,139,94,0.7)';
      ctx.beginPath();
      ctx.arc(player.x, player.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      rafId = window.requestAnimationFrame(render);
    }

    let rafId = 0;
    // 先根据窗口尺寸算出正确的 CELL，再生成迷宫/装饰层，
    // 这样只需构建一次装饰层，而不是先用默认 CELL=56 建一次、
    // 紧接着 layoutCanvas 又用正确尺寸重建一次
    window.setTimeout(() => {
      let initialized = false;
      try {
        layoutCanvas();
        reset();
        initialized = true;
      } catch (error) {
        console.error('diejie 初始化出错', error);
      } finally {
        setReady(true);
        if (initialized) {
          rafId = window.requestAnimationFrame(render);
        }
      }
    }, 0);

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('touchmove', handleTouchMove as EventListener);
      canvas.removeEventListener('touchstart', handleTouchStart as EventListener);
      canvas.removeEventListener('touchend', handleTouchEnd as EventListener);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', scheduleLayout);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      playAgainBtn?.removeEventListener('click', handlePlayAgainClick);
      playAgainBtn?.removeEventListener('touchstart', handlePlayAgainClick as EventListener);
      playAgainBtn?.removeEventListener('pointerdown', handlePlayAgainClick as EventListener);
      startBtn?.removeEventListener('click', handleStartClick);
      startBtn?.removeEventListener('touchstart', handleStartClick as EventListener);
      startBtn?.removeEventListener('pointerdown', handleStartClick as EventListener);
      loginSubmitBtn?.removeEventListener('click', handleLoginClick);
      loginSubmitBtn?.removeEventListener('touchstart', handleLoginClick as EventListener);
      loginSubmitBtn?.removeEventListener('pointerdown', handleLoginClick as EventListener);
      if (resizeObserver) resizeObserver.disconnect();
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const submitStatus = document.getElementById('submitStatus');
    const loginButton = document.getElementById('loginSubmitBtn');
    if (!submitStatus || !loginButton) return;

    if (status === 'authenticated') {
      loginButton.style.display = 'none';
      submitStatus.textContent = '排行榜结果将自动提交';
    } else if (status === 'unauthenticated') {
      loginButton.style.display = 'inline-flex';
      submitStatus.textContent = '未登录，登录后可提交排行榜';
    } else {
      loginButton.style.display = 'none';
    }
  }, [status]);

  return (
    <>
      <Head>
        <title>叠界 · 光域迷宫</title>
      </Head>
      <div className="stage" id="stage">
        <canvas id="maze"></canvas>
        <div className="bump-toast" id="bumpToast">
          撞上了树木 · 坍焦失败
        </div>

        {!ready && (
          <div className="page-loading">
            <div className="spinner"></div>
            <div className="loading-title">QCNOTE · 初始化迷宫</div>
            <div className="loading-subtitle">
              正在准备光域迷宫，避免一次性加载过多内容导致卡顿。
            </div>
          </div>
        )}

        <div id="introOverlay" className="overlay show">
          <div className="mark">光域迷宫</div>
          <div id="introText">
            <p className="story-line">按下开始后，先用光源观察迷宫，7秒后即可移动。</p>
          </div>
          <button id="startBtn">开始</button>
          <div className="submit-status" id="countdownText" style={{ display: 'none' }}>
            光源倒计时：7s
          </div>
        </div>

        <div id="winOverlay" className="overlay">
          <div className="mark" id="winMark">
            已找到出口
          </div>
          <div id="statsBox" style={{ display: 'none' }}>
            <h2>迷宫已完成</h2>
            <div className="stats-final">
              <div>
                <div className="n" id="finalSteps">
                  0
                </div>
                <div className="l">步数</div>
              </div>
              <div>
                <div className="n" id="finalBumps">
                  0
                </div>
                <div className="l">撞墙次数</div>
              </div>
              <div>
                <div className="n" id="finalTime">
                  00:00
                </div>
                <div className="l">用时</div>
              </div>
            </div>
            <button id="playAgainBtn" className="ghost">
              再走一次
            </button>
            <button
              id="loginSubmitBtn"
              className="ghost"
              style={{ display: 'none', marginTop: '12px' }}
            >
              登录后提交
            </button>
            <div id="submitStatus" className="submit-status">
              排行榜结果将自动提交
            </div>
          </div>
        </div>
      </div>
      <style jsx global>{`
        :root {
          --void: #0a0a0d;
          --panel: #15141b;
          --panel-line: #2a2833;
          --ink: #ede9e2;
          --ink-dim: #8e8a92;
          --floor: #d9d4c9;
          --floor-shadow: #b9b3a5;
          --wall: #241a34;
          --wall-edge: #4b3866;
          --path-glow: #49dfae;
          --path-glow-soft: #a6f3d9;
          --player: #ff8b5e;
          --player-glow: #ffc08a;
          --exit: #f2c94c;
          --danger: #e5484d;
        }
        * {
          box-sizing: border-box;
        }
        html,
        body {
          margin: 0;
          padding: 0;
          background: var(--void);
          color: var(--ink);
          font-family:
            -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
          height: 100%;
          overflow: hidden;
        }
        .stage {
          position: fixed;
          inset: 0;
          width: 100%;
          height: 100%;
          max-width: none;
          margin: 0;
          border-radius: 0;
          background: transparent;
          border: none;
          padding: 0;
          box-shadow: none;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        canvas {
          display: block;
          width: 100%;
          height: 100%;
          border-radius: 0;
          background: var(--floor);
          cursor: none;
          touch-action: none;
        }
        .overlay {
          position: absolute;
          inset: 14px;
          background: rgba(10, 9, 13, 0.94);
          border-radius: 3px;
          display: none;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          text-align: center;
          padding: 20px;
        }
        .overlay.show {
          display: flex;
        }
        .overlay .mark {
          font-family: 'Songti SC', 'STSong', serif;
          font-size: 13px;
          letter-spacing: 0.3em;
          color: var(--exit);
          margin-bottom: 16px;
          text-transform: uppercase;
        }
        #winOverlay h2 {
          font-family: 'Songti SC', 'STSong', serif;
          font-size: 22px;
          margin: 0 0 14px;
          color: var(--ink);
          font-weight: 600;
        }
        #winOverlay .stats-final {
          display: flex;
          gap: 26px;
          margin-bottom: 22px;
        }
        #winOverlay .stats-final div {
          text-align: center;
        }
        #winOverlay .stats-final .n {
          font-size: 22px;
          font-weight: 600;
          color: var(--path-glow-soft);
          font-variant-numeric: tabular-nums;
        }
        #winOverlay .stats-final .l {
          font-size: 11px;
          color: var(--ink-dim);
          margin-top: 2px;
        }
        .overlay button {
          background: var(--path-glow);
          border: none;
          color: #0a1512;
          font-size: 13px;
          padding: 10px 22px;
          border-radius: 3px;
          cursor: pointer;
          font-weight: 600;
          letter-spacing: 0.02em;
          font-family: inherit;
        }
        .overlay button:hover {
          background: var(--path-glow-soft);
        }
        .overlay button.ghost {
          background: transparent;
          border: 1px solid var(--panel-line);
          color: var(--ink-dim);
        }
        .overlay button.ghost:hover {
          border-color: var(--path-glow);
          color: var(--path-glow-soft);
          background: transparent;
        }
        .submit-status {
          margin-top: 18px;
          color: var(--ink-dim);
          font-size: 12px;
          line-height: 1.6;
          max-width: 320px;
        }
        #introText {
          max-width: 380px;
          margin-bottom: 22px;
        }
        .story-line {
          font-family: 'Songti SC', 'STSong', 'Noto Serif SC', serif;
          font-size: 15px;
          line-height: 2;
          color: var(--ink-dim);
          margin: 0 0 4px;
        }
        #storyBox {
          max-width: 400px;
          min-height: 150px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .page-loading {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #18131f 0%, #3e2b55 45%, #d38aa5 100%);
          color: white;
          z-index: 10;
          padding: 24px;
          text-align: center;
        }
        .page-loading .spinner {
          width: 72px;
          height: 72px;
          border: 6px solid rgba(255, 255, 255, 0.18);
          border-top-color: rgba(255, 255, 255, 0.95);
          border-radius: 999px;
          animation: spin 0.9s linear infinite;
          margin: 0 auto 18px;
        }
        .page-loading .loading-title {
          font-size: 20px;
          font-weight: 700;
          letter-spacing: 0.06em;
          margin-bottom: 8px;
        }
        .page-loading .loading-subtitle {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.72);
          line-height: 1.7;
          max-width: 320px;
          margin: 0 auto;
        }
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .bump-toast {
          position: absolute;
          top: 10px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(229, 72, 77, 0.14);
          border: 1px solid rgba(229, 72, 77, 0.4);
          color: #f2a3a5;
          font-size: 11px;
          padding: 4px 10px;
          border-radius: 20px;
          opacity: 0;
          transition: opacity 0.25s ease;
          pointer-events: none;
          letter-spacing: 0.04em;
        }
        .bump-toast.show {
          opacity: 1;
        }
      `}</style>
    </>
  );
};

export default DiejiePage;
