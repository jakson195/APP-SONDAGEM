import { corTipoRocha } from "@/lib/tipos-rocha";
import { geotechnicalColor, normalizeGeotechnicalLabel } from "./geotechnical-class";
import {
  attachResistivityNorm,
  classifyRhoOhmM,
  type ResistivityNormProfile,
} from "./resistivity-norms-br";
import { materialFromLithologyText } from "./lithology-resistivity-br";
import type { RegionalGeologyProfile } from "./interpret-types";
import {
  extractVisibleCells,
  type LayerUnit,
  type VisibleCell,
} from "./profile-layer-segmentation";
import type { Dipolo2DInvertParams, Dipolo2DInvertResult, Dipolo2DReading } from "./types";

export type FormationCandidate = {
  name: string;
  rhoMin: number;
  rhoMax: number;
  cor: string;
  depthOrder: number;
};

const DEFAULT_SEQUENCE: FormationCandidate[] = [
  { name: "Argila", rhoMin: 0, rhoMax: 500, cor: "#81d4fa", depthOrder: 0 },
  { name: "Rocha alterada", rhoMin: 500, rhoMax: 1500, cor: "#a1887f", depthOrder: 1 },
  { name: "Rocha sã", rhoMin: 1500, rhoMax: 10000, cor: "#374151", depthOrder: 2 },
];

function formationFromText(text: string, depthOrder: number): FormationCandidate | null {
  const mat = materialFromLithologyText(text);
  if (!mat) {
    const nome = text.trim().slice(0, 48);
    if (nome.length < 3) return null;
    return {
      name: nome,
      rhoMin: 20,
      rhoMax: 500,
      cor: corTipoRocha(nome) ?? "#94a3b8",
      depthOrder,
    };
  }
  return {
    name: text.includes("—") ? text.split("—")[0]!.trim() : mat.nome,
    rhoMin: mat.rhoMinOhmM,
    rhoMax: mat.rhoMaxOhmM,
    cor: mat.cor,
    depthOrder,
  };
}

/** Catálogo de formações esperadas na área (mapa + carta local). */
export function buildFormationCatalog(
  regional: RegionalGeologyProfile,
): FormationCandidate[] {
  const out: FormationCandidate[] = [];
  let order = 0;

  for (const f of regional.formations) {
    const fc = formationFromText(f, order++);
    if (fc && !out.some((x) => x.name.toLowerCase() === fc.name.toLowerCase())) {
      out.push(fc);
    }
  }
  for (const u of regional.mapUnits) {
    const label = u.sigla ? `${u.name} (${u.sigla})` : u.name;
    const lit = u.lithology && u.lithology !== u.name ? `${u.name} — ${u.lithology}` : label;
    const fc = formationFromText(lit, order++);
    if (fc && !out.some((x) => x.name.toLowerCase() === fc.name.toLowerCase())) {
      out.push({ ...fc, name: label.length < 40 ? label : fc.name });
    }
  }
  for (const m of regional.materials) {
    const fc = formationFromText(m.nome, order++);
    if (fc && !out.some((x) => x.name.toLowerCase() === fc.name.toLowerCase())) {
      out.push(fc);
    }
  }

  if (out.length < 4) {
    for (const d of DEFAULT_SEQUENCE) {
      if (!out.some((x) => x.name === d.name)) out.push(d);
    }
  }

  return out.sort((a, b) => a.depthOrder - b.depthOrder);
}

function meanDepthOfUnit(
  cells: VisibleCell[],
  unitId: number,
  layerId: Int32Array,
  nz: number,
): number {
  let sum = 0;
  let n = 0;
  for (const c of cells) {
    if (layerId[c.i * nz + c.j] !== unitId) continue;
    sum += c.zM;
    n++;
  }
  return n > 0 ? sum / n : 0;
}

function scoreFormation(rho: number, f: FormationCandidate): number {
  const logR = Math.log10(Math.max(rho, 0.5));
  const logLo = Math.log10(f.rhoMin);
  const logHi = Math.log10(Math.max(f.rhoMax, f.rhoMin * 1.05));
  const mid = (logLo + logHi) / 2;
  const half = Math.max(0.1, (logHi - logLo) / 2);
  return Math.max(0, 1 - Math.abs(logR - mid) / half);
}

/** Corpo vertical alto-ρ (ex.: diabásio). */
function detectIntrusionUnitId(
  result: Dipolo2DInvertResult,
  cells: VisibleCell[],
  layerId: Int32Array,
  units: LayerUnit[],
  nz: number,
): number | null {
  const nx = result.nx;
  const rhos = cells.map((c) => c.rhoOhmM).sort((a, b) => a - b);
  const p75 = rhos[Math.floor(rhos.length * 0.75)] ?? 200;

  let bestUnit = -1;
  let bestScore = 0;

  for (const u of units) {
    if (u.meanRhoOhmM < p75 * 1.4) continue;
    let maxColSpan = 0;
    for (let i = 0; i < nx; i++) {
      let span = 0;
      for (let j = 0; j < nz; j++) {
        if (layerId[i * nz + j] === u.id) span++;
      }
      maxColSpan = Math.max(maxColSpan, span);
    }
    const vertCells = cells.filter((c) => layerId[c.i * nz + c.j] === u.id);
    if (!vertCells.length) continue;
    const zMin = Math.min(...vertCells.map((c) => c.zM));
    const zMax = Math.max(...vertCells.map((c) => c.zM));
    const vertExtent = zMax - zMin;
    const zCover = result.zEdgesM[nz] ?? 1;
    const score = (vertExtent / zCover) * (maxColSpan / Math.max(1, nx * 0.25));
    if (score > bestScore && vertExtent / zCover > 0.45 && maxColSpan <= nx * 0.35) {
      bestScore = score;
      bestUnit = u.id;
    }
  }
  return bestScore > 0.5 ? bestUnit : null;
}

