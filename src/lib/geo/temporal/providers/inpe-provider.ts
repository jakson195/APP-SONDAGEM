import type { TemporalScene, Wgs84Bbox } from "../temporal-types";
import { cbersMissionForDate, inpeMissionForDate } from "../temporal-date-range";

/** Catálogo INPE / CBERS — referências WMS e metadados. */
export const INPE_WMS_ENDPOINTS = {
  cbers4: {
    label: "CBERS-4 (INPE)",
    wmsUrl: "https://www.dsr.inpe.br/geoserver/ows",
    layers: "cbers4:mosaic",
  },
  amazonia1: {
    label: "Amazonia-1 (INPE)",
    wmsUrl: "https://www.dsr.inpe.br/geoserver/ows",
    layers: "amazonia1:ortho",
  },
} as const;

export function inpeDemoScenes(
  bbox: Wgs84Bbox,
  dates: string[],
): TemporalScene[] {
  return dates.map((date, i) => ({
    id: `inpe-${date}-${i}`,
    provider: "inpe" as const,
    satellite: inpeMissionForDate(date),
    date,
    cloudCoverPct: 10 + (i * 5) % 40,
    bounds: bbox,
    wmsUrl: INPE_WMS_ENDPOINTS.cbers4.wmsUrl,
    wmsLayers: INPE_WMS_ENDPOINTS.cbers4.layers,
    demo: !process.env.INPE_API_TOKEN?.trim(),
  }));
}

export function cbersScenes(
  bbox: Wgs84Bbox,
  dates: string[],
): TemporalScene[] {
  return dates.map((date, i) => ({
    id: `cbers-${date}-${i}`,
    provider: "cbers" as const,
    satellite: cbersMissionForDate(date),
    date,
    cloudCoverPct: 8 + (i * 6) % 35,
    bounds: bbox,
    wmsUrl: INPE_WMS_ENDPOINTS.cbers4.wmsUrl,
    wmsLayers: INPE_WMS_ENDPOINTS.cbers4.layers,
    demo: !process.env.INPE_API_TOKEN?.trim(),
  }));
}
