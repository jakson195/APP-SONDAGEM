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
  Circle,
  ImageOverlay,
  MapContainer,
  Marker,
  Popup,
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
  onUpdateFuroPosition: (id: string, lat: number, lng: number) => void;
  onUpdateFuroInfo: (id: string, nome: string, descricao: string) => void;
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

const userLocationIcon = L.divIcon({
  className: "geo-user-location-icon",
  html: `
    <span style="
      display:block;
      width:14px;
      height:14px;
      border-radius:9999px;
      background:#1a73e8;
      border:2px solid #ffffff;
      box-shadow:0 0 0 5px rgba(26,115,232,0.28);
    "></span>
  `,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

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
    const styleId = "geo-user-location-pulse-style";
    if (!document.getElementById(styleId)) {
      const st = document.createElement("style");
      st.id = styleId;
      st.textContent = `
        .geo-user-location-icon span {
          animation: geo-user-location-pulse 1.6s ease-out infinite;
        }
        @keyframes geo-user-location-pulse {
          0% { box-shadow: 0 0 0 0 rgba(26,115,232,0.38); }
          70% { box-shadow: 0 0 0 8px rgba(26,115,232,0); }
          100% { box-shadow: 0 0 0 0 rgba(26,115,232,0); }
        }
      `;
      document.head.appendChild(st);
    }
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

function parseKmlPoints(kmlText: string): Array<{ lat: number; lng: number }> {
  const xml = new DOMParser().parseFromString(kmlText, "application/xml");
  if (xml.getElementsByTagName("parsererror").length > 0) return [];

  const points: Array<{ lat: number; lng: number }> = [];
  const placemarks = Array.from(xml.getElementsByTagName("Placemark"));
  for (const placemark of placemarks) {
    const point = placemark.getElementsByTagName("Point")[0];
    const coordNode = point?.getElementsByTagName("coordinates")[0];
    const raw = coordNode?.textContent?.trim();
    if (!raw) continue;
    const [lngRaw, latRaw] = raw.split(",").map(Number);
    if (Number.isFinite(latRaw) && Number.isFinite(lngRaw)) {
      points.push({ lat: latRaw!, lng: lngRaw! });
    }
  }
  return points;
}

async function extractKmlFromKmz(file: File): Promise<string | null> {
  const { unzipSync, strFromU8 } = await import("fflate");
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const kmlEntry = Object.keys(zip).find((name) => /(^|\/)doc\.kml$/i.test(name))
    ?? Object.keys(zip).find((name) => /\.kml$/i.test(name));
  if (!kmlEntry) return null;
  return strFromU8(zip[kmlEntry]!, true);
}

function buildKmlFromFuros(furos: FuroMapa[]): string {
  const placemarks = furos
    .map((f) => {
      const nome = (f.nome || "Furo").replace(/&/g, "&amp;").replace(/</g, "&lt;");
      const descricao = (f.descricao || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;");
      return `
    <Placemark>
      <name>${nome}</name>
      <description>${descricao}</description>
      <TimeStamp><when>${f.createdAtIso}</when></TimeStamp>
      <Point><coordinates>${f.lng},${f.lat},0</coordinates></Point>
    </Placemark>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Pontos GEO</name>
${placemarks}
  </Document>
</kml>`;
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

function FlyToPoint({
  target,
}: {
  target: { key: number; lat: number; lng: number; zoom?: number } | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.flyTo([target.lat, target.lng], target.zoom ?? 16, { duration: 0.7 });
  }, [map, target]);
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

export default function Mapa({
  furos,
  onAddFuro,
  onUpdateFuroPosition,
  onUpdateFuroInfo,
}: MapaProps) {
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
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [flyTarget, setFlyTarget] = useState<{
    key: number;
    lat: number;
    lng: number;
    zoom?: number;
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
      const nome =
        window.prompt("Nome do furo:", `Furo ${furos.length + 1}`)?.trim() || "";
      if (!nome) {
        setImportMsg("Criação de furo cancelada (nome é obrigatório).");
        setPlacementMode(false);
        return;
      }
      const descricao = window.prompt("Descrição do furo (opcional):", "")?.trim() || "";
      const createdAtIso = new Date().toISOString();
      onAddFuro({
        id: Date.now().toString(),
        lat,
        lng,
        camadas: [],
        nome,
        descricao,
        createdAtIso,
      });
      setImportMsg(
        `Furo «${nome}» criado em ${lat.toFixed(6)}, ${lng.toFixed(6)}.`,
      );
      setPlacementMode(false);
    },
    [furos.length, onAddFuro],
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
    if (userLocation) {
      onPlaceFuro(userLocation.lat, userLocation.lng);
      setImportMsg(
        "Furo criado na sua localização atual. Arraste o marcador para ajustar manualmente.",
      );
      return;
    }
    setPlacementMode((v) => !v);
    setImportMsg("Sem localização ativa: clique no mapa para posicionar o furo.");
  }, [onPlaceFuro, resetMeasure, userLocation]);

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

  const onLocalizacao = useCallback(() => {
    setPlacementMode(false);
    resetMeasure();
    setImportMsg("A obter localização atual…");
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setImportMsg("Geolocalização não suportada neste navegador.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        setFlyTarget({ key: Date.now(), ...loc, zoom: 17 });
        setImportMsg(
          `Localização: ${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}.`,
        );
      },
      (err) => {
        setImportMsg(`Não foi possível obter localização (${err.message}).`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, [resetMeasure]);

  const onExportarPontos = useCallback(async () => {
    if (furos.length === 0) {
      setImportMsg("Não há pontos para exportar.");
      return;
    }
    const dateFilter = window.prompt(
      "Filtrar por data (AAAA-MM-DD). Deixe vazio para todos:",
      "",
    )?.trim();
    const filtered = dateFilter
      ? furos.filter((f) => f.createdAtIso.startsWith(dateFilter))
      : furos;
    if (filtered.length === 0) {
      setImportMsg("Nenhum ponto para a data informada.");
      return;
    }

    const formato =
      window.prompt("Formato de exportação: KML ou KMZ?", "KMZ")?.trim().toUpperCase() ||
      "KMZ";
    const safeDate = dateFilter || new Date().toISOString().slice(0, 10);
    const kml = buildKmlFromFuros(filtered);

    let blob: Blob;
    let ext: "kml" | "kmz";
    if (formato === "KML") {
      blob = new Blob([kml], {
        type: "application/vnd.google-earth.kml+xml;charset=utf-8",
      });
      ext = "kml";
    } else {
      const { zipSync, strToU8 } = await import("fflate");
      const zipped = zipSync({ "doc.kml": strToU8(kml) }, { level: 6 });
      const kmzBytes = new Uint8Array([...zipped]);
      blob = new Blob([kmzBytes], { type: "application/vnd.google-earth.kmz" });
      ext = "kmz";
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pontos-geo-${safeDate}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setImportMsg(`${filtered.length} ponto(s) exportado(s) em ${ext.toUpperCase()}.`);
  }, [furos]);

  const onEditarFuroInfo = useCallback(
    (furo: FuroMapa) => {
      const nome = window.prompt("Editar nome do furo:", furo.nome)?.trim() || "";
      if (!nome) {
        setImportMsg("Edição cancelada (nome é obrigatório).");
        return;
      }
      const descricao =
        window.prompt("Editar descrição do furo:", furo.descricao)?.trim() || "";
      onUpdateFuroInfo(furo.id, nome, descricao);
      setImportMsg(`Furo «${nome}» atualizado.`);
    },
    [onUpdateFuroInfo],
  );

  const onMapImportFileSelected = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const lowerName = file.name.toLowerCase();
      const isPdf =
        file.type === "application/pdf" || lowerName.endsWith(".pdf");
      const isKml =
        file.type === "application/vnd.google-earth.kml+xml" || lowerName.endsWith(".kml");
      const isKmz =
        file.type === "application/vnd.google-earth.kmz" || lowerName.endsWith(".kmz");
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
        } else if (isKml || isKmz) {
          const kmlText = isKmz
            ? await extractKmlFromKmz(file)
            : await file.text();
          if (!kmlText) {
            setImportMsg("KMZ sem ficheiro KML interno.");
            return;
          }
          const points = parseKmlPoints(kmlText);
          if (points.length === 0) {
            setImportMsg("Nenhum ponto encontrado no KML/KMZ.");
            return;
          }
          points.forEach((p, idx) => {
            onAddFuro({
              id: `${Date.now()}-${idx}`,
              lat: p.lat,
              lng: p.lng,
              camadas: [],
              nome: `Importado ${idx + 1}`,
              descricao: `Importado de ${file.name}`,
              createdAtIso: new Date().toISOString(),
            });
          });
          const first = points[0]!;
          setFlyTarget({ key: Date.now(), lat: first.lat, lng: first.lng, zoom: 15 });
          setImportMsg(`${points.length} ponto(s) importado(s) de «${file.name}».`);
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
    [addRasterFromBounds, onAddFuro],
  );

  return (
    <div className="relative h-full min-h-[280px] w-full overflow-hidden rounded-lg border border-[var(--border)] shadow-sm [&_.leaflet-container]:h-full [&_.leaflet-container]:min-h-[280px]">
      <input
        ref={mapImportInputRef}
        type="file"
        accept="application/pdf,.pdf,image/tiff,.tif,.tiff,image/geotiff,.kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz"
        className="hidden"
        onChange={(ev) => void onMapImportFileSelected(ev)}
      />

      <Toolbar
        onNovoFuro={onNovoFuro}
        onMedir={onMedir}
        onLocalizacao={onLocalizacao}
        onImportarMapa={onImportarMapa}
        onExportarPontos={() => void onExportarPontos()}
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
          {importBusy && <p>A processar ficheiro geográfico…</p>}
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
        <FlyToPoint target={flyTarget} />
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
          <Marker
            key={f.id}
            position={[f.lat, f.lng]}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const marker = e.target as L.Marker;
                const pos = marker.getLatLng();
                onUpdateFuroPosition(f.id, pos.lat, pos.lng);
                setImportMsg(
                  `Furo «${f.nome}» ajustado para ${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}.`,
                );
              },
            }}
          >
            <Popup>
              <div className="text-xs">
                <p className="font-semibold">{f.nome || "Furo"}</p>
                {f.descricao ? <p>{f.descricao}</p> : null}
                <p className="font-mono">
                  {f.lat.toFixed(6)}, {f.lng.toFixed(6)}
                </p>
                <p className="text-[var(--muted)]">Arraste para ajustar posição.</p>
                <p className="text-[var(--muted)]">
                  {new Date(f.createdAtIso).toLocaleString("pt-BR")}
                </p>
                <button
                  type="button"
                  className="mt-2 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs transition hover:bg-[var(--muted)]/20"
                  onClick={() => onEditarFuroInfo(f)}
                >
                  Editar nome e descrição
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
        {userLocation && (
          <>
            <Circle
              center={[userLocation.lat, userLocation.lng]}
              radius={18}
              interactive={false}
              pathOptions={{
                color: "#60a5fa",
                weight: 1,
                fillColor: "#93c5fd",
                fillOpacity: 0.25,
              }}
            />
            <Marker
              position={[userLocation.lat, userLocation.lng]}
              icon={userLocationIcon}
              interactive={false}
            />
          </>
        )}
      </MapContainer>
    </div>
  );
}
