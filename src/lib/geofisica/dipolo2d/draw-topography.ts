import { interpolateTopographyAt } from "./parse-topography";
import type { TopographyPoint } from "./topography-types";

export type TopographyDrawParams = {
  points: TopographyPoint[];
  x0: number;
  x1: number;
  padL: number;
  padT: number;
  plotW: number;
  plotH: number;
};

const LABEL_ROW_H = 15;

export function resolveTopoBandHeight(
  pointCount: number,
  basePlotH: number,
): number {
  const terrainH = 30;
  const extra = pointCount > 50 ? 6 : 0;
  return Math.max(
    terrainH + LABEL_ROW_H + extra,
    Math.min(basePlotH * 0.22, 92),
  );
}

function formatCota(elevM: number): string {
  if (Math.abs(elevM) >= 100) return elevM.toFixed(1);
  return elevM.toFixed(2);
}

/** Desenha relevo na faixa superior da secção (acima do modelo, sem sobrepor resistividade). */
export function drawTopographyOnSection(
  ctx: CanvasRenderingContext2D,
  p: TopographyDrawParams,
): { elevMin: number; elevMax: number } | null {
  const { points, x0, x1, padL, padT, plotW, plotH } = p;
  if (points.length < 2) return null;

  const sorted = [...points].sort((a, b) => a.stationM - b.stationM);
  const elevMin = Math.min(...sorted.map((pt) => pt.elevationM));
  const elevMax = Math.max(...sorted.map((pt) => pt.elevationM));
  const elevSpan = Math.max(0.5, elevMax - elevMin);
  const bandH = Math.max(18, plotH);
  const bandBottom = padT + bandH;
  const labelRowTop = bandBottom - LABEL_ROW_H;
  const terrainH = labelRowTop - padT;

  const profileX0 = Math.min(x0, sorted[0]!.stationM);
  const profileX1 = Math.max(x1, sorted[sorted.length - 1]!.stationM);
  const sx = (x: number) =>
    padL + ((x - profileX0) / (profileX1 - profileX0 || 1)) * plotW;
  const sy = (elev: number) =>
    padT + ((elevMax - elev) / elevSpan) * terrainH;

  const samples = Math.max(120, Math.ceil(plotW / 3));
  const pathPts: { x: number; y: number }[] = [];
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const xm = profileX0 + (profileX1 - profileX0) * u;
    const elev = interpolateTopographyAt(sorted, xm);
    if (elev == null) continue;
    pathPts.push({ x: sx(xm), y: sy(elev) });
  }
  if (pathPts.length < 2) return null;

  const visiblePoints = sorted;
  const avgSpacingPx =
    visiblePoints.length > 1
      ? plotW / Math.max(1, visiblePoints.length - 1)
      : plotW;
  const denseLabels = avgSpacingPx < 26;

  ctx.save();

  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 1;
  ctx.strokeRect(padL, padT, plotW, bandH);

  ctx.strokeStyle = "rgba(17,24,39,0.25)";
  ctx.beginPath();
  ctx.moveTo(padL, labelRowTop);
  ctx.lineTo(padL + plotW, labelRowTop);
  ctx.stroke();

  // Zona “ar/solo” acima da superfície
  ctx.beginPath();
  ctx.moveTo(pathPts[0]!.x, padT);
  for (const pt of pathPts) ctx.lineTo(pt.x, pt.y);
  ctx.lineTo(pathPts[pathPts.length - 1]!.x, padT);
  ctx.closePath();
  ctx.fillStyle = "rgba(210, 225, 195, 0.75)";
  ctx.fill();

  // Preenchimento superficial até a linha do terreno
  ctx.beginPath();
  ctx.moveTo(pathPts[0]!.x, pathPts[0]!.y);
  for (const pt of pathPts) ctx.lineTo(pt.x, pt.y);
  ctx.lineTo(pathPts[pathPts.length - 1]!.x, labelRowTop);
  ctx.lineTo(pathPts[0]!.x, labelRowTop);
  ctx.closePath();
  ctx.fillStyle = "rgba(120, 168, 90, 0.42)";
  ctx.fill();

  // Linha do terreno (perfil completo x0 → x1)
  ctx.strokeStyle = "#0f3d1a";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  pathPts.forEach((pt, i) => {
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  });
  ctx.stroke();

  // Eixo vertical — escala de cotas
  const tickCount = 4;
  ctx.strokeStyle = "rgba(17,24,39,0.55)";
  ctx.fillStyle = "#111827";
  ctx.font = "9px Arial,sans-serif";
  ctx.textAlign = "right";
  for (let t = 0; t <= tickCount; t++) {
    const u = t / tickCount;
    const elev = elevMax - elevSpan * u;
    const y = padT + u * terrainH;
    ctx.beginPath();
    ctx.moveTo(padL - 4, y);
    ctx.lineTo(padL, y);
    ctx.stroke();
    ctx.fillText(formatCota(elev), padL - 7, y + 3);
    if (t > 0 && t < tickCount) {
      ctx.strokeStyle = "rgba(17,24,39,0.1)";
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      ctx.strokeStyle = "rgba(17,24,39,0.55)";
    }
  }

  ctx.fillStyle = "#374151";
  ctx.font = "10px Arial,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Cota (m)", 6, padT + 10);

  ctx.fillStyle = "#14532d";
  ctx.font = "bold 10px Arial,sans-serif";
  ctx.fillText("Topografia", padL + 4, padT + 10);

  // Marcadores + cotas em todas as estações ao longo do perfil
  ctx.font = denseLabels ? "7px Arial,sans-serif" : "8px Arial,sans-serif";
  ctx.fillStyle = "#14532d";
  ctx.strokeStyle = "rgba(15,61,26,0.45)";
  ctx.lineWidth = 1;

  for (const pt of visiblePoints) {
    const x = sx(pt.stationM);
    const y = sy(pt.elevationM);
    const label = formatCota(pt.elevationM);

    ctx.fillStyle = "#0f3d1a";
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x, y + 3);
    ctx.lineTo(x, labelRowTop + 1);
    ctx.stroke();

    if (denseLabels) {
      ctx.save();
      ctx.translate(x, bandBottom - 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "left";
      ctx.fillStyle = "#14532d";
      ctx.fillText(label, 0, 0);
      ctx.restore();
    } else {
      ctx.textAlign = "center";
      ctx.fillStyle = "#14532d";
      ctx.fillText(label, x, bandBottom - 3);
    }
  }

  // Cotas nas extremidades do perfil (interpoladas em x0 e x1)
  const edgeLabels: { x: number; elev: number; anchor: "left" | "center" | "right" }[] = [];
  const elevAtX0 = interpolateTopographyAt(sorted, profileX0);
  const elevAtX1 = interpolateTopographyAt(sorted, profileX1);
  if (elevAtX0 != null) {
    edgeLabels.push({ x: sx(profileX0), elev: elevAtX0, anchor: "left" });
  }
  if (elevAtX1 != null) {
    edgeLabels.push({ x: sx(profileX1), elev: elevAtX1, anchor: "right" });
  }

  ctx.font = "8px Arial,sans-serif";
  ctx.fillStyle = "#0f3d1a";
  for (const edge of edgeLabels) {
    const hasNearby = visiblePoints.some(
      (pt) => Math.abs(sx(pt.stationM) - edge.x) < (denseLabels ? 10 : 18),
    );
    if (hasNearby) continue;
    ctx.textAlign = edge.anchor;
    ctx.fillText(formatCota(edge.elev), edge.x, bandBottom - 3);
  }

  ctx.restore();

  return { elevMin, elevMax };
}
