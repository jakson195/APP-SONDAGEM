import type {
  TemporalCatalogRequest,
  TemporalCatalogResponse,
  TemporalProvider,
} from "./temporal-types";
import {
  defaultCatalogLimit,
  filterDatesForProvider,
  sampleTemporalDates,
} from "./temporal-date-range";
import { fetchDemoCatalog } from "./providers/temporal-providers";
import { searchSentinel2Scenes } from "./providers/sentinel2-provider";
import { inpeDemoScenes, cbersScenes } from "./providers/inpe-provider";
import {
  landsatDemoScenes,
  sentinel2DemoScenes,
  srtmScene,
} from "./providers/landsat-srtm-provider";
import { searchLandsatStac } from "./providers/landsat-stac-provider";
import {
  engineSceneToTemporal,
  searchLandsatEngineCatalog,
} from "./landsat-engine-client";
import { isGeeConfigured } from "./providers/gee-provider";
import { isSentinelHubConfigured } from "./providers/sentinel-hub-provider";

export async function fetchTemporalCatalog(
  req: TemporalCatalogRequest,
): Promise<TemporalCatalogResponse> {
  const providers = req.providers ?? [
    "sentinel2",
    "landsat",
    "cbers",
    "inpe",
    "srtm",
  ];
  const warnings: string[] = [];
  const scenes = [];
  let demoMode = false;

  const catalogLimit =
    req.limit ?? defaultCatalogLimit(req.dateFrom, req.dateTo);
  const sampledDates = sampleTemporalDates(
    req.dateFrom,
    req.dateTo,
    catalogLimit,
  );

  if (providers.includes("sentinel2")) {
    try {
      const s2 = await searchSentinel2Scenes({
        bbox: req.bbox,
        dateFrom: req.dateFrom,
        dateTo: req.dateTo,
        maxCloudPct: req.maxCloudPct,
        limit: catalogLimit,
      });
      if (s2.length > 0) {
        scenes.push(...s2);
      } else {
        warnings.push("Sentinel-2: sem cenas CDSE — modo demo (2015+).");
        demoMode = true;
        const s2Dates = filterDatesForProvider("sentinel2", sampledDates);
        scenes.push(...sentinel2DemoScenes(req.bbox, s2Dates));
      }
    } catch (e) {
      warnings.push(
        e instanceof Error ? e.message : "Falha ao consultar Sentinel-2.",
      );
      demoMode = true;
      const s2Dates = filterDatesForProvider("sentinel2", sampledDates);
      scenes.push(...sentinel2DemoScenes(req.bbox, s2Dates));
    }
  }

  if (providers.includes("landsat")) {
    let landsatLoaded = false;
    try {
      const engine = await searchLandsatEngineCatalog({
        bbox: req.bbox,
        dateFrom: req.dateFrom,
        dateTo: req.dateTo,
        maxCloudPct: req.maxCloudPct,
        limit: catalogLimit,
      });
      if (engine.scenes.length > 0) {
        scenes.push(
          ...engine.scenes.map((s) => engineSceneToTemporal(s, req.bbox)),
        );
        landsatLoaded = true;
        if (engine.warnings.length) warnings.push(...engine.warnings);
        warnings.push(
          `Landsat Engine (Python): ${engine.scenes.length} cenas · ${engine.sources.join(", ")}`,
        );
      }
    } catch (e) {
      warnings.push(
        e instanceof Error ? e.message : "Landsat Engine Python indisponível.",
      );
    }

    if (!landsatLoaded) {
      try {
        const ls = await searchLandsatStac({
          bbox: req.bbox,
          dateFrom: req.dateFrom,
          dateTo: req.dateTo,
          maxCloudPct: req.maxCloudPct,
          limit: catalogLimit,
        });
        if (ls.length > 0) {
          scenes.push(...ls);
          landsatLoaded = true;
        } else {
          warnings.push("Landsat STAC: sem cenas — modo demo.");
          demoMode = true;
          const landsatDates = filterDatesForProvider("landsat", sampledDates);
          scenes.push(...landsatDemoScenes(req.bbox, landsatDates));
        }
      } catch (e) {
        warnings.push(
          e instanceof Error ? e.message : "Falha ao consultar Landsat STAC.",
        );
        demoMode = true;
        const landsatDates = filterDatesForProvider("landsat", sampledDates);
        scenes.push(...landsatDemoScenes(req.bbox, landsatDates));
      }
    }
  }
  if (providers.includes("inpe")) {
    const inpeDates = filterDatesForProvider("inpe", sampledDates);
    scenes.push(...inpeDemoScenes(req.bbox, inpeDates));
  }
  if (providers.includes("cbers")) {
    const cbersDates = filterDatesForProvider("cbers", sampledDates);
    scenes.push(...cbersScenes(req.bbox, cbersDates));
  }
  if (providers.includes("srtm")) {
    scenes.push(srtmScene(req.bbox, req.dateTo));
  }

  if (providers.includes("gee") && !isGeeConfigured()) {
    warnings.push("GEE: configure GEE_SERVICE_ACCOUNT ou GEE_API_KEY.");
  }
  if (providers.includes("sentinel_hub") && !isSentinelHubConfigured()) {
    warnings.push("Sentinel Hub: configure CLIENT_ID e CLIENT_SECRET.");
  }

  if (scenes.length === 0) {
    const demo = await fetchDemoCatalog(req);
    return demo;
  }

  const unique = dedupeScenes(scenes);

  const spanY = Math.ceil(
    (new Date(req.dateTo).getTime() - new Date(req.dateFrom).getTime()) /
      (365.25 * 86_400_000),
  );
  if (spanY >= 40) {
    warnings.push(
      `Série histórica ~${spanY} anos — Landsat (1972+), CBERS (1999+), Sentinel-2 (2015+).`,
    );
  }

  return {
    scenes: unique.slice(0, catalogLimit),
    providersUsed: providers,
    demoMode: unique.length === 0 || unique.every((s) => s.demo),
    warnings,
  };
}

function dedupeScenes(
  scenes: TemporalCatalogResponse["scenes"],
): TemporalCatalogResponse["scenes"] {
  const seen = new Set<string>();
  return scenes.filter((s: TemporalCatalogResponse["scenes"][number]) => {
    const key = `${s.provider}-${s.date}-${s.satellite}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function activeProviders(): TemporalProvider[] {
  return [
    "gee",
    "sentinel_hub",
    "inpe",
    "landsat",
    "sentinel2",
    "cbers",
    "srtm",
  ];
}
