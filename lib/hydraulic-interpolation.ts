/**
 * Campo escalar 2D por IDW, isolinhas (marching squares) e gradiente para setas de fluxo.
 * Coordenadas planas aproximadas em metros relativos ao centro (equiretangular).
 */

export type XY = { x: number; y: number };

export type ScalarPoint = XY & { z: number };

export type BoundsM = { minX: number; maxX: number; minY: number; maxY: number };

const R_EARTH = 6371000;

export function latLngToLocalM(
  lat0: number,
  lng0: number,
  lat: number,
  lng: number,
): XY {
  const cos0 = Math.cos((lat0 * Math.PI) / 180);
  const x = ((lng - lng0) * Math.PI) / 180 * R_EARTH * cos0;
  const y = ((lat - lat0) * Math.PI) / 180 * R_EARTH;
  return { x, y };
}

export function localMToLatLng(
  lat0: number,
  lng0: number,
  p: XY,
): { lat: number; lng: number } {
  const cos0 = Math.cos((lat0 * Math.PI) / 180);
  const lat = lat0 + (p.y / R_EARTH) * (180 / Math.PI);
  const lng = lng0 + (p.x / (R_EARTH * cos0)) * (180 / Math.PI);
  return { lat, lng };
}

export function padBounds(b: BoundsM, padM: number): BoundsM {
  return {
    minX: b.minX - padM,
    maxX: b.maxX + padM,
    minY: b.minY - padM,
    maxY: b.maxY + padM,
  };
}

export function boundsFromPoints(pts: XY[], padM: number): BoundsM | null {
  if (pts.length === 0) return null;
  let minX = pts[0].x;
  let maxX = pts[0].x;
  let minY = pts[0].y;
  let maxY = pts[0].y;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const dx = maxX - minX;
  const dy = maxY - minY;
  const base = Math.max(dx, dy, 80);
  return padBounds({ minX, maxX, minY, maxY }, base * 0.12 + padM);
}

function idwValue(
  x: number,
  y: number,
  points: ScalarPoint[],
  power: number,
): number {
  let num = 0;
  let den = 0;
  for (const p of points) {
    const dx = x - p.x;
    const dy = y - p.y;
    const d2 = dx * dx + dy * dy;
    const d = Math.sqrt(d2);
    if (d < 1e-3) return p.z;
    const w = 1 / Math.pow(d, power);
    num += w * p.z;
    den += w;
  }
  return den > 0 ? num / den : points[0]?.z ?? 0;
}

export function buildIdwGrid(
  bounds: BoundsM,
  nx: number,
  ny: number,
  points: ScalarPoint[],
  power = 2,
): { grid: Float32Array; nx: number; ny: number } {
  const grid = new Float32Array(nx * ny);
  const dx = (bounds.maxX - bounds.minX) / Math.max(1, nx - 1);
  const dy = (bounds.maxY - bounds.minY) / Math.max(1, ny - 1);
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const x = bounds.minX + i * dx;
      const y = bounds.minY + j * dy;
      grid[j * nx + i] = idwValue(x, y, points, power);
    }
  }
  return { grid, nx, ny };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Isolinhas (marching squares). Coordenadas: canto inferior esquerdo da célula (i,j) = grid[i,j];
 * i aumenta para Leste, j para Norte.
 */
