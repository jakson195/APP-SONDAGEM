/**
 * Montagem de mapa 640×360 no browser (tiles com CORS ou API).
 */

import {
  mapLocationCaptionLines,
  type MapLocationCaption,
} from "@/lib/map-location-caption";
import { mapTileProvidersForBrowser } from "@/lib/map-location-providers";

const OUT_W = 640;
const OUT_H = 360;

const TILE_FETCH_HEADERS = {
  Accept: "image/png,image/webp,*/*",
};

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
    const r = await fetch(url, {
      mode: "cors",
      cache: "force-cache",
      headers: TILE_FETCH_HEADERS,
    });
    if (!r.ok) return null;
    const blob = await r.blob();
    if (blob.size < 80) return null;
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

async function oneTile(
  z: number,
  x: number,
  y: number,
  preferImagery: boolean,
): Promise<ImageBitmap | null> {
  const providers = mapTileProvidersForBrowser(preferImagery);
  for (const p of providers) {
    const bmp = await loadTileBitmap(p.url(z, x, y));
    if (bmp) return bmp;
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

function drawMapCaption(ctx: CanvasRenderingContext2D, caption: MapLocationCaption) {
  const lines = mapLocationCaptionLines(caption);
  const pad = 10;
  const lineH = 16;
  const boxH = 14 + lines.length * lineH;
  const y0 = OUT_H - boxH - 8;
  const x0 = 8;
  const w = OUT_W - 16;

  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  roundRect(ctx, x0, y0, w, boxH, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#0f172a";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  lines.forEach((line, i) => {
    ctx.font =
      i === 0
        ? "700 13px Arial, sans-serif"
        : "11px Arial, sans-serif";
    ctx.fillText(line, x0 + pad, y0 + 10 + i * lineH);
  });
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Desenha mapa centrado em WGS84. Retorna true se pelo menos um tile carregou.
 */
export async function drawMapLocationTilesOnCanvas(
  canvas: HTMLCanvasElement,
  lat: number,
  lng: number,
  zoom: number,
  preferImagery = false,
  caption?: MapLocationCaption,
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

  if (any) {
    drawMarker(ctx);
    if (caption) drawMapCaption(ctx, caption);
  }
  return any;
}

/** Esquema com grelha + pino (sempre disponível offline / sem tiles). */
export function drawPlaceholderMapDataUrl(
  lat: number,
  lng: number,
  zoom: number,
  caption?: MapLocationCaption,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = OUT_W;
  canvas.height = OUT_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(0, 0, OUT_W, OUT_H);

  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    const x = (i * OUT_W) / 8;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, OUT_H);
    ctx.stroke();
  }
  for (let j = 0; j <= 5; j++) {
    const y = (j * OUT_H) / 5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(OUT_W, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#0f172a";
  ctx.font = "700 14px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Mapa de localização (WGS84)", OUT_W / 2, 28);

  if (caption) {
    const lines = mapLocationCaptionLines(caption);
    ctx.font = "600 12px Arial, sans-serif";
    ctx.fillText(lines[0] ?? "Furo", OUT_W / 2, 52);
    if (lines[1]) {
      ctx.font = "11px Arial, sans-serif";
      ctx.fillStyle = "#475569";
      ctx.fillText(lines[1], OUT_W / 2, 70);
    }
    ctx.fillStyle = "#475569";
    ctx.font = "12px Arial, sans-serif";
    ctx.fillText(
      `${lat.toFixed(6)}, ${lng.toFixed(6)} · zoom ${zoom}`,
      OUT_W / 2,
      100,
    );
  }

  ctx.fillStyle = "#64748b";
  ctx.font = "10px Arial, sans-serif";
  ctx.fillText(
    "Vista esquemática — ligue à internet para imagem de satélite",
    OUT_W / 2,
    124,
  );

  drawMarker(ctx);
  if (caption) drawMapCaption(ctx, caption);

  try {
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}
