import * as turf from "@turf/turf";
import type { MapLegendItem } from "../layers/active-layer-legend";

export type MapBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type LocationMapExportOpts = {
  mapDataUrl: string;
  mapWidth: number;
  mapHeight: number;
  bounds: MapBounds;
  legendItems: MapLegendItem[];
  bearing?: number;
  title?: string;
  areaLabel?: string;
  crsLabel?: string;
  dateLabel?: string;
  zoomLabel?: string;
};

const PAGE_MARGIN = 44;
const TITLE_HEIGHT = 56;
const FOOTER_HEIGHT = 40;
const LEGEND_WIDTH = 248;
const LEGEND_GAP = 20;
const MAP_FRAME = 1.5;
const FONT = "Arial, Helvetica, sans-serif";

function drawLegendSymbol(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  item: MapLegendItem,
) {
  ctx.save();
  if (item.kind === "line") {
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x, y + 7);
    ctx.lineTo(x + 24, y + 7);
    ctx.stroke();
  } else if (item.kind === "point") {
    ctx.fillStyle = item.color;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x + 12, y + 7, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillStyle = item.color;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, 24, 14);
    ctx.strokeRect(x, y, 24, 14);
  }
  ctx.restore();
}

function niceStep(span: number): number {
  if (span <= 0) return 1;
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  let nice = 10;
  if (norm <= 1) nice = 1;
  else if (norm <= 2) nice = 2;
  else if (norm <= 5) nice = 5;
  return nice * mag;
}

function formatCoordLon(lon: number): string {
  return `${Math.abs(lon).toFixed(2).replace(".", ",")}°${lon < 0 ? "W" : "E"}`;
}

function formatCoordLat(lat: number): string {
  return `${Math.abs(lat).toFixed(2).replace(".", ",")}°${lat < 0 ? "S" : "N"}`;
}

function geoToPixel(
  lon: number,
  lat: number,
  bounds: MapBounds,
  w: number,
  h: number,
): [number, number] {
  const x = ((lon - bounds.west) / (bounds.east - bounds.west)) * w;
  const y = ((bounds.north - lat) / (bounds.north - bounds.south)) * h;
  return [x, y];
}

function drawGraticule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  bounds: MapBounds,
) {
  const lonSpan = bounds.east - bounds.west;
  const latSpan = bounds.north - bounds.south;
  const lonStep = niceStep(lonSpan);
  const latStep = niceStep(latSpan);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
  ctx.lineWidth = 0.75;
  ctx.setLineDash([4, 4]);

  let lon = Math.ceil(bounds.west / lonStep) * lonStep;
  while (lon <= bounds.east) {
    const [px] = geoToPixel(lon, bounds.north, bounds, w, h);
    ctx.beginPath();
    ctx.moveTo(x + px, y);
    ctx.lineTo(x + px, y + h);
    ctx.stroke();
    lon += lonStep;
  }

  let lat = Math.ceil(bounds.south / latStep) * latStep;
  while (lat <= bounds.north) {
    const [, py] = geoToPixel(bounds.west, lat, bounds, w, h);
    ctx.beginPath();
    ctx.moveTo(x, y + py);
    ctx.lineTo(x + w, y + py);
    ctx.stroke();
    lat += latStep;
  }

  ctx.setLineDash([]);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "#000000";
  ctx.font = `9px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  lon = Math.ceil(bounds.west / lonStep) * lonStep;
  while (lon <= bounds.east) {
    const [px] = geoToPixel(lon, bounds.north, bounds, w, h);
    ctx.fillText(formatCoordLon(lon), x + px, y + h + 4);
    lon += lonStep;
  }

  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  lat = Math.ceil(bounds.south / latStep) * latStep;
  while (lat <= bounds.north) {
    const [, py] = geoToPixel(bounds.west, lat, bounds, w, h);
    ctx.fillText(formatCoordLat(lat), x - 6, y + py);
    lat += latStep;
  }
  ctx.restore();
}

function drawTrueNorthArrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  bearingDeg: number,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-bearingDeg * Math.PI) / 180);

  ctx.fillStyle = "#000000";
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.arc(0, 0, size * 0.12, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(-size * 0.34, size * 0.08);
  ctx.lineTo(0, -size * 0.24);
  ctx.lineTo(size * 0.34, size * 0.08);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, size * 0.08);
  ctx.lineTo(0, size * 0.5);
  ctx.stroke();

  ctx.restore();

  ctx.save();
  ctx.fillStyle = "#000000";
  ctx.font = `bold 10px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("N", cx, cy - size - 6);
  ctx.font = `8px ${FONT}`;
  ctx.textBaseline = "top";
  ctx.fillText("Norte verdadeiro", cx, cy + size + 4);
  ctx.restore();
}

function niceDistance(meters: number): number {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  for (const s of steps) {
    if (s >= meters * 0.8) return s;
  }
  return Math.ceil(meters / 10000) * 10000;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    const km = meters / 1000;
    return km >= 10 ? `${Math.round(km)} km` : `${km.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
  }
  return `${Math.round(meters)} m`;
}

function drawScaleBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  barPx: number,
  totalMeters: number,
) {
  const segments = 4;
  const segPx = barPx / segments;
  const segM = totalMeters / segments;

  ctx.save();
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1;
  ctx.font = `9px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#000000";

  for (let i = 0; i < segments; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#000000" : "#ffffff";
    ctx.fillRect(x + i * segPx, y, segPx, 8);
    ctx.strokeRect(x + i * segPx, y, segPx, 8);
  }

  for (let i = 0; i <= segments; i++) {
    const label = formatDistance(segM * i);
    ctx.fillStyle = "#000000";
    ctx.fillText(label, x + i * segPx, y + 11);
  }
  ctx.restore();
}

