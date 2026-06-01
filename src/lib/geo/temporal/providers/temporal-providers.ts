import type {
  TemporalCatalogRequest,
  TemporalCatalogResponse,
  TemporalProvider,
  TemporalScene,
  Wgs84Bbox,
} from "../temporal-types";
import {
  defaultCatalogLimit,
  filterDatesForProvider,
  sampleTemporalDates,
} from "../temporal-date-range";
import {
  landsatDemoScenes,
  sentinel2DemoScenes,
} from "./landsat-srtm-provider";

export type ProviderCapabilities = {
  id: TemporalProvider;
  label: string;
  satellites: string[];
  supportsIndices: boolean;
  supportsTimeline: boolean;
  configured: boolean;
};

function isConfigured(provider: TemporalProvider): boolean {
  switch (provider) {
    case "gee":
      return Boolean(
        process.env.GEE_SERVICE_ACCOUNT?.trim() ||
          process.env.GEE_API_KEY?.trim(),
      );
    case "sentinel_hub":
      return Boolean(
        process.env.SENTINEL_HUB_CLIENT_ID?.trim() &&
          process.env.SENTINEL_HUB_CLIENT_SECRET?.trim(),
      );
    case "inpe":
      return Boolean(process.env.INPE_API_TOKEN?.trim());
    case "sentinel2":
      return Boolean(
        process.env.COPERNICUS_USER?.trim() ||
          process.env.COPERNICUS_USERNAME?.trim(),
      );
    default:
      return true;
  }
}

export function listProviderCapabilities(): ProviderCapabilities[] {
  return [
    {
      id: "gee",
      label: "Google Earth Engine",
      satellites: ["Landsat", "Sentinel-2", "SRTM", "CBERS"],
      supportsIndices: true,
      supportsTimeline: true,
      configured: isConfigured("gee"),
    },
    {
      id: "sentinel_hub",
      label: "Sentinel Hub",
      satellites: ["Sentinel-2", "Landsat-8/9"],
      supportsIndices: true,
      supportsTimeline: true,
      configured: isConfigured("sentinel_hub"),
    },
    {
      id: "inpe",
      label: "INPE",
      satellites: ["CBERS-4", "Amazonia-1"],
      supportsIndices: true,
      supportsTimeline: true,
      configured: isConfigured("inpe"),
    },
    {
      id: "sentinel2",
      label: "Sentinel-2 (Copernicus CDSE)",
      satellites: ["Sentinel-2A", "Sentinel-2B"],
      supportsIndices: true,
      supportsTimeline: true,
      configured: isConfigured("sentinel2"),
    },
    {
      id: "landsat",
      label: "Landsat (USGS)",
      satellites: ["Landsat 1-9", "arquivo 1972+"],
      supportsIndices: true,
      supportsTimeline: true,
      configured: true,
    },
    {
      id: "cbers",
      label: "CBERS (INPE)",
      satellites: ["CBERS-4", "CBERS-4A"],
      supportsIndices: true,
      supportsTimeline: true,
      configured: isConfigured("inpe"),
    },
    {
      id: "srtm",
      label: "SRTM / DEM",
      satellites: ["SRTM v3"],
      supportsIndices: false,
      supportsTimeline: false,
      configured: true,
    },
  ];
}

function demoScenesForProvider(
  provider: TemporalProvider,
  bbox: Wgs84Bbox,
  dates: string[],
  satellite: string,
): TemporalScene[] {
  if (provider === "landsat") {
    return landsatDemoScenes(bbox, dates);
  }
  if (provider === "sentinel2") {
    return sentinel2DemoScenes(bbox, dates);
  }
  return dates.map((date, i) => ({
    id: `${provider}-${date}-${i}`,
    provider,
    satellite,
    date,
    cloudCoverPct: 5 + (i * 7) % 35,
    bounds: bbox,
    demo: true,
    tileUrl:
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  }));
}

export async function fetchDemoCatalog(
  req: TemporalCatalogRequest,
): Promise<TemporalCatalogResponse> {
  const providers = req.providers ?? [
    "sentinel2",
    "landsat",
    "cbers",
    "srtm",
  ];
  const catalogLimit =
    req.limit ?? defaultCatalogLimit(req.dateFrom, req.dateTo);
  const sampled = sampleTemporalDates(
    req.dateFrom,
    req.dateTo,
    catalogLimit,
  );
  const scenes: TemporalScene[] = [];

  for (const p of providers) {
    const dates = filterDatesForProvider(p, sampled);
    switch (p) {
      case "sentinel2":
        scenes.push(...demoScenesForProvider(p, req.bbox, dates, "Sentinel-2 L2A"));
        break;
      case "landsat":
        scenes.push(...demoScenesForProvider(p, req.bbox, dates, "Landsat"));
        break;
      case "cbers":
        scenes.push(...demoScenesForProvider(p, req.bbox, dates, "CBERS-4"));
        break;
      case "srtm":
        scenes.push({
          id: "srtm-static",
          provider: "srtm",
          satellite: "SRTM GL1",
          date: req.dateTo,
          bounds: req.bbox,
          wmsUrl:
            "https://elevation.nationalmap.gov/arcgis/services/3DEPElevation/ImageServer/WMSServer",
          wmsLayers: "0",
        });
        break;
      default:
        scenes.push(...demoScenesForProvider(p, req.bbox, dates, p));
    }
  }

  const filtered = scenes.filter(
    (s) => (s.cloudCoverPct ?? 0) <= (req.maxCloudPct ?? 100),
  );

  return {
    scenes: filtered.slice(0, catalogLimit),
    providersUsed: providers,
    demoMode: true,
    warnings: [
      "Modo demonstração — configure GEE, Sentinel Hub ou Copernicus para cenas reais.",
    ],
  };
}
