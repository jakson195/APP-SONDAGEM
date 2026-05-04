"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  ImageOverlay,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { geotiffToPngDataUrlAndBounds } from "@/lib/geotiff-for-leaflet";
import { renderPdfFirstPageToPngWithGeo } from "@/lib/render-pdf-first-page-png";
import type { FuroMapa } from "../types";
import Toolbar from "./Toolbar";

type MapaProps = {
  furos: FuroMapa[];
  onAddFuro: (furo: FuroMapa) => void;
};

/** Vista 2D estilo «Google Earth»: imagem aérea (Esri) ± nomes de lugares. */
type BasemapId = "hybrid" | "satellite" | "terrain" | "osm";

type RasterOverlay = {
  id: string;
  url: string;
  south: number;
  west: number;
  north: number;
  east: number;
};

const ESRI_IMAGERY = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  attribution:
    "Imagem © Esri (Maxar, Earthstar Geographics, etc.) — uso sujeito aos termos Esri",
  maxZoom: 19,
  maxNativeZoom: 19,
} as const;

const ESRI_LABELS = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  attribution: "Nomes © Esri",
  maxZoom: 19,
  maxNativeZoom: 19,
} as const;

const OSM_STREETS = {
  url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19,
  maxNativeZoom: 19,
} as const;

const ESRI_TOPO = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
  attribution:
    "Topográfico © Esri (USGS, NOAA) — <a href='https://www.esri.com'>esri.com</a>",
  maxZoom: 19,
  maxNativeZoom: 19,
} as const;

function FixLeafletIcons() {
  useEffect(() => {
    delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })
      ._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);
  return null;
}

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    2 *
    R *
    Math.asin(
      Math.sqrt(
        Math.sin(Δφ / 2) ** 2 +
          Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2,
      ),
    );
  return s;
}

function MapResizeOnMount() {
  const map = useMap();
  useEffect(() => {
    const t = requestAnimationFrame(() => map.invalidateSize());
    return () => cancelAnimationFrame(t);
  }, [map]);
  return null;
}

/** Ajusta a vista ao último mapa importado (PDF ou GeoTIFF). */
function FitMapToImport({
  fitTarget,
}: {
  fitTarget: { key: number; corners: [[number, number], [number, number]] } | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!fitTarget) return;
    map.fitBounds(fitTarget.corners, { padding: [28, 28], maxZoom: 19 });
  }, [fitTarget?.key, map, fitTarget]);
  return null;
}

function ClickHandler({
  placementMode,
  measureMode,
  measureA,
  onMeasureA,
  onMeasureB,
  onPlaceFuro,
}: {
  placementMode: boolean;
  measureMode: boolean;
  measureA: { lat: number; lng: number } | null;
  onMeasureA: (p: { lat: number; lng: number }) => void;
  onMeasureB: (p: { lat: number; lng: number }) => void;
  onPlaceFuro: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      if (measureMode) {
        if (!measureA) onMeasureA({ lat, lng });
        else onMeasureB({ lat, lng });
        return;
      }
      if (placementMode) {
        onPlaceFuro(lat, lng);
      }
    },
  });
  return null;
}

