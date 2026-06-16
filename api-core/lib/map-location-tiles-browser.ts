/**
 * Montagem de mapa 640×360 no browser (fallback quando /api/map-location falha ou
 * o ambiente não alcança o servidor). Usa tiles com CORS habitual (Esri, Carto).
 * Não depende de chave Google.
 */

const OUT_W = 640;
const OUT_H = 360;

function lngLatToWorldPx(lng: number, lat: number, z: number) {
  const scale = 256 * 2 ** z;
  const x = ((lng + 180) / 360) * scale;
  const latRad = (lat * Math.PI) / 180;
  const y =
    ((1 -
      Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) /
      2) *
    scale;
  return { x, y };
}

async function loadTileBitmap(url: string): Promise<ImageBitmap | null> {
  try {
    const r = await fetch(url, { mode: "cors", cache: "force-cache" });
    if (!r.ok) return null;
    const blob = await r.blob();
    if (blob.size < 80) return null;
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

function esriUrl(z: number, x: number, y: number) {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
}

function osmUrl(z: number, x: number, y: number) {
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

/** Carto CDN costuma expor CORS para uso em canvas. */
function cartoUrl(z: number, x: number, y: number) {
  return `https://basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`;
}

async function oneTile(
  z: number,
  x: number,
  y: number,
  preferImagery: boolean,
): Promise<ImageBitmap | null> {
  if (preferImagery) {
    const a = await loadTileBitmap(esriUrl(z, x, y));
    if (a) return a;
  }
  const b = await loadTileBitmap(osmUrl(z, x, y));
  if (b) return b;
  const c = await loadTileBitmap(cartoUrl(z, x, y));
  if (c) return c;
  if (!preferImagery) {
    return loadTileBitmap(esriUrl(z, x, y));
  }
  return null;
}

function drawMarker(ctx: CanvasRenderingContext2D) {
  const cx = OUT_W / 2;
  const cy = OUT_H / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 10, 0, Math.PI * 2);
  ctx.fillStyle = "#0d9488";
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
}

/**
 * Desenha mapa centrado em WGS84. Retorna true se pelo menos um tile carregou.
 */
export async function drawMapLocationTilesOnCanvas(
  canvas: HTMLCanvasElement,
  lat: number,
  lng: number,
  zoom: number,
  preferImagery = true,
): Promise<boolean> {
  const z = Math.min(19, Math.max(1, Math.round(zoom)));
  const n = 2 ** z;

  canvas.width = OUT_W;
  canvas.height = OUT_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  ctx.fillStyle = preferImagery ? "#1e293b" : "#e2e8f0";
  ctx.fillRect(0, 0, OUT_W, OUT_H);

  const { x: worldX, y: worldY } = lngLatToWorldPx(lng, lat, z);
  const topLeftX = worldX - OUT_W / 2;
  const topLeftY = worldY - OUT_H / 2;

  const minTx = Math.floor(topLeftX / 256);
  const maxTx = Math.floor((topLeftX + OUT_W) / 256);
  const minTy = Math.floor(topLeftY / 256);
  const maxTy = Math.floor((topLeftY + OUT_H) / 256);

  let any = false;

  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (ty < 0 || ty >= n) continue;
      let normTx = tx;
      while (normTx < 0) normTx += n;
      while (normTx >= n) normTx -= n;

      const bmp = await oneTile(z, normTx, ty, preferImagery);
      if (!bmp) continue;
      any = true;
      const left = Math.round(tx * 256 - topLeftX);
      const top = Math.round(ty * 256 - topLeftY);
      try {
        ctx.drawImage(bmp, left, top);
      } finally {
        bmp.close();
      }
    }
  }

  if (any) drawMarker(ctx);
  return any;
}
