/** Filtro de resistividade para visualização voxel (Ω·m). */

export type VolumeRhoFilter = {
  enabled: boolean;
  rhoMinOhmM: number;
  rhoMaxOhmM: number;
};

export const DEFAULT_RHO_FILTER: VolumeRhoFilter = {
  enabled: false,
  rhoMinOhmM: 10,
  rhoMaxOhmM: 500,
};

export type RhoFilterPreset = {
  id: string;
  label: string;
  min: number;
  max: number;
};

export const RHO_FILTER_PRESETS: RhoFilterPreset[] = [
  { id: "conductive", label: "10–50 Ω·m (condutivo)", min: 10, max: 50 },
  { id: "medium", label: "50–200 Ω·m (médio)", min: 50, max: 200 },
  { id: "resistive", label: "200–500 Ω·m", min: 200, max: 500 },
  { id: "high", label: "> 500 Ω·m (resistente)", min: 500, max: 10_000 },
];

export function rhoInFilter(
  rhoOhmM: number,
  filter: VolumeRhoFilter,
): boolean {
  if (!filter.enabled) return true;
  if (!Number.isFinite(rhoOhmM) || rhoOhmM <= 0) return false;
  return rhoOhmM >= filter.rhoMinOhmM && rhoOhmM <= filter.rhoMaxOhmM;
}

export function logRhoInFilter(
  logRho: number,
  filter: VolumeRhoFilter,
): boolean {
  if (!filter.enabled) return true;
  if (!Number.isFinite(logRho)) return false;
  return rhoInFilter(10 ** logRho, filter);
}

export function filterFromVolumeStats(
  logMin: number,
  logMax: number,
): VolumeRhoFilter {
  const rhoMin = Math.max(1, 10 ** logMin);
  const rhoMax = 10 ** logMax;
  return {
    enabled: false,
    rhoMinOhmM: Math.round(rhoMin),
    rhoMaxOhmM: Math.round(rhoMax),
  };
}
