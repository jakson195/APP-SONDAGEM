import {
  GEOSGB_CATALOG,
  getGeosgbCatalogSorted,
  getGeosgbTruthLayers,
} from "./geosgb-catalog";
import type {
  GeodataCatalogEntry,
  GeodataPointHit,
  GeodataPointQueryResult,
} from "./types";

const FETCH_TIMEOUT_MS = 5_000;

function pickAttr(attrs: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = attrs[k] ?? attrs[k.toUpperCase()] ?? attrs[k.toLowerCase()];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

function attrsToHit(
  attrs: Record<string, unknown>,
  entry: GeodataCatalogEntry,
  layerName?: string,
): GeodataPointHit | null {
  const name = pickAttr(attrs, [
    "nome_unida",
    "NOME_UNIDA",
    "nome_unidade",
    "NOME_UNID",
    "UNIDADE",
    "unidade",
    "LITOTIPO",
    "litotipo",
    "LITO1",
    "LITO2",
    "DESCRICAO",
    "descricao",
    "Name",
    "name",
    "LITO",
    "ROCHA",
    "FORMAÇÃO",
    "FORMACAO",
  ]);
  const sigla = pickAttr(attrs, [
    "sigla_unid",
    "SIGLA_UNID",
    "SIGLA",
    "sigla",
    "CODIGO",
    "codigo",
    "COD_UNID",
    "SIGLA1",
  ]);
  const lith = pickAttr(attrs, [
    "litotipo",
    "LITOTIPO",
    "lito",
    "LITOLOGIA",
    "lithology",
    "ROCHA",
  ]);
  const age = pickAttr(attrs, ["idade", "ERARQ", "erarq", "IDADE", "epoch", "EON"]);

  const display = name || sigla || lith;
  if (!display) return null;

  return {
    name: name || sigla,
    sigla: sigla || undefined,
    lithology: lith || name,
    age: age || undefined,
    description: [name, sigla, lith, age].filter(Boolean).join(" · "),
    category: entry.category,
    layerId: entry.id,
    layerLabel: layerName ?? entry.label,
    provider: entry.provider,
  };
}

async function arcgisIdentify(
  entry: GeodataCatalogEntry,
  lat: number,
  lng: number,
): Promise<GeodataPointHit[]> {
  const pad = 0.08;
  const mapExtent = `${lng - pad},${lat - pad},${lng + pad},${lat + pad}`;
  const params = new URLSearchParams({
    f: "json",
    geometryType: "esriGeometryPoint",
    geometry: `${lng},${lat}`,
    tolerance: "10",
    mapExtent,
    imageDisplay: "400,400,96",
    sr: "4326",
    layers: "all",
    returnGeometry: "false",
  });

  const res = await fetch(`${entry.url}/identify?${params}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) return [];

  const json = (await res.json()) as {
    results?: Array<{
      layerName?: string;
      attributes?: Record<string, unknown>;
    }>;
  };

  const hits: GeodataPointHit[] = [];
  const seen = new Set<string>();

  for (const r of json.results ?? []) {
    const h = attrsToHit(r.attributes ?? {}, entry, r.layerName);
    if (!h) continue;
    const key = `${h.sigla ?? ""}|${h.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push(h);
  }
  return hits;
}

async function wmsGetFeatureInfo(
  entry: GeodataCatalogEntry,
  lat: number,
  lng: number,
): Promise<GeodataPointHit[]> {
  const layers = entry.wmsLayers ?? "0";
  const pad = 0.05;
  const bbox = `${lng - pad},${lat - pad},${lng + pad},${lat + pad}`;
  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.1.1",
    REQUEST: "GetFeatureInfo",
    LAYERS: layers,
    QUERY_LAYERS: layers,
    BBOX: bbox,
    WIDTH: "101",
    HEIGHT: "101",
    X: "50",
    Y: "50",
    SRS: "EPSG:4326",
    INFO_FORMAT: "text/plain",
  });

  const res = await fetch(`${entry.url}?${params}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) return [];

  const text = await res.text();
  const hits: GeodataPointHit[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const m = line.match(/(?:nome|unidade|sigla|litotipo)\s*[=:]\s*(.+)/i);
    if (!m?.[1]) continue;
    const val = m[1].trim();
    if (val.length < 2) continue;
    hits.push({
      name: val,
      lithology: val,
      category: entry.category,
      layerId: entry.id,
      layerLabel: entry.label,
      provider: entry.provider,
    });
  }

  if (!hits.length && text.length > 20 && !text.includes("ServiceException")) {
    const chunk = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
    if (chunk.length > 8) {
      hits.push({
        name: chunk.slice(0, 80),
        lithology: chunk,
        category: entry.category,
        layerId: entry.id,
        layerLabel: entry.label,
        provider: entry.provider,
      });
    }
  }
  return hits;
}

/** Query espacial nas subcamadas do MapServer (mais detalhe que identify). */
async function arcgisQueryLayers(
  entry: GeodataCatalogEntry,
  lat: number,
  lng: number,
  maxLayers = 4,
): Promise<GeodataPointHit[]> {
  const metaRes = await fetch(`${entry.url}?f=json`, {
    signal: AbortSignal.timeout(6_000),
    cache: "no-store",
  });
  if (!metaRes.ok) return [];
  const meta = (await metaRes.json()) as { layers?: Array<{ id: number }> };
  const layerIds = (meta.layers ?? []).map((l) => l.id).slice(0, maxLayers);
  const hits: GeodataPointHit[] = [];

  for (const lid of layerIds) {
    const params = new URLSearchParams({
      f: "json",
      geometry: `${lng},${lat}`,
      geometryType: "esriGeometryPoint",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "*",
      returnGeometry: "false",
      inSR: "4326",
    });
    try {
      const res = await fetch(`${entry.url}/${lid}/query?${params}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        features?: Array<{ attributes?: Record<string, unknown> }>;
      };
      for (const f of json.features ?? []) {
        const h = attrsToHit(f.attributes ?? {}, entry, `Layer ${lid}`);
        if (h) hits.push(h);
      }
    } catch {
      /* próxima subcamada */
    }
  }
  return hits;
}

