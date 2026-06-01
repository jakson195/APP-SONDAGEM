import type { RegistroDiarioBr } from "./types";

/** Máximas anuais (mm) a partir de série diária de precipitação. */
export function maximasAnuaisPrecipitacao(
  serie: RegistroDiarioBr[],
): { ano: number; maxMm: number }[] {
  const byYear = new Map<number, number>();
  for (const r of serie) {
    if (!(r.precipitacaoMm >= 0) || !Number.isFinite(r.precipitacaoMm)) continue;
    const y = new Date(r.data).getFullYear();
    if (!Number.isFinite(y) || y < 1900) continue;
    const prev = byYear.get(y) ?? 0;
    byYear.set(y, Math.max(prev, r.precipitacaoMm));
  }
  return [...byYear.entries()]
    .map(([ano, maxMm]) => ({ ano, maxMm }))
    .sort((a, b) => a.ano - b.ano);
}

export function serieMaximasAnuaisValores(serie: RegistroDiarioBr[]): number[] {
  return maximasAnuaisPrecipitacao(serie).map((x) => x.maxMm);
}

/** Acumulado de precipitação nos últimos N dias. */
export function acumuladoDias(serie: RegistroDiarioBr[], dias: number): number {
  const sorted = [...serie].sort((a, b) => a.data.localeCompare(b.data));
  const slice = sorted.slice(-dias);
  return slice.reduce((s, r) => s + Math.max(0, r.precipitacaoMm), 0);
}

/** Máxima diária nos últimos N dias. */
export function maxDiariaRecente(serie: RegistroDiarioBr[], dias: number): number {
  const sorted = [...serie].sort((a, b) => a.data.localeCompare(b.data));
  const slice = sorted.slice(-dias);
  if (!slice.length) return 0;
  return Math.max(...slice.map((r) => Math.max(0, r.precipitacaoMm)));
}
