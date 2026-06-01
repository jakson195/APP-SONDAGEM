/**
 * Consulta cotas a serviços DEM públicos (OpenTopoData SRTM/ASTER, USGS EPQS).
 */

export type DemElevationPoint = {
  lat: number;
  lng: number;
  stationM?: number;
  elevationM: number | null;
};

export type DemFetchResult = {
  points: DemElevationPoint[];
  dataset: string;
  source: string;
};

const OPENTOPO_DATASETS = ["srtm30m", "aster30m"] as const;
const CHUNK_SIZE = 90;

async function fetchOpenTopoChunk(
  dataset: string,
  chunk: { lat: number; lng: number; stationM?: number }[],
): Promise<DemElevationPoint[]> {
  const locStr = chunk.map((p) => `${p.lat},${p.lng}`).join("|");
  const url = `https://api.opentopodata.org/v1/${dataset}?locations=${encodeURIComponent(locStr)}`;
  const res = await fetch(url, {
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    throw new Error(`OpenTopoData ${dataset} (${res.status})`);
  }
  const data = (await res.json()) as {
    results?: {
      elevation: number | null;
      location: { lat: number; lng: number };
    }[];
  };
  const results = data.results ?? [];
  return chunk.map((p, i) => ({
    lat: p.lat,
    lng: p.lng,
    stationM: p.stationM,
    elevationM:
      results[i]?.elevation != null && Number.isFinite(results[i]!.elevation)
        ? results[i]!.elevation!
        : null,
  }));
}

async function fetchOpenTopoDataset(
  dataset: string,
  locations: { lat: number; lng: number; stationM?: number }[],
): Promise<DemElevationPoint[]> {
  const out: DemElevationPoint[] = [];
  for (let i = 0; i < locations.length; i += CHUNK_SIZE) {
    const chunk = locations.slice(i, i + CHUNK_SIZE);
    const part = await fetchOpenTopoChunk(dataset, chunk);
    out.push(...part);
    if (i + CHUNK_SIZE < locations.length) {
      await new Promise((r) => setTimeout(r, 1100));
    }
  }
  return out;
}

/** USGS 3DEP EPQS — fallback ponto a ponto. */
async function fetchEpqsElevation(
  lat: number,
  lng: number,
): Promise<number | null> {
  const url = `https://epqs.nationalmap.gov/v1/json?x=${lng}&y=${lat}&units=Meters&wkid=4326`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) return null;
  const data = (await res.json()) as { value?: number | null };
  return data.value != null && Number.isFinite(data.value) ? data.value : null;
}

async function fillMissingWithEpqs(
  points: DemElevationPoint[],
): Promise<DemElevationPoint[]> {
  const out: DemElevationPoint[] = [];
  for (const p of points) {
    if (p.elevationM != null) {
      out.push(p);
      continue;
    }
    const elev = await fetchEpqsElevation(p.lat, p.lng);
    out.push({ ...p, elevationM: elev });
    await new Promise((r) => setTimeout(r, 120));
  }
  return out;
}

/** Obtém elevações para uma lista de pontos WGS84. */
export async function fetchDemElevations(
  locations: { lat: number; lng: number; stationM?: number }[],
): Promise<DemFetchResult> {
  if (locations.length === 0) {
    return { points: [], dataset: "none", source: "none" };
  }

  for (const dataset of OPENTOPO_DATASETS) {
    try {
      let points = await fetchOpenTopoDataset(dataset, locations);
      const valid = points.filter((p) => p.elevationM != null).length;
      if (valid < Math.max(2, locations.length * 0.4)) {
        continue;
      }
      if (valid < locations.length) {
        points = await fillMissingWithEpqs(points);
      }
      return {
        points,
        dataset: dataset.toUpperCase(),
        source: "OpenTopoData",
      };
    } catch {
      /* próximo dataset */
    }
  }

  const points = await fillMissingWithEpqs(
    locations.map((l) => ({ ...l, elevationM: null })),
  );
  return {
    points,
    dataset: "USGS-3DEP",
    source: "USGS EPQS",
  };
}
