import { geologiaVisual } from "@/lib/geologia-visual";
import { defaultColorScale, paletteColor } from "./colormap";
import { findLabelRegions } from "./geotechnical-layer-grid";
import {
  pathTrapezoidCoverage,
  rasterizeLayerGridSection,
} from "./geotechnical-section-render";
import {
  buildModelZCoverProfile,
  rasterizeModelSection,
  zCoverInterpolated,
} from "./model-section-render";
import { formatNormLegend } from "./resistivity-norms-br";
import {
  formatRefRowRange,
  type ResistivityRefRow,
} from "./resistivity-reference-table-br";
import type { SectionGeologicInterpretation } from "./interpret-types";
import type { Dipolo2DInvertParams, Dipolo2DInvertResult, Dipolo2DReading } from "./types";
import type { LayerUnit } from "./profile-layer-segmentation";

function setupCanvas(canvas: HTMLCanvasElement, aspect = 0.88) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const w = canvas.clientWidth;
  const h = Math.min(760, Math.max(440, Math.floor(w * aspect)));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function blitRaster(
  ctx: CanvasRenderingContext2D,
  rgba: Uint8ClampedArray,
  rw: number,
  rh: number,
  x: number,
  y: number,
  w: number,
  h: number,
  clip?: () => void,
) {
  const off = document.createElement("canvas");
  off.width = rw;
  off.height = rh;
  const octx = off.getContext("2d");
  if (!octx) return;
  octx.putImageData(new ImageData(new Uint8ClampedArray(rgba), rw, rh), 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (clip) {
    ctx.save();
    clip();
    ctx.clip();
    ctx.drawImage(off, x, y, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(off, x, y, w, h);
  }
}

function parseHexColor(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  if (h.length === 6) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
  return [148, 163, 184];
}

const DEPTH_AXIS_W = 44;
const RHO_LEGEND_H = 34;

function drawResistivityScaleBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  logLo: number,
  logHi: number,
) {
  const h = 9;
  const steps = 120;
  for (let i = 0; i < steps; i++) {
    const t0 = i / Math.max(1, steps - 1);
    const [r, g, b] = paletteColor(defaultColorScale.palette, t0);
    const x0 = x + (i / steps) * width;
    const w0 = width / steps + 0.5;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x0, y, w0, h);
  }
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 0.6;
  ctx.strokeRect(x, y, width, h);

  const ticks = 6;
  ctx.fillStyle = "#334155";
  ctx.font = "8px system-ui,sans-serif";
  for (let t = 0; t <= ticks; t++) {
    const u = t / ticks;
    const xx = x + u * width;
    const rho = 10 ** (logLo + (logHi - logLo) * u);
    ctx.beginPath();
    ctx.moveTo(xx, y + h);
    ctx.lineTo(xx, y + h + 3);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillText(rho >= 100 ? rho.toFixed(0) : rho.toFixed(1), xx, y + h + 12);
  }
  ctx.textAlign = "left";
  ctx.fillText("Resistividade (Ω·m)", x, y + h + 22);
}

function drawDepthScale(
  ctx: CanvasRenderingContext2D,
  x0: number,
  yTop: number,
  height: number,
  zMin: number,
  zMax: number,
  sy: (z: number) => number,
  plotX0: number,
  plotW: number,
  drawGridLines: boolean,
) {
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(x0, yTop, DEPTH_AXIS_W - 2, height);

  ctx.fillStyle = "#334155";
  ctx.font = "600 9px system-ui,sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("Prof.", x0 + DEPTH_AXIS_W - 6, yTop + 10);
  ctx.fillText("(m)", x0 + DEPTH_AXIS_W - 6, yTop + 20);
  ctx.textAlign = "left";

  const ticks = 7;
  ctx.strokeStyle = "rgba(148,163,184,0.45)";
  ctx.fillStyle = "#475569";
  ctx.font = "10px system-ui,sans-serif";
  ctx.textAlign = "right";

  for (let t = 0; t <= ticks; t++) {
    const u = t / ticks;
    const z = zMin + (zMax - zMin) * u;
    const y = sy(z);
    if (drawGridLines) {
      ctx.beginPath();
      ctx.moveTo(plotX0, y);
      ctx.lineTo(plotX0 + plotW, y);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x0 + DEPTH_AXIS_W - 8, y);
    ctx.lineTo(x0 + DEPTH_AXIS_W - 2, y);
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = "rgba(148,163,184,0.45)";
    ctx.fillText(z >= 10 ? z.toFixed(0) : z.toFixed(1), x0 + DEPTH_AXIS_W - 10, y + 3);
  }
  ctx.textAlign = "left";
}

