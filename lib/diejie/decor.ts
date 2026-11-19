// Wall decorations (trees and glowing plants) drawn onto the maze's decor layer.
import { cellCenterAt, mulberry32, qbez, seedFor, wallMidAt } from './maze';

export function drawTreeAt(
  tctx: CanvasRenderingContext2D,
  CELL: number,
  r: number,
  c: number,
  dir: 'N' | 'E' | 'S' | 'W',
) {
  const mid = wallMidAt(CELL, r, c, dir);
  const rand = mulberry32(seedFor(r, c, dir));
  const horizontal = dir === 'N' || dir === 'S';
  const along = horizontal ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const into = horizontal ? { x: 0, y: dir === 'N' ? 1 : -1 } : { x: dir === 'W' ? 1 : -1, y: 0 };

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

export function drawPlantAt(
  tctx: CanvasRenderingContext2D,
  CELL: number,
  r: number,
  c: number,
  dir: 'N' | 'E' | 'S' | 'W',
) {
  const mid = wallMidAt(CELL, r, c, dir);
  const rand = mulberry32(seedFor(r, c, dir) + 5000);
  const center = cellCenterAt(CELL, r, c);
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