/**
 * Atribui nomes litostratigráficos às camadas segmentadas (estilo perfil interpretativo).
 */
export function assignFormationsToLayers(
  result: Dipolo2DInvertResult,
  params: Dipolo2DInvertParams,
  readings: Dipolo2DReading[],
  regional: RegionalGeologyProfile,
  layerId: Int32Array,
  units: LayerUnit[],
  resistivityNorm?: ResistivityNormProfile,
): LayerUnit[] {
  const norm = attachResistivityNorm(
    regional.anchorLat ?? 0,
    regional.anchorLng ?? 0,
    resistivityNorm ?? regional.resistivityNorm,
  );
  const nz = result.nz;
  const cells = extractVisibleCells(result, params, readings);
  const catalog = buildFormationCatalog(regional);
  const intrusionId = detectIntrusionUnitId(result, cells, layerId, units, nz);

  const byDepth = units
    .map((u) => ({
      u,
      depth: meanDepthOfUnit(cells, u.id, layerId, nz),
      rho: u.meanRhoOhmM,
    }))
    .sort((a, b) => a.depth - b.depth);

  const shallowCatalog = [...catalog].sort((a, b) => a.depthOrder - b.depthOrder);

  return byDepth.map(({ u, depth, rho }, idx) => {
    if (u.id === intrusionId) {
      const diab = catalog.find((f) => /diab|basalt|ígnea|ignea/i.test(f.name)) ?? {
        name: "Diabásio",
        cor: "#c62828",
        rhoMin: 300,
        rhoMax: 15000,
        depthOrder: 99,
      };
      return {
        ...u,
        material: diab.name.includes("Diab") ? diab.name : "Diabásio",
        cor: diab.cor,
        label: u.label,
      };
    }

    let best = shallowCatalog[Math.min(idx, shallowCatalog.length - 1)]!;
    let bestScore = -1;
    for (const f of catalog) {
      const depthBonus = 1 - Math.min(1, Math.abs(f.depthOrder - idx) / 4);
      const s = scoreFormation(rho, f) * (0.6 + 0.4 * depthBonus);
      if (s > bestScore) {
        bestScore = s;
        best = f;
      }
    }

    const cls = classifyRhoOhmM(rho, norm);
    const geoName = normalizeGeotechnicalLabel(best.name, rho, norm);

    return {
      ...u,
      material: geoName === cls.label ? cls.label : geoName,
      cor: geotechnicalColor(cls.label, norm),
      label: `L${idx + 1}`,
    };
  });
}

export type HorizontalLayerBand = {
  zTopM: number;
  zBaseM: number;
  material: string;
  cor: string;
  layerId: number;
};

/** Camadas horizontais (maioria por profundidade na malha) — para desenho do perfil. */
export function buildHorizontalLayerBands(
  result: Dipolo2DInvertResult,
  params: Dipolo2DInvertParams,
  readings: Dipolo2DReading[],
  layerId: Int32Array,
  units: LayerUnit[],
): HorizontalLayerBand[] {
  const nx = result.nx;
  const nz = result.nz;
  const dz = result.zEdgesM[nz]! / Math.max(1, nz);
  const unitMap = new Map(units.map((u) => [u.id, u]));

  type RowVote = { lid: number; count: number };
  const rows: RowVote[] = [];

  for (let j = 0; j < nz; j++) {
    const counts = new Map<number, number>();
    let visible = 0;
    for (let i = 0; i < nx; i++) {
      const lid = layerId[i * nz + j]!;
      if (lid < 0) continue;
      visible++;
      counts.set(lid, (counts.get(lid) ?? 0) + 1);
    }
    if (!visible) continue;
    let bestLid = -1;
    let bestN = 0;
    for (const [lid, n] of counts) {
      if (n > bestN) {
        bestN = n;
        bestLid = lid;
      }
    }
    if (bestLid >= 0) rows.push({ lid: bestLid, count: bestN });
  }

  if (!rows.length) return [];

  const bands: HorizontalLayerBand[] = [];
  let j0 = 0;
  while (j0 < rows.length) {
    const lid = rows[j0]!.lid;
    let j1 = j0 + 1;
    while (j1 < rows.length && rows[j1]!.lid === lid) j1++;
    const u = unitMap.get(lid);
    const zTop = result.zEdgesM[j0]!;
    const zBase =
      result.zEdgesM[Math.min(j1, nz - 1) + 1] ??
      result.zEdgesM[j1 - 1]! + dz;
    bands.push({
      zTopM: zTop,
      zBaseM: Math.min(zBase, result.zEdgesM[nz]!),
      material: u?.material ?? "—",
      cor: u?.cor ?? "#94a3b8",
      layerId: lid,
    });
    j0 = j1;
  }

  return bands;
}