export function marchingSquaresSegments(
  grid: Float32Array,
  nx: number,
  ny: number,
  level: number,
): Array<{ ax: number; ay: number; bx: number; by: number }> {
  const segs: Array<{ ax: number; ay: number; bx: number; by: number }> = [];
  const at = (i: number, j: number) => grid[j * nx + i];

  const ib = (v0: number, v1: number, i: number, j: number) => {
    const t = (level - v0) / (v1 - v0 + 1e-12);
    return { x: i + t, y: j };
  };
  const ir = (v0: number, v1: number, i: number, j: number) => {
    const t = (level - v0) / (v1 - v0 + 1e-12);
    return { x: i + 1, y: j + t };
  };
  const it = (v0: number, v1: number, i: number, j: number) => {
    const t = (level - v0) / (v1 - v0 + 1e-12);
    return { x: i + 1 - t, y: j + 1 };
  };
  const il = (v0: number, v1: number, i: number, j: number) => {
    const t = (level - v0) / (v1 - v0 + 1e-12);
    return { x: i, y: j + 1 - t };
  };

  for (let j = 0; j < ny - 1; j += 1) {
    for (let i = 0; i < nx - 1; i += 1) {
      const v00 = at(i, j);
      const v10 = at(i + 1, j);
      const v11 = at(i + 1, j + 1);
      const v01 = at(i, j + 1);

      let caseId = 0;
      if (v00 >= level) caseId |= 1;
      if (v10 >= level) caseId |= 2;
      if (v11 >= level) caseId |= 4;
      if (v01 >= level) caseId |= 8;

      if (caseId === 0 || caseId === 15) continue;

      const amb = (v00 + v10 + v11 + v01) / 4 >= level;

      const push = (a: XY, b: XY) =>
        segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });

      switch (caseId) {
        case 1:
          push(ib(v00, v10, i, j), il(v01, v00, i, j));
          break;
        case 2:
          push(ib(v00, v10, i, j), ir(v10, v11, i, j));
          break;
        case 3:
          push(ir(v10, v11, i, j), il(v01, v00, i, j));
          break;
        case 4:
          push(ir(v10, v11, i, j), it(v11, v01, i, j));
          break;
        case 5:
          if (amb) {
            push(ib(v00, v10, i, j), ir(v10, v11, i, j));
            push(it(v11, v01, i, j), il(v01, v00, i, j));
          } else {
            push(ib(v00, v10, i, j), it(v11, v01, i, j));
            push(ir(v10, v11, i, j), il(v01, v00, i, j));
          }
          break;
        case 6:
          push(ib(v00, v10, i, j), it(v11, v01, i, j));
          break;
        case 7:
          push(il(v01, v00, i, j), it(v11, v01, i, j));
          break;
        case 8:
          push(it(v11, v01, i, j), il(v01, v00, i, j));
          break;
        case 9:
          if (amb) {
            push(ib(v00, v10, i, j), ir(v10, v11, i, j));
            push(it(v11, v01, i, j), il(v01, v00, i, j));
          } else {
            push(ib(v00, v10, i, j), it(v11, v01, i, j));
            push(ir(v10, v11, i, j), il(v01, v00, i, j));
          }
          break;
        case 10:
          if (amb) {
            push(ib(v00, v10, i, j), it(v11, v01, i, j));
            push(ir(v10, v11, i, j), il(v01, v00, i, j));
          } else {
            push(ib(v00, v10, i, j), il(v01, v00, i, j));
            push(ir(v10, v11, i, j), it(v11, v01, i, j));
          }
          break;
        case 11:
          push(ir(v10, v11, i, j), it(v11, v01, i, j));
          break;
        case 12:
          push(ir(v10, v11, i, j), il(v01, v00, i, j));
          break;
        case 13:
          push(ib(v00, v10, i, j), ir(v10, v11, i, j));
          break;
        case 14:
          push(ib(v00, v10, i, j), il(v01, v00, i, j));
          break;
        default:
          break;
      }
    }
  }
  return segs;
}

export function gridIndexToWorld(
  ix: number,
  iy: number,
  bounds: BoundsM,
  nx: number,
  ny: number,
): XY {
  const dx = (bounds.maxX - bounds.minX) / Math.max(1, nx - 1);
  const dy = (bounds.maxY - bounds.minY) / Math.max(1, ny - 1);
  return {
    x: bounds.minX + ix * dx,
    y: bounds.minY + iy * dy,
  };
}

