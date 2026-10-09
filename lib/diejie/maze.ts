// Pure maze generation and small helpers for the 叠界 · 光域迷宫 page.

export type MazeWall = 'N' | 'E' | 'S' | 'W';
export type MazeCell = Record<MazeWall, boolean> & { visited: boolean };
export type MazeDirection = { name: MazeWall; dr: number; dc: number; opp: MazeWall };

export function generateMaze(rows: number, cols: number) {
  const cells: Array<Array<MazeCell>> = [];
  for (let r = 0; r < rows; r++) {
    const row: Array<MazeCell> = [];
    for (let c = 0; c < cols; c++) row.push({ N: true, E: true, S: true, W: true, visited: false });
    cells.push(row);
  }
  const dirs: MazeDirection[] = [
    { name: 'N', dr: -1, dc: 0, opp: 'S' },
    { name: 'E', dr: 0, dc: 1, opp: 'W' },
    { name: 'S', dr: 1, dc: 0, opp: 'N' },
    { name: 'W', dr: 0, dc: -1, opp: 'E' },
  ];
  const stack = [{ r: 0, c: 0 }];
  cells[0][0].visited = true;
  while (stack.length) {
    const { r, c } = stack[stack.length - 1];
    const options: Array<MazeDirection & { nr: number; nc: number }> = [];
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

export function wallMidAt(cell: number, r: number, c: number, dir: MazeWall) {
  const cx = c * cell;
  const cy = r * cell;
  if (dir === 'N') return { x: cx + cell / 2, y: cy };
  if (dir === 'S') return { x: cx + cell / 2, y: cy + cell };
  if (dir === 'W') return { x: cx, y: cy + cell / 2 };
  return { x: cx + cell, y: cy + cell / 2 };
}

export function cellCenterAt(cell: number, r: number, c: number) {
  return { x: c * cell + cell / 2, y: r * cell + cell / 2 };
}

export function fmtTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFor(r: number, c: number, dir: 'N' | 'E' | 'S' | 'W') {
  const dirIdx = { N: 0, E: 1, S: 2, W: 3 }[dir];
  return (r * 97 + c * 131 + dirIdx * 181 + 907) >>> 0;
}

export function qbez(
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
