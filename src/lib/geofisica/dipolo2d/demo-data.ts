import type { Dipolo2DReading } from "./types";

/**
 * Conjunto de demonstração (~91 leituras): 13 estações × 7 níveis n,
 * ρa sintética suave (variação lateral + profundidade).
 */
export function demoDipolo2DReadings91(): Dipolo2DReading[] {
  const a = 5;
  const stations: number[] = [];
  for (let i = 0; i < 13; i++) stations.push(i * 10);
  const out: Dipolo2DReading[] = [];
  for (const x of stations) {
    for (let n = 1; n <= 7; n++) {
      const zEff = n * a * 0.37;
      const rho =
        45 +
        35 * Math.tanh((zEff - 16) / 9) +
        8 * Math.sin((x / 55) * Math.PI * 2);
      out.push({
        stationM: x,
        n,
        rhoApparentOhmM: Math.max(12, rho),
        aM: a,
      });
    }
  }
  return out;
}