export default function Mapa({ furos, onAddFuro }: MapaProps) {
  const mapImportInputRef = useRef<HTMLInputElement | null>(null);
  const [basemap, setBasemap] = useState<BasemapId>("hybrid");
  const [placementMode, setPlacementMode] = useState(false);
  const [measureMode, setMeasureMode] = useState(false);
  const [measureA, setMeasureA] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [measureLine, setMeasureLine] = useState<
    [[number, number], [number, number]] | null
  >(null);
  const [measureLabelM, setMeasureLabelM] = useState<number | null>(null);
  const [rasters, setRasters] = useState<RasterOverlay[]>([]);
  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [fitTarget, setFitTarget] = useState<{
    key: number;
    corners: [[number, number], [number, number]];
  } | null>(null);

  const addRasterFromBounds = useCallback(
    (
      id: string,
      dataUrl: string,
      bounds: { south: number; west: number; north: number; east: number },
      successMsg: string,
    ) => {
      setRasters((prev) => [
        ...prev,
        {
          id,
          url: dataUrl,
          south: bounds.south,
          west: bounds.west,
          north: bounds.north,
          east: bounds.east,
        },
      ]);
      setFitTarget({
        key: Date.now(),
        corners: [
          [bounds.south, bounds.west],
          [bounds.north, bounds.east],
        ],
      });
      setImportMsg(successMsg);
    },
    [],
  );

  const resetMeasure = useCallback(() => {
    setMeasureMode(false);
    setMeasureA(null);
    setMeasureLine(null);
    setMeasureLabelM(null);
  }, []);

  const onPlaceFuro = useCallback(
    (lat: number, lng: number) => {
      onAddFuro({
        id: Date.now().toString(),
        lat,
        lng,
        camadas: [],
      });
      setPlacementMode(false);
    },
    [onAddFuro],
  );

  const onMeasureA = useCallback((p: { lat: number; lng: number }) => {
    setMeasureA(p);
  }, []);

  const onMeasureB = useCallback(
    (p: { lat: number; lng: number }) => {
      if (!measureA) return;
      const m = haversineM(measureA, p);
      setMeasureLine([
        [measureA.lat, measureA.lng],
        [p.lat, p.lng],
      ]);
      setMeasureLabelM(m);
      setMeasureA(null);
      setMeasureMode(false);
    },
    [measureA],
  );

  const onNovoFuro = useCallback(() => {
    resetMeasure();
    setPlacementMode((v) => !v);
    setImportMsg(null);
  }, [resetMeasure]);

  const onMedir = useCallback(() => {
    setPlacementMode(false);
    setMeasureMode(true);
    setMeasureA(null);
    setMeasureLine(null);
    setMeasureLabelM(null);
    setImportMsg("Clique dois pontos no mapa para medir a distância.");
  }, []);

  const onImportarMapa = useCallback(() => {
    setPlacementMode(false);
    resetMeasure();
    mapImportInputRef.current?.click();
  }, [resetMeasure]);

  const onMapImportFileSelected = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const isPdf =
        file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      setImportBusy(true);
      setImportMsg(null);
      try {
        if (isPdf) {
          const buf = await file.arrayBuffer();
          const { dataUrl, pdfGeoBounds } = await renderPdfFirstPageToPngWithGeo(
            buf,
          );
          if (pdfGeoBounds) {
            addRasterFromBounds(
              `${Date.now()}-${file.name}`,
              dataUrl,
              pdfGeoBounds,
              `PDF «${file.name}» georreferenciado (1.ª página), como no Avenza.`,
            );
          } else {
            setImportMsg(
              "Este PDF não tem limites WGS84 detetáveis (GeoPDF). No QGIS exporte com georreferência embutida ou use um GeoTIFF em EPSG:4326.",
            );
          }
        } else {
          const { dataUrl, bounds } = await geotiffToPngDataUrlAndBounds(file);
          addRasterFromBounds(
            `${Date.now()}-${file.name}`,
            dataUrl,
            bounds,
            `GeoTIFF «${file.name}» carregado (EPSG:4326, como no Avenza).`,
          );
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Não foi possível importar o ficheiro.";
        setImportMsg(msg);
      } finally {
        setImportBusy(false);
      }
    },
    [addRasterFromBounds],
  );

  return (
    <div className="relative h-full min-h-[280px] w-full overflow-hidden rounded-lg border border-[var(--border)] shadow-sm [&_.leaflet-container]:h-full [&_.leaflet-container]:min-h-[280px]">
      <input
        ref={mapImportInputRef}
        type="file"
        accept="application/pdf,.pdf,image/tiff,.tif,.tiff,image/geotiff"
        className="hidden"
        onChange={(ev) => void onMapImportFileSelected(ev)}
      />

      <Toolbar
        onNovoFuro={onNovoFuro}
        onMedir={onMedir}
        onImportarMapa={onImportarMapa}
      />

      <div
        className="absolute right-2.5 top-2.5 z-[1000] flex flex-col gap-1 rounded-lg border border-[var(--border)] bg-white/95 p-2 text-xs shadow-md backdrop-blur-sm dark:bg-gray-900/90"
        role="group"
        aria-label="Vista do mapa (estilo vista aérea)"
      >
        <span className="px-1 font-semibold text-[var(--text)]">Vista</span>
        <button
          type="button"
          onClick={() => setBasemap("hybrid")}
          className={`rounded px-2 py-1 text-left ${
            basemap === "hybrid"
              ? "bg-teal-600 text-white"
              : "bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--muted)]/20"
          }`}
        >
          Satélite + nomes
        </button>
        <button
          type="button"
          onClick={() => setBasemap("satellite")}
          className={`rounded px-2 py-1 text-left ${
            basemap === "satellite"
              ? "bg-teal-600 text-white"
              : "bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--muted)]/20"
          }`}
        >
          Só satélite
        </button>
        <button
          type="button"
          onClick={() => setBasemap("terrain")}
          className={`rounded px-2 py-1 text-left ${
            basemap === "terrain"
              ? "bg-teal-600 text-white"
              : "bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--muted)]/20"
          }`}
        >
          Terreno (topo)
        </button>
        <button
          type="button"
          onClick={() => setBasemap("osm")}
          className={`rounded px-2 py-1 text-left ${
            basemap === "osm"
              ? "bg-teal-600 text-white"
              : "bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--muted)]/20"
          }`}
        >
          Ruas (OSM)
        </button>
      </div>

      {(placementMode || importBusy || importMsg || measureLabelM != null) && (
        <div className="absolute bottom-3 left-1/2 z-[1000] max-w-[min(90vw,28rem)] -translate-x-1/2 rounded-lg border border-[var(--border)] bg-white/95 px-3 py-2 text-center text-xs text-[var(--text)] shadow-md backdrop-blur-sm dark:bg-gray-900/90">
          {importBusy && <p>A ler GeoTIFF…</p>}
          {!importBusy && placementMode && (
            <p>
              <strong>Modo novo furo:</strong> clique no mapa para colocar o marcador.
            </p>
          )}
          {!importBusy && measureMode && (
            <p>
              <strong>Medir:</strong>{" "}
              {!measureA ? "primeiro ponto…" : "segundo ponto…"}
            </p>
          )}
          {measureLabelM != null && (
            <p className="mt-1 font-mono text-sm">
              Distância: {measureLabelM < 1000
                ? `${measureLabelM.toFixed(1)} m`
                : `${(measureLabelM / 1000).toFixed(3)} km`}
            </p>
          )}
          {importMsg && <p className="mt-1 text-[var(--muted)]">{importMsg}</p>}
        </div>
      )}

      <MapContainer
        center={[-29.1, -49.6]}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom
        className="z-0"
      >
        <FixLeafletIcons />
        <MapResizeOnMount />
        <FitMapToImport fitTarget={fitTarget} />
        {basemap === "osm" && (
          <TileLayer
            key="osm"
            attribution={OSM_STREETS.attribution}
            url={OSM_STREETS.url}
            maxZoom={OSM_STREETS.maxZoom}
            maxNativeZoom={OSM_STREETS.maxNativeZoom}
          />
        )}
        {basemap === "terrain" && (
          <TileLayer
            key="terrain"
            attribution={ESRI_TOPO.attribution}
            url={ESRI_TOPO.url}
            maxZoom={ESRI_TOPO.maxZoom}
            maxNativeZoom={ESRI_TOPO.maxNativeZoom}
          />
        )}
        {(basemap === "satellite" || basemap === "hybrid") && (
          <TileLayer
            key="imagery"
            attribution={ESRI_IMAGERY.attribution}
            url={ESRI_IMAGERY.url}
            maxZoom={ESRI_IMAGERY.maxZoom}
            maxNativeZoom={ESRI_IMAGERY.maxNativeZoom}
          />
        )}
        {basemap === "hybrid" && (
          <TileLayer
            key="labels"
            attribution={ESRI_LABELS.attribution}
            url={ESRI_LABELS.url}
            maxZoom={ESRI_LABELS.maxZoom}
            maxNativeZoom={ESRI_LABELS.maxNativeZoom}
            opacity={0.95}
            className="geo-leaflet-hybrid-labels"
          />
        )}

        {rasters.map((r) => (
          <ImageOverlay
            key={r.id}
            url={r.url}
            bounds={[
              [r.south, r.west],
              [r.north, r.east],
            ]}
            opacity={0.88}
          />
        ))}

        <ClickHandler
          placementMode={placementMode}
          measureMode={measureMode}
          measureA={measureA}
          onMeasureA={onMeasureA}
          onMeasureB={onMeasureB}
          onPlaceFuro={onPlaceFuro}
        />

        {measureLine && (
          <Polyline
            positions={measureLine}
            pathOptions={{ color: "#0d9488", weight: 3, dashArray: "6 4" }}
          />
        )}

        {furos.map((f) => (
          <Marker key={f.id} position={[f.lat, f.lng]} />
        ))}
      </MapContainer>
    </div>
  );
}
