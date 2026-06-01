import { NextResponse } from "next/server";
import {
  GEOSGB_CATALOG,
  GEOSGB_MAP_OVERLAYS,
  arcgisMapServerTileUrl,
} from "@/lib/geofisica/geodata/geosgb-catalog";
import { USGS_CATALOG, USGS_EARTHEXPLORER } from "@/lib/geofisica/geodata/usgs-catalog";

export const dynamic = "force-dynamic";

/** Catálogo de fontes para UI e agentes (Cursor / IA). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    primary: "geosgb",
    description:
      "GeoSGB/CPRM é a verdade geológica; USGS é complemento (DEM, sensoriamento).",
    geosgb: {
      services: GEOSGB_CATALOG,
      mapOverlays: GEOSGB_MAP_OVERLAYS.map((o) => ({
        ...o,
        tileUrl: arcgisMapServerTileUrl(o.mapServerUrl),
      })),
      docs: {
        geoportal: "https://geoportal.sgb.gov.br/server/rest/services",
        geoserver: "https://geoservicos.sgb.gov.br/geoserver/ows",
        downloads: "https://geosgb.sgb.gov.br/downloads/",
        opendata: "https://opendata.sgb.gov.br/",
      },
    },
    usgs: {
      services: USGS_CATALOG,
      earthExplorer: USGS_EARTHEXPLORER,
    },
  });
}