export function metersPerPixel(bounds: MapBounds, widthPx: number): number {
  const lat = (bounds.south + bounds.north) / 2;
  const west = turf.point([bounds.west, lat]);
  const east = turf.point([bounds.east, lat]);
  const widthM = turf.distance(west, east, { units: "kilometers" }) * 1000;
  return widthM / widthPx;
}

export function computeScaleDenominator(mpp: number, dpi = 96): number {
  const inchesToM = 0.0254;
  return Math.round(mpp / inchesToM * dpi);
}

export function roundNiceScale(raw: number): number {
  if (raw <= 0) return 1000;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const table = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10];
  for (const t of table) {
    if (norm <= t) return Math.round(t * mag);
  }
  return Math.round(10 * mag);
}

export function sirgas2000UtmLabel(lon: number, lat: number): string {
  const zone = Math.floor((lon + 180) / 6) + 1;
  const epsg = 31960 + zone;
  const hemi = lat < 0 ? "S" : "N";
  return `EPSG:${epsg} — SIRGAS 2000 / UTM zona ${zone}${hemi}`;
}

export async function exportLocationMapPng(opts: LocationMapExportOpts): Promise<Blob> {
  const legendPad = 12;
  const maxLegendItems = 24;
  const items = opts.legendItems.slice(0, maxLegendItems);
  const hasLegend = items.length > 0;
  const legendBodyHeight = hasLegend
    ? Math.max(
        96,
        items.length * 20 + legendPad * 2 + 28 + (opts.legendItems.length > maxLegendItems ? 18 : 0),
      )
    : 0;

  const mapX = PAGE_MARGIN + 52;
  const mapY = PAGE_MARGIN + TITLE_HEIGHT;
  const legendCol = hasLegend ? LEGEND_WIDTH + LEGEND_GAP : 0;
  const totalW = mapX + opts.mapWidth + legendCol + PAGE_MARGIN;
  const totalH = mapY + opts.mapHeight + 28 + FOOTER_HEIGHT + PAGE_MARGIN;
  const bearing = opts.bearing ?? 0;

  const canvas = document.createElement("canvas");
  canvas.width = totalW;
  canvas.height = totalH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, totalW, totalH);

  if (opts.title) {
    ctx.fillStyle = "#000000";
    ctx.font = `bold 18px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(opts.title, totalW / 2, PAGE_MARGIN + TITLE_HEIGHT / 2 - 4);
  }

  const mapImg = await loadImage(opts.mapDataUrl);
  if (mapImg.width < 2 || mapImg.height < 2) {
    throw new Error("Imagem do mapa inválida");
  }

  ctx.drawImage(mapImg, mapX, mapY, opts.mapWidth, opts.mapHeight);

  drawGraticule(ctx, mapX, mapY, opts.mapWidth, opts.mapHeight, opts.bounds);

  ctx.strokeStyle = "#000000";
  ctx.lineWidth = MAP_FRAME;
  ctx.strokeRect(mapX, mapY, opts.mapWidth, opts.mapHeight);

  const mpp = metersPerPixel(opts.bounds, opts.mapWidth);
  const scaleDenom = roundNiceScale(computeScaleDenominator(mpp));
  const barMeters = niceDistance(mpp * Math.min(220, opts.mapWidth * 0.28));
  const barPx = barMeters / mpp;

  drawScaleBar(ctx, mapX + 16, mapY + opts.mapHeight - 36, barPx, barMeters);
  drawTrueNorthArrow(ctx, mapX + opts.mapWidth - 52, mapY + 44, 20, bearing);

  ctx.fillStyle = "#000000";
  ctx.font = `10px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`Escala 1:${scaleDenom.toLocaleString("pt-BR")}`, mapX + 16, mapY + opts.mapHeight - 52);

  if (hasLegend) {
    const legendX = mapX + opts.mapWidth + LEGEND_GAP;
    const legendY = mapY;

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    ctx.fillRect(legendX, legendY, LEGEND_WIDTH, legendBodyHeight);
    ctx.strokeRect(legendX, legendY, LEGEND_WIDTH, legendBodyHeight);

    ctx.fillStyle = "#000000";
    ctx.font = `bold 11px ${FONT}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("Legenda", legendX + legendPad, legendY + 10);

    ctx.font = `10px ${FONT}`;
    let ly = legendY + 32;
    for (const item of items) {
      drawLegendSymbol(ctx, legendX + legendPad, ly - 8, item);
      ctx.fillStyle = "#000000";
      const label = item.label.length > 30 ? `${item.label.slice(0, 28)}…` : item.label;
      ctx.fillText(label, legendX + legendPad + 32, ly);
      ly += 20;
    }

    if (opts.legendItems.length > maxLegendItems) {
      ctx.fillStyle = "#444444";
      ctx.fillText(
        `+${opts.legendItems.length - maxLegendItems} camadas`,
        legendX + legendPad,
        ly,
      );
    }
  }

  const footerY = mapY + opts.mapHeight + 28;
  ctx.strokeStyle = "#cccccc";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(PAGE_MARGIN, footerY);
  ctx.lineTo(totalW - PAGE_MARGIN, footerY);
  ctx.stroke();

  ctx.fillStyle = "#000000";
  ctx.font = `9px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  const footerLines = [
    opts.crsLabel ?? "EPSG:4326 — WGS 84",
    opts.zoomLabel,
    opts.areaLabel,
    opts.dateLabel,
    "HidroGeo Brasil · CPRM / ANA / ANM",
  ].filter(Boolean) as string[];

  footerLines.forEach((line, i) => {
    ctx.fillText(line, PAGE_MARGIN, footerY + 8 + i * 12);
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Falha ao gerar PNG"));
    }, "image/png");
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Imagem do mapa inválida"));
    img.src = src;
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