function drawRhoFaixaLegend(
  ctx: CanvasRenderingContext2D,
  x: number,
  yTop: number,
  width: number,
  rows: ResistivityRefRow[],
  unitsPresent: Set<string>,
) {
  const inPlot = rows.filter((r) => unitsPresent.has(r.meio));
  const items = inPlot.length > 0 ? inPlot : rows;
  if (!items.length) return;

  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(x, yTop, width, RHO_LEGEND_H);

  ctx.fillStyle = "#334155";
  ctx.font = "600 8px system-ui,sans-serif";
  ctx.fillText("Faixas de resistividade ρ (Ω·m)", x + 4, yTop + 9);

  const n = Math.max(1, items.length);
  const segW = width / n;
  const bandY = yTop + 12;
  const bandH = 8;
  items.forEach((row, i) => {
    const bx = x + i * segW;
    ctx.fillStyle = row.cor;
    ctx.fillRect(bx, bandY, segW, bandH);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 0.4;
    ctx.strokeRect(bx, bandY, segW, bandH);
    ctx.fillStyle = "#334155";
    ctx.font = "7px system-ui,sans-serif";
    const label = row.meio.length > 18 ? `${row.meio.slice(0, 16)}…` : row.meio;
    ctx.fillText(label, bx + 2, yTop + 28);
    ctx.fillStyle = "#64748b";
    const faixa = formatRefRowRange(row).replace(" Ω·m", "").replace(" – ", "-");
    ctx.fillText(faixa, bx + 2, yTop + 34);
  });
}

function unitsFromInterpretation(interpretation: SectionGeologicInterpretation): LayerUnit[] {
  return interpretation.layerUnits.map((u) => ({
    id: u.id,
    label: u.label,
    material: u.material,
    cor: u.cor,
    meanRhoOhmM: u.meanRhoOhmM,
    logRhoCentroid: 0,
    cellCount: u.cellCount,
  }));
}

function isInsideTrapezoid(
  xM: number,
  zM: number,
  zCoverProfile: Float64Array,
  x0: number,
  dx: number,
  nx: number,
  dz: number,
): boolean {
  const zCov = zCoverInterpolated(zCoverProfile, xM, x0, dx, nx);
  return zM <= zCov + dz * 0.35;
}

/**
 * Perfil em dois painéis: ρ (trapézio) + interpretação suave por classes de ρ.
 */
