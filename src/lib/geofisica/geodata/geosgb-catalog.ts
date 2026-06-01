import type { GeodataCatalogEntry } from "./types";

/**
 * Catálogo GeoSGB / CPRM — fonte geológica principal do Brasil.
 *
 * Referências:
 * - GeoPortal REST: https://geoportal.sgb.gov.br/server/rest/services
 * - GeoServer OGC: https://geoservicos.sgb.gov.br/geoserver/ows
 * - Downloads: https://geosgb.sgb.gov.br/downloads/
 * - OpenData: https://opendata.sgb.gov.br/
 */
export const GEOSGB_CATALOG: GeodataCatalogEntry[] = [
  // —— GeoSGB HTTPS (prioridade máxima — browser + servidor) ——
  {
    id: "sgb-geologia-ingeo",
    provider: "geosgb",
    label: "GeoSGB — Geologia (INDE)",
    category: "geologia",
    priority: 10,
    type: "arcgis_mapserver",
    url: "https://geoportal.sgb.gov.br/ingeo/rest/services/Geologia/MapServer",
    https: true,
    role: "truth",
    docsUrl: "https://geoportal.sgb.gov.br/ingeo/rest/services",
  },
  {
    id: "sgb-estruturas-2004",
    provider: "geosgb",
    label: "GeoSGB — Estruturas GIS Brasil 2004",
    category: "estruturas",
    priority: 20,
    type: "arcgis_mapserver",
    url: "https://geoportal.sgb.gov.br/server/rest/services/geologia/Estruturas_GIS_Brasil_2004/MapServer",
    wmsLayers: "0",
    https: true,
    role: "structure",
  },
  {
    id: "sgb-aespectral",
    provider: "geosgb",
    label: "GeoSGB — Aerogamaespectrometria",
    category: "gamaespectrometria",
    priority: 30,
    type: "arcgis_mapserver",
    url: "https://geoportal.sgb.gov.br/server/rest/services/geologia/aespectral_postgres/MapServer",
    wmsLayers: "0",
    https: true,
    role: "geophysics",
    notes: "Radiometria / espectrometria aérea",
  },
  {
    id: "sgb-geoserver-wms",
    provider: "geosgb",
    label: "GeoSGB GeoServer (OGC WMS)",
    category: "geologia",
    priority: 40,
    type: "wms",
    url: "https://geoservicos.sgb.gov.br/geoserver/ows",
    wmsLayers: "geologia",
    https: true,
    role: "truth",
    docsUrl: "https://geoservicos.sgb.gov.br/geoserver/web/",
    notes: "Camada workspace pode variar — ajustar wmsLayers via GetCapabilities",
  },
  {
    id: "sgb-geomapa-wms",
    provider: "geosgb",
    label: "GeoSGB — Geomapa WMS",
    category: "geologia",
    priority: 50,
    type: "wms",
    url: "https://geoportal.sgb.gov.br/server/services/geologia/geomapa/MapServer/WMSServer",
    wmsLayers: "0",
    https: true,
    role: "truth",
  },
  // —— CPRM legado (HTTP — apenas via API servidor / proxy) ——
  {
    id: "cprm-geologia-integrada",
    provider: "cprm_legacy",
    label: "CPRM — Geologia integrada",
    category: "geologia",
    priority: 15,
    type: "arcgis_mapserver",
    url: "http://arcgisserver.cprm.gov.br:6080/arcgis/rest/services/geologia/geologia_integrada/MapServer",
    https: false,
    role: "truth",
  },
  {
    id: "cprm-geologia",
    provider: "cprm_legacy",
    label: "CPRM — Geologia",
    category: "litologia",
    priority: 25,
    type: "arcgis_mapserver",
    url: "http://arcgisserver.cprm.gov.br:6080/arcgis/rest/services/GEOLOGIA/MapServer",
    https: false,
    role: "truth",
  },
  {
    id: "cprm-geomapa",
    provider: "cprm_legacy",
    label: "CPRM — Geomapa",
    category: "geologia",
    priority: 35,
    type: "arcgis_mapserver",
    url: "http://arcgisserver.cprm.gov.br:6080/arcgis/rest/services/geomapa/MapServer",
    https: false,
    role: "truth",
  },
  {
    id: "cprm-wms-geologia",
    provider: "cprm_legacy",
    label: "CPRM WMS Geologia",
    category: "geologia",
    priority: 45,
    type: "wms",
    url: "http://arcgisserver.cprm.gov.br:6080/arcgis/services/geologia/MapServer/WMSServer",
    wmsLayers: "0",
    https: false,
    role: "truth",
  },
];

/** Overlays no mapa (tiles ArcGIS MapServer — HTTPS). */
export const GEOSGB_MAP_OVERLAYS: {
  id: string;
  label: string;
  /** URL base …/MapServer (sem /tile). */
  mapServerUrl: string;
  category: GeodataCatalogEntry["category"];
  defaultOn?: boolean;
  opacity?: number;
}[] = [
  {
    id: "overlay-geologia-ingeo",
    label: "Geologia (GeoSGB)",
    mapServerUrl:
      "https://geoportal.sgb.gov.br/ingeo/rest/services/Geologia/MapServer",
    category: "geologia",
    defaultOn: false,
    opacity: 0.72,
  },
  {
    id: "overlay-estruturas",
    label: "Estruturas / falhas",
    mapServerUrl:
      "https://geoportal.sgb.gov.br/server/rest/services/geologia/Estruturas_GIS_Brasil_2004/MapServer",
    category: "estruturas",
    opacity: 0.65,
  },
  {
    id: "overlay-aespectral",
    label: "Gamaespectrometria (aérea)",
    mapServerUrl:
      "https://geoportal.sgb.gov.br/server/rest/services/geologia/aespectral_postgres/MapServer",
    category: "gamaespectrometria",
    opacity: 0.55,
  },
];

export function arcgisMapServerTileUrl(mapServerUrl: string): string {
  const base = mapServerUrl.replace(/\/+$/, "");
  return `${base}/tile/{z}/{y}/{x}`;
}

export function getGeosgbCatalogSorted(): GeodataCatalogEntry[] {
  return [...GEOSGB_CATALOG].sort((a, b) => a.priority - b.priority);
}

export function getGeosgbTruthLayers(): GeodataCatalogEntry[] {
  return getGeosgbCatalogSorted().filter((e) => e.role === "truth");
}

export function getCatalogEntry(id: string): GeodataCatalogEntry | undefined {
  return GEOSGB_CATALOG.find((e) => e.id === id);
}
