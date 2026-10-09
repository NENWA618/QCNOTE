import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import type { NextPage } from 'next';
import DiejieStage from '../components/diejie/DiejieStage';
import DiejieStyles from '../components/diejie/DiejieStyles';
import { drawPlantAt, drawTreeAt } from '../lib/diejie/decor';
import { cellCenterAt, fmtTime, generateMaze, wallMidAt } from '../lib/diejie/maze';

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

    function cellCenter(r: number, c: number) {
      return cellCenterAt(CELL, r, c);
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
      return wallMidAt(CELL, r, c, dir);
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
        let result: { success?: boolean; message?: string; error?: string } = {};
        try {
          const parsed: unknown = JSON.parse(responseText);
          if (typeof parsed === 'object' && parsed !== null) {
            const candidate = parsed as Record<string, unknown>;
            result = {
              success: typeof candidate.success === 'boolean' ? candidate.success : undefined,
              message: typeof candidate.message === 'string' ? candidate.message : undefined,
              error: typeof candidate.error === 'string' ? candidate.error : undefined,
            };
          }
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

    function drawTree(
      tctx: CanvasRenderingContext2D,
      r: number,
      c: number,
      dir: 'N' | 'E' | 'S' | 'W',
    ) {
      drawTreeAt(tctx, CELL, r, c, dir);
    }

    function drawPlant(
      tctx: CanvasRenderingContext2D,
      r: number,
      c: number,
      dir: 'N' | 'E' | 'S' | 'W',
    ) {
      drawPlantAt(tctx, CELL, r, c, dir);
    }

    function render(now: number) {
      const ease = 0.42;
      player.x += (player.tx - player.x) * ease;
      player.y += (player.ty - player.y) * ease;
      if (Math.hypot(player.tx - player.x, player.ty - player.y) < 0.6) {
        player.x = player.tx;
        player.y = player.ty;
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
      <DiejieStage ready={ready} />
      <DiejieStyles />
    </>
  );
};

export default DiejiePage;
