/**
 * Fontes geoespaciais recomendadas — DataGeo Digital.
 * Stack gratuito / baixo atrito para o Brasil.
 */

export type DatageoSourceId =
  | "planetary_computer"
  | "geosgb_cprm"
  | "opentopography"
  | "copernicus_browser";

export type DatageoSourceDef = {
  id: DatageoSourceId;
  label: string;
  role: string;
  description: string;
  url: string;
  docsUrl?: string;
  envKey?: string;
  recommended: boolean;
  products: string[];
};

export const DATAGEO_RECOMMENDED_SOURCES: DatageoSourceDef[] = [
  {
    id: "planetary_computer",
    label: "Planetary Computer",
    role: "Imagem histórica",
    description:
      "Landsat Collection 2 + Sentinel-2 via STAC (Microsoft). Download gratuito com planetary-computer.",
    url: "https://planetarycomputer.microsoft.com/catalog",
    docsUrl: "https://planetarycomputer.microsoft.com/docs/overview/about/",
    recommended: true,
    products: ["Landsat 1–9", "Sentinel-2", "SRTM (STAC)"],
  },
  {
    id: "geosgb_cprm",
    label: "CPRM / GeoSGB",
    role: "Geologia",
    description:
      "Serviço Geológico do Brasil — litologia, estruturas, geomapa WMS.",
    url: "https://geoportal.sgb.gov.br/",
    docsUrl: "https://geosgb.sgb.gov.br/",
    recommended: true,
    products: ["Geologia", "Estruturas", "Gamaespectrometria"],
  },
  {
    id: "opentopography",
    label: "OpenTopography",
    role: "Elevação",
    description:
      "SRTM, NASADEM, Copernicus GLO-30/90 — GeoTIFF por bbox (API globaldem).",
    url: "https://opentopography.org/",
    docsUrl: "https://portal.opentopography.org/apidocs/",
    envKey: "OPENTOPOGRAPHY_API_KEY",
    recommended: true,
    products: ["SRTM GL1 30m", "COP30", "NASADEM", "ALOS 30m"],
  },
  {
    id: "copernicus_browser",
    label: "Copernicus Browser",
    role: "Sentinel",
    description:
      "Sentinel-1/2/3 visualização e catálogo CDSE. Integração OData no DataGeo.",
    url: "https://browser.dataspace.copernicus.eu/",
    docsUrl: "https://documentation.dataspace.copernicus.eu/",
    envKey: "COPERNICUS_USER",
    recommended: true,
    products: ["Sentinel-2 L2A", "Sentinel-1", "Sentinel-3"],
  },
];

export function getDatageoSource(id: DatageoSourceId): DatageoSourceDef | undefined {
  return DATAGEO_RECOMMENDED_SOURCES.find((s) => s.id === id);
}

export const PLANETARY_COMPUTER_STAC =
  "https://planetarycomputer.microsoft.com/api/stac/v1";

export const OPENTOPOGRAPHY_GLOBAL_DEM_API =
  "https://portal.opentopography.org/API/globaldem";

export const COPERNICUS_CDSE_ODATA =
  "https://catalogue.dataspace.copernicus.eu/odata/v1";

export const GEOSGB_WMS_GEOMAPA =
  "https://geoportal.sgb.gov.br/server/services/geologia/geomapa/MapServer/WMSServer";

export const OPENTOPO_DEFAULT_DEM_TYPE = "COP30";