async function queryService(
  entry: GeodataCatalogEntry,
  lat: number,
  lng: number,
): Promise<GeodataPointHit[]> {
  if (entry.type === "wms") {
    return wmsGetFeatureInfo(entry, lat, lng);
  }
  if (
    entry.type === "arcgis_mapserver" ||
    entry.type === "arcgis_featureserver"
  ) {
    const [idHits, qHits] = await Promise.all([
      arcgisIdentify(entry, lat, lng),
      arcgisQueryLayers(entry, lat, lng),
    ]);
    return dedupeHits([...idHits, ...qHits]);
  }
  return [];
}

function dedupeHits(hits: GeodataPointHit[]): GeodataPointHit[] {
  const seen = new Set<string>();
  const out: GeodataPointHit[] = [];
  for (const h of hits) {
    const key = `${h.provider}|${h.layerId}|${h.sigla ?? ""}|${h.name}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

export type GeosgbQueryOptions = {
  /** Só serviços HTTPS (browser). */
  httpsOnly?: boolean;
  /** IDs específicos do catálogo. */
  layerIds?: string[];
  /** Máximo de serviços em paralelo por prioridade. */
  maxServices?: number;
};

/**
 * Consulta pontual GeoSGB/CPRM — «verdade geológica» no ponto.
 * Servidor Node pode usar HTTP legado; browser deve usar httpsOnly.
 */
export async function queryGeosgbPoint(
  lat: number,
  lng: number,
  options: GeosgbQueryOptions = {},
): Promise<GeodataPointQueryResult> {
  const { httpsOnly = false, layerIds, maxServices = 12 } = options;

  let entries = getGeosgbCatalogSorted();
  if (httpsOnly) entries = entries.filter((e) => e.https);
  if (layerIds?.length) {
    const set = new Set(layerIds);
    entries = entries.filter((e) => set.has(e.id));
  }
  entries = entries.slice(0, maxServices);

  const servicesQueried: string[] = [];
  const allHits: GeodataPointHit[] = [];

  const tasks = entries.map(async (entry) => {
    servicesQueried.push(entry.id);
    try {
      return await queryService(entry, lat, lng);
    } catch {
      return [];
    }
  });

  const settled = await Promise.allSettled(tasks);
  for (const s of settled) {
    if (s.status === "fulfilled" && s.value.length) {
      allHits.push(...s.value);
    }
  }

  const hits = dedupeHits(allHits);
  const truthHit = hits.find((h) => {
    const e = GEOSGB_CATALOG.find((c) => c.id === h.layerId);
    return e?.role === "truth";
  });

  return {
    lat,
    lng,
    hits,
    servicesQueried,
    primarySource: truthHit?.layerLabel ?? hits[0]?.layerLabel ?? null,
  };
}

/** Compatível com fetch-cprm-geology anterior. */
export async function fetchGeosgbGeologyForInterpret(
  lat: number,
  lng: number,
  maxServices = 6,
): Promise<{
  units: Array<{
    name: string;
    sigla?: string;
    lithology?: string;
    age?: string;
    description?: string;
    source: "geosgb";
    layerName?: string;
  }>;
  serviceUsed: string;
} | null> {
  const truthIds = getGeosgbTruthLayers().map((e) => e.id);
  const result = await queryGeosgbPoint(lat, lng, {
    maxServices,
    layerIds: truthIds.length ? truthIds.slice(0, maxServices) : undefined,
  });
  if (!result.hits.length) return null;

  return {
    units: result.hits.map((h) => ({
      name: h.name,
      sigla: h.sigla,
      lithology: h.lithology,
      age: h.age,
      description: h.description,
      source: "geosgb" as const,
      layerName: h.layerLabel,
    })),
    serviceUsed: result.primarySource ?? "GeoSGB/CPRM",
  };
}
