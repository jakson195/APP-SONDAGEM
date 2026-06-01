import { GeodataSourcesPanel } from "@/components/geodata-sources-panel";
import Link from "next/link";
import { LandsatStacMapboxClient } from "./landsat-stac-mapbox-client";

export const metadata = {
  title: "Landsat STAC — Mapbox | DataGeo Digital",
  description:
    "Busca e download Landsat histórico via STAC (Planetary Computer) — desenhe área, escolha ano, GeoTIFF no mapa.",
};

export default function LandsatStacPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-8">
      <div>
        <Link
          href="/geo/temporal"
          className="text-xs text-teal-700 hover:underline dark:text-teal-400"
        >
          ← Imagens históricas
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Landsat STAC + Mapbox</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Backend FastAPI (pystac-client, planetary-computer, rasterio/GDAL) ·
          Frontend React + Mapbox · arquivo desde 1972
        </p>
      </div>
      <LandsatStacMapboxClient />
      <GeodataSourcesPanel />
    </div>
  );
}
