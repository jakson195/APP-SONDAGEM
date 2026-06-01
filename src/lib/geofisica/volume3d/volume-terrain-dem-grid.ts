/**
 * Obtém cotas DEM (mapa) na grelha planimétrica do volume 3D.
 */

import { localMToLatLng } from "@/lib/hydraulic-interpolation";
import type { ResistivityVolume3D } from "./volume3d-types";

export type DemSurfaceGridResult = {
  surfaceM: Float32Array;
  surfaceRefM: number;
  source: string;
  dataset: string;
  validCount: number;
};

function surfaceIndex(i: number, j: number, nx: number): number {
  return i + j * nx;
}

/** Gera pontos WGS84 nos centros das células do volume. */
export function volumeGridDemLocations(
  volume: Pick<
    ResistivityVolume3D,
    "nx" | "ny" | "boundsM" | "cellSizeM" | "anchorLat" | "anchorLng"
  >,
): { lat: number; lng: number; idx: number }[] {
  const { nx, ny, boundsM, cellSizeM, anchorLat, anchorLng } = volume;
  const out: { lat: number; lng: number; idx: number }[] = [];
  for (let j = 0; j < ny; j++) {
    const py = boundsM.minY + (j + 0.5) * cellSizeM.y;
    for (let i = 0; i < nx; i++) {
      const px = boundsM.minX + (i + 0.5) * cellSizeM.x;
      const ll = localMToLatLng(anchorLat, anchorLng, { x: px, y: py });
      out.push({ lat: ll.lat, lng: ll.lng, idx: surfaceIndex(i, j, nx) });
    }
  }
  return out;
}

/** Consulta DEM via API Next.js (grelha completa do volume). */
export async function fetchDemSurfaceGridForVolume(
  volume: Pick<
    ResistivityVolume3D,
    "nx" | "ny" | "boundsM" | "cellSizeM" | "anchorLat" | "anchorLng"
  >,
): Promise<DemSurfaceGridResult | null> {
  const res = await fetch("/api/geofisica/elevation/surface", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      anchorLat: volume.anchorLat,
      anchorLng: volume.anchorLng,
      boundsM: volume.boundsM,
      nx: volume.nx,
      ny: volume.ny,
    }),
  });

  const data = (await res.json()) as {
    ok?: boolean;
    surfaceM?: number[];
    surfaceRefM?: number;
    source?: string;
    dataset?: string;
    validCount?: number;
    error?: string;
  };

  if (!res.ok || !data.ok || !data.surfaceM?.length) {
    throw new Error(data.error ?? "Falha ao obter cotas DEM do mapa.");
  }

  const expected = volume.nx * volume.ny;
  if (data.surfaceM.length !== expected) {
    throw new Error("Resposta DEM incompleta para a grelha do volume.");
  }

  const validCount = data.validCount ?? data.surfaceM.filter(Number.isFinite).length;
  if (validCount < Math.max(4, expected * 0.25)) {
    throw new Error(
      "DEM devolveu poucas cotas válidas — confirme a posição das linhas no mapa.",
    );
  }

  return {
    surfaceM: Float32Array.from(data.surfaceM),
    surfaceRefM: data.surfaceRefM ?? 0,
    source: data.source ?? "DEM",
    dataset: data.dataset ?? "",
    validCount,
  };
}