export function gradientAt(
  grid: Float32Array,
  nx: number,
  ny: number,
  i: number,
  j: number,
  bounds: BoundsM,
): XY {
  const dx = (bounds.maxX - bounds.minX) / Math.max(1, nx - 1);
  const dy = (bounds.maxY - bounds.minY) / Math.max(1, ny - 1);
  const im = Math.max(0, i - 1);
  const ip = Math.min(nx - 1, i + 1);
  const jm = Math.max(0, j - 1);
  const jp = Math.min(ny - 1, j + 1);
  const dzx = (grid[j * nx + ip] - grid[j * nx + im]) / ((ip - im) * dx || 1);
  const dzy = (grid[jp * nx + i] - grid[jm * nx + i]) / ((jp - jm) * dy || 1);
  return { x: dzx, y: dzy };
}

export function blueWhiteColor(t: number): string {
  const x = Math.min(1, Math.max(0, t));
  const r = Math.round(lerp(15, 245, x));
  const g = Math.round(lerp(60, 245, x));
  const b = Math.round(lerp(140, 255, x));
  return `rgb(${r},${g},${b})`;
}

export type LatLngLiteral = { lat: number; lng: number };

/** Liga segmentos de isolinha numa grelha (coord. fracionárias i,j) em polilinhas WGS84. */
export function mergeGridSegmentsToPaths(
  segs: Array<{ ax: number; ay: number; bx: number; by: number }>,
  bounds: BoundsM,
  nx: number,
  ny: number,
  lat0: number,
  lng0: number,
): LatLngLiteral[][] {
  const dx = (bounds.maxX - bounds.minX) / Math.max(1, nx - 1);
  const dy = (bounds.maxY - bounds.minY) / Math.max(1, ny - 1);
  const toWorld = (gx: number, gy: number): XY => ({
    x: bounds.minX + gx * dx,
    y: bounds.minY + gy * dy,
  });
  const toLL = (p: XY): LatLngLiteral => {
    const ll = localMToLatLng(lat0, lng0, p);
    return { lat: ll.lat, lng: ll.lng };
  };

  const tol = 0.75;
  const eq = (a: XY, b: XY) =>
    Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol;

  type Seg = { a: XY; b: XY; used: boolean };
  const list: Seg[] = segs.map((s) => ({
    a: { x: s.ax, y: s.ay },
    b: { x: s.bx, y: s.by },
    used: false,
  }));

  const paths: LatLngLiteral[][] = [];

  for (;;) {
    const s0 = list.find((s) => !s.used);
    if (!s0) break;
    s0.used = true;
    const chain: XY[] = [toWorld(s0.a.x, s0.a.y), toWorld(s0.b.x, s0.b.y)];

    let changed = true;
    while (changed) {
      changed = false;
      const lastW = chain[chain.length - 1];
      const firstW = chain[0];

      for (const t of list) {
        if (t.used) continue;
        const taW = toWorld(t.a.x, t.a.y);
        const tbW = toWorld(t.b.x, t.b.y);
        if (eq(lastW, taW)) {
          chain.push(tbW);
          t.used = true;
          changed = true;
          break;
        }
        if (eq(lastW, tbW)) {
          chain.push(taW);
          t.used = true;
          changed = true;
          break;
        }
        if (eq(firstW, tbW)) {
          chain.unshift(taW);
          t.used = true;
          changed = true;
          break;
        }
        if (eq(firstW, taW)) {
          chain.unshift(tbW);
          t.used = true;
          changed = true;
          break;
        }
      }
    }

    paths.push(chain.map((p) => toLL(p)));
  }

  return paths;
}

export function buildHeatmapDataUrl(
  grid: Float32Array,
  nx: number,
  ny: number,
  zMin: number,
  zMax: number,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = nx;
  canvas.height = ny;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(nx, ny);
  const span = zMax - zMin || 1;
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const z = grid[(ny - 1 - j) * nx + i];
      const t = (z - zMin) / span;
      const c = blueWhiteColor(t);
      const m = /^rgb\((\d+),(\d+),(\d+)\)/.exec(c);
      const r = m ? Number(m[1]) : 200;
      const g = m ? Number(m[2]) : 200;
      const b = m ? Number(m[3]) : 255;
      const idx = (j * nx + i) * 4;
      img.data[idx] = r;
      img.data[idx + 1] = g;
      img.data[idx + 2] = b;
      img.data[idx + 3] = 200;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}
