import type { TemporalScene, Wgs84Bbox } from "../temporal-types";
import {
  cbersMissionForDate,
  landsatMissionForDate,
} from "../temporal-date-range";

export function landsatDemoScenes(
  bbox: Wgs84Bbox,
  dates: string[],
): TemporalScene[] {
  return dates.map((date, i) => ({
    id: `landsat-${date}-${i}`,
    provider: "landsat" as const,
    satellite: landsatMissionForDate(date),
    date,
    cloudCoverPct: 6 + (i * 8) % 45,
    bounds: bbox,
    demo: true,
  }));
}

export function sentinel2DemoScenes(
  bbox: Wgs84Bbox,
  dates: string[],
): TemporalScene[] {
  return dates.map((date, i) => ({
    id: `sentinel2-${date}-${i}`,
    provider: "sentinel2" as const,
    satellite: Number(date.slice(0, 4)) >= 2017 ? "Sentinel-2B" : "Sentinel-2A",
    date,
    cloudCoverPct: 5 + (i * 7) % 35,
    bounds: bbox,
    demo: true,
    tileUrl:
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  }));
}

export function srtmScene(bbox: Wgs84Bbox, date: string): TemporalScene {
  return {
    id: "srtm-dem",
    provider: "srtm",
    satellite: "SRTM GL1 / USGS 3DEP",
    date,
    bounds: bbox,
    wmsUrl:
      "https://elevation.nationalmap.gov/arcgis/services/3DEPElevation/ImageServer/WMSServer",
    wmsLayers: "0",
    demo: false,
  };
}

export { cbersMissionForDate };