export function drawGeologicInterpretSection(
  canvas: HTMLCanvasElement,
  result: Dipolo2DInvertResult,
  params: Dipolo2DInvertParams,
  readings: Dipolo2DReading[],
  interpretation: SectionGeologicInterpretation,
) {
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, w, h } = setup;
  const padL = 12;
  const padR = 12;
  const padT = 40;
  const padB = 110;
  const gap = 44;
  const plotX0 = padL + DEPTH_AXIS_W;
  const plotX1 = w - padR;
  const plotW = plotX1 - plotX0;
  const totalPlotH = h - padT - padB - gap;
  const plotH = totalPlotH / 2;

  const nx = result.nx;
  const nz = result.nz;
  const x0 = result.xEdgesM[0]!;
  const x1 = result.xEdgesM[nx]!;
  const z0 = result.zEdgesM[0]!;
  const z1 = result.zEdgesM[nz]!;
  const dx = (x1 - x0) / Math.max(1, nx);
  const sx = (x: number) => plotX0 + ((x - x0) / (x1 - x0 || 1)) * plotW;
  const syTop = (z: number) => padT + (z / (z1 || 1)) * plotH;
  const syBot = (z: number) => padT + plotH + gap + (z / (z1 || 1)) * plotH;

  const layerId = Int32Array.from(interpretation.layerGrid);
  const logLo = interpretation.logRhoLo;
  const logHi = interpretation.logRhoHi;
  const units = unitsFromInterpretation(interpretation);
  const norm = interpretation.resistivityNorm;

  const zCoverProfile =
    readings.length > 0
      ? buildModelZCoverProfile(readings, x0, x1, nx, z1, params.factorDepth)
      : null;

  const rasterW = Math.max(128, Math.ceil(plotW * 4));
  const rasterH = Math.max(128, Math.ceil(plotH * 4));
  const classColors = units.map((u) => parseHexColor(u.cor));

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#111827";
  ctx.font = "700 13px system-ui,sans-serif";
  ctx.fillText("Perfil interpretativo — secção ERT", plotX0, 18);
  ctx.font = "10px system-ui,sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText(interpretation.regional.regionName, plotX0, 30);
  ctx.fillText(formatNormLegend(norm), plotX0, 42);

  const trapezoidClip =
    zCoverProfile && readings.length > 0
      ? () =>
          pathTrapezoidCoverage(
            ctx,
            zCoverProfile,
            x0,
            x1,
            nx,
            z0,
            sx,
            syTop,
          )
      : undefined;

  // —— Painel 1: ρ invertida (malha completa + recorte trapézio) ——
  ctx.fillStyle = "#0f172a";
  ctx.font = "600 11px system-ui,sans-serif";
  ctx.fillText("Seção geológica calculada (ρ invertida)", plotX0, padT - 8);

  const rhoRgba = rasterizeModelSection(
    result.mLog10,
    nx,
    nz,
    result.xEdgesM,
    result.zEdgesM,
    rasterW,
    rasterH,
    {
      logLo,
      logHi,
      colorScale: defaultColorScale,
      colorLevels: 24,
      displaySmoothPasses: 2,
      maskMode: "full",
    },
  );
  blitRaster(
    ctx,
    rhoRgba,
    rasterW,
    rasterH,
    plotX0,
    padT,
    plotW,
    plotH,
    trapezoidClip,
  );

  if (!zCoverProfile) {
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 1;
    ctx.strokeRect(plotX0, padT, plotW, plotH);
  } else {
    pathTrapezoidCoverage(ctx, zCoverProfile, x0, x1, nx, z0, sx, syTop);
    ctx.strokeStyle = "rgba(17,24,39,0.6)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  drawDepthScale(
    ctx,
    padL,
    padT,
    plotH,
    z0,
    z1,
    syTop,
    plotX0,
    plotW,
    false,
  );
  drawResistivityScaleBar(ctx, plotX0, padT + plotH + 5, plotW, logLo, logHi);

  // —— Painel 2: interpretativa (suave, trapézio) ——
  const yBot0 = padT + plotH + gap;

  ctx.fillStyle = "#0f172a";
  ctx.font = "600 11px system-ui,sans-serif";
  ctx.fillText("Seção geológica interpretativa", plotX0, yBot0 - 8);

  const geotech = rasterizeLayerGridSection(
    layerId,
    nx,
    nz,
    result.xEdgesM,
    result.zEdgesM,
    rasterW,
    rasterH,
    classColors,
  );
  blitRaster(
    ctx,
    geotech.rgba,
    geotech.width,
    geotech.height,
    plotX0,
    yBot0,
    plotW,
    plotH,
    trapezoidClip
      ? () =>
          pathTrapezoidCoverage(
            ctx,
            zCoverProfile!,
            x0,
            x1,
            nx,
            z0,
            sx,
            syBot,
          )
      : undefined,
  );

  if (!zCoverProfile) {
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 1;
    ctx.strokeRect(plotX0, yBot0, plotW, plotH);
  } else {
    pathTrapezoidCoverage(ctx, zCoverProfile, x0, x1, nx, z0, sx, syBot);
    ctx.strokeStyle = "rgba(17,24,39,0.6)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  drawDepthScale(
    ctx,
    padL,
    yBot0,
    plotH,
    z0,
    z1,
    syBot,
    plotX0,
    plotW,
    true,
  );

  const materialsInPlot = new Set(units.map((u) => u.material));
  drawRhoFaixaLegend(
    ctx,
    plotX0,
    yBot0 + plotH + 4,
    plotW,
    interpretation.classificationTable,
    materialsInPlot,
  );

  // Rótulos nas maiores manchas (só dentro do trapézio)
  const labelRegions = findLabelRegions(
    layerId,
    nx,
    nz,
    result.xEdgesM,
    result.zEdgesM,
    units,
  ).filter(
    (reg) =>
      !zCoverProfile ||
      isInsideTrapezoid(
        reg.xCenterM,
        reg.zCenterM,
        zCoverProfile,
        x0,
        dx,
        nx,
        (z1 - z0) / Math.max(1, nz),
      ),
  );

  for (const reg of labelRegions) {
    const px = sx(reg.xCenterM);
    const py = syBot(reg.zCenterM);
    const label = reg.material.toUpperCase();
    ctx.font = "700 11px system-ui,sans-serif";
    const tw = ctx.measureText(label).width;
    if (tw > plotW * 0.5) continue;

    const vis = geologiaVisual(reg.material, reg.cor);
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    const padX = 8;
    const padY = 5;
    const boxW = tw + padX * 2;
    const boxH = 20;
    const bx = px - boxW / 2;
    const by = py - boxH / 2;
    ctx.beginPath();
    ctx.roundRect(bx, by, boxW, boxH, 3);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#111827";
    ctx.textAlign = "center";
    ctx.fillText(label, px, py + 4);
    ctx.textAlign = "left";
  }

  const tickN = 5;
  ctx.font = "10px system-ui,sans-serif";
  ctx.fillStyle = "#475569";
  for (let t = 0; t <= tickN; t++) {
    const u = t / tickN;
    const xv = plotX0 + u * plotW;
    const xVal = x0 + (x1 - x0) * u;
    ctx.textAlign = "center";
    ctx.fillText(
      xVal >= 100 ? xVal.toFixed(0) : xVal.toFixed(1),
      xv,
      h - padB + RHO_LEGEND_H + 18,
    );
  }
  ctx.textAlign = "left";
  ctx.fillText("Distância (m)", plotX0 + plotW * 0.38, h - 14);

  ctx.fillStyle = "#64748b";
  ctx.font = "9px system-ui,sans-serif";
  ctx.fillText(
    "Trapézio = cobertura · secção interpretativa = tabela de classificação ρ",
    plotX0,
    h - 6,
  );
}
