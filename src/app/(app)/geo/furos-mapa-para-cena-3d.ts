import type { FuroMapa } from "./types";

/** Posição no plano XZ (Three.js): `y` do tipo = coordenada Z no mundo. */
export type FuroCena3D = { id: string; x: number; y: number };

/** Converte `lat`/`lng` para metros relativos ao 1.º furo (÷10 para caber na cena ~200). */
export function furosMapaParaCena3d(pontos: FuroMapa[]): FuroCena3D[] {
  if (pontos.length === 0) return [];
  const ref = pontos[0];
  const cosLat = Math.cos((ref.lat * Math.PI) / 180);
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * cosLat;
  const scale = 0.1;
  return pontos.map((p) => ({
    id: p.id,
    x: (p.lng - ref.lng) * mPerDegLng * scale,
    y: (p.lat - ref.lat) * mPerDegLat * scale,
  }));
}
