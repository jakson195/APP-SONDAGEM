"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DrawingManagerF,
  GoogleMap,
  Marker,
  PolylineF,
  useJsApiLoader,
} from "@react-google-maps/api";
import { GOOGLE_MAPS_JS_LOADER_ID } from "@/lib/google-maps-js-loader-id";
import { GOOGLE_MAPS_LIBRARIES } from "@/lib/google-maps-libraries";

const MAP_HEIGHT = 380;
const PAD = 56;

const mapContainerStyle: CSSProperties = {
  width: "100%",
  height: `${MAP_HEIGHT}px`,
};

const mapOptions: google.maps.MapOptions = {
  streetViewControl: false,
  mapTypeControl: true,
  fullscreenControl: true,
  zoomControl: true,
};

const DEFAULT_CENTER: google.maps.LatLngLiteral = {
  lat: -14.235004,
  lng: -51.92528,
};

type ToolbarTool = "nav" | "measure" | "draw";

function formatDistanceMeters(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

function clearSketchOverlays(
  overlays: (google.maps.MVCObject | google.maps.OverlayView)[],
) {
  for (const o of overlays) {
    if ("setMap" in o && typeof o.setMap === "function") {
      o.setMap(null);
    }
  }
}

export type FieldFuroPin = {
  id: number;
  codigo: string;
  latitude: number | null;
  longitude: number | null;
};

export type FieldMapMode = "obra" | "furo";

type Props = {
  className?: string;
  hint?: ReactNode;
  /** Barra de ferramentas (ponto / medir / desenhar / importar GeoJSON). */
  showToolbar?: boolean;
  /**
   * Mapa a 100vh com `#map` no contentor; barra em coluna, absoluta (esq. 10px, topo 50px),
   * fundo branco — como o layout clássico em HTML/CSS.
   */
  fullViewport?: boolean;
  obraPosition: google.maps.LatLngLiteral | null;
  furos: FieldFuroPin[];
  mapMode: FieldMapMode;
  selectedFuroId: number | null;
  userPosition: google.maps.LatLngLiteral | null;
  /** Tooltip do marcador azul (ex.: última posição guardada no dispositivo). */
  userPositionTitle?: string;
  /** Incrementar para recentrar / ajustar zoom a todos os pontos. */
  recenterKey: number;
  onObraMapClick: (lng: number, lat: number) => void;
  onFuroMapClick: (furoId: number, lng: number, lat: number) => void;
};

function MapMissingKeyMessage({ className }: { className: string }) {
  return (
    <div
      className={`rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-6 text-sm text-[var(--muted)] ${className}`}
    >
      <p className="font-medium text-[var(--text)]">Mapa indisponível</p>
      <p className="mt-1">
        Defina{" "}
        <code className="rounded bg-black/5 px-1 font-mono text-xs dark:bg-white/10">
          NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
        </code>{" "}
        em <code className="font-mono text-xs">.env.local</code> e reinicie o servidor.
      </p>
    </div>
  );
}

function collectPoints(
  obraPosition: google.maps.LatLngLiteral | null,
  furos: FieldFuroPin[],
  userPosition: google.maps.LatLngLiteral | null,
): google.maps.LatLngLiteral[] {
  const pts: google.maps.LatLngLiteral[] = [];
  if (obraPosition) pts.push(obraPosition);
  for (const f of furos) {
    if (
      f.latitude != null &&
      f.longitude != null &&
      Number.isFinite(f.latitude) &&
      Number.isFinite(f.longitude)
    ) {
      pts.push({ lat: f.latitude, lng: f.longitude });
    }
  }
  if (userPosition) pts.push(userPosition);
  return pts;
}

function FieldCampaignMapWithKey({
  apiKey,
  className = "",
  hint,
  showToolbar = true,
  fullViewport = false,
  obraPosition,
  furos,
  mapMode,
  selectedFuroId,
  userPosition,
  userPositionTitle,
  recenterKey,
  onObraMapClick,
  onFuroMapClick,
}: Props & { apiKey: string }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: GOOGLE_MAPS_JS_LOADER_ID,
    googleMapsApiKey: apiKey,
    libraries: [...GOOGLE_MAPS_LIBRARIES],
  });

  const [mapTool, setMapTool] = useState<ToolbarTool>("nav");
  const [measurePath, setMeasurePath] = useState<google.maps.LatLngLiteral[]>(
    [],
  );
  const [importError, setImportError] = useState<string | null>(null);

  const mapRef = useRef<google.maps.Map | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const sketchOverlaysRef = useRef<
    (google.maps.Polyline | google.maps.Polygon | google.maps.Marker)[]
  >([]);
  const initialFitDone = useRef(false);
  const lastRecenter = useRef(-1);

  const effectiveTool: ToolbarTool = showToolbar ? mapTool : "nav";

  const resetTools = useCallback(() => {
    setMapTool("nav");
    setMeasurePath([]);
    setImportError(null);
    clearSketchOverlays(sketchOverlaysRef.current);
    sketchOverlaysRef.current = [];
    const map = mapRef.current;
    if (map) {
      map.data.forEach((f) => map.data.remove(f));
    }
  }, []);

  const applyBounds = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const pts = collectPoints(obraPosition, furos, userPosition);
    if (pts.length === 0) {
      map.setCenter(DEFAULT_CENTER);
      map.setZoom(4);
      return;
    }
    if (pts.length === 1) {
      map.setCenter(pts[0]);
      map.setZoom(17);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    for (const p of pts) bounds.extend(p);
    map.fitBounds(bounds, PAD);
  }, [obraPosition, furos, userPosition]);

  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;
    if (!initialFitDone.current) {
      const pts = collectPoints(obraPosition, furos, userPosition);
      if (pts.length > 0) {
        initialFitDone.current = true;
        applyBounds();
      }
    }
  }, [isLoaded, obraPosition, furos, userPosition, applyBounds]);

  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;
    if (recenterKey !== lastRecenter.current) {
      lastRecenter.current = recenterKey;
      applyBounds();
    }
  }, [recenterKey, isLoaded, applyBounds]);

  const center = useMemo(() => {
    if (obraPosition) return obraPosition;
    for (const f of furos) {
      if (
        f.latitude != null &&
        f.longitude != null &&
        Number.isFinite(f.latitude) &&
        Number.isFinite(f.longitude)
      ) {
        return { lat: f.latitude, lng: f.longitude };
      }
    }
    return DEFAULT_CENTER;
  }, [obraPosition, furos]);

  const measureLengthM = useMemo(() => {
    if (measurePath.length < 2) return null;
    return google.maps.geometry.spherical.computeLength(measurePath);
  }, [measurePath]);

  const onMapClick = useCallback(
    (e: google.maps.MapMouseEvent) => {
      const ll = e.latLng;
      if (!ll) return;
      const lng = ll.lng();
      const lat = ll.lat();

      if (effectiveTool === "measure") {
        setMeasurePath((prev) => [...prev, { lat, lng }]);
        return;
      }
      if (effectiveTool === "draw") {
        return;
      }

      if (mapMode === "obra") {
        onObraMapClick(lng, lat);
      } else if (selectedFuroId != null) {
        onFuroMapClick(selectedFuroId, lng, lat);
      }
    },
    [
      effectiveTool,
      mapMode,
      selectedFuroId,
      onObraMapClick,
      onFuroMapClick,
    ],
  );

  const onImportFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setImportError(null);
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const map = mapRef.current;
      if (!map) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = String(reader.result ?? "");
          const parsed: unknown = JSON.parse(text);
          if (typeof parsed !== "object" || parsed === null) {
            setImportError("Ficheiro inválido.");
            return;
          }
          map.data.forEach((f) => map.data.remove(f));
          map.data.addGeoJson(parsed as object);
          map.data.setStyle({
            strokeColor: "#ea580c",
            strokeWeight: 2,
            fillOpacity: 0.12,
            fillColor: "#ea580c",
          });
          const bounds = new google.maps.LatLngBounds();
          map.data.forEach((feature) => {
            const geom = feature.getGeometry();
            if (!geom) return;
            geom.forEachLatLng((latLng) => bounds.extend(latLng));
          });
          if (bounds.isEmpty()) {
            setImportError("GeoJSON sem coordenadas.");
            return;
          }
          map.fitBounds(bounds, PAD);
        } catch {
          setImportError("Não foi possível ler o GeoJSON.");
        }
      };
      reader.readAsText(file, "UTF-8");
    },
    [],
  );

  const pushSketch = useCallback(
    (o: google.maps.Polyline | google.maps.Polygon | google.maps.Marker) => {
      sketchOverlaysRef.current.push(o);
    },
    [],
  );

  if (loadError) {
    return (
      <div
        className={`rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200 ${className}`}
      >
        Não foi possível carregar o Google Maps. Verifique a chave e a API Maps
        JavaScript.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--muted)] ${className} ${fullViewport ? "h-[100vh] w-full" : ""}`}
        style={fullViewport ? undefined : { height: MAP_HEIGHT }}
      >
        A carregar mapa…
      </div>
    );
  }

  const userIcon: google.maps.Symbol = {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 9,
    fillColor: "#1a73e8",
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 2,
  };

  const toolbarBtn =
    "rounded-lg border px-3 py-2 text-sm font-medium transition-colors";
  const toolbarBtnIdle =
    "border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--surface)]";
  const toolbarBtnActive =
    "border-teal-600 bg-teal-50 text-teal-900 ring-2 ring-teal-500/40 dark:border-teal-500 dark:bg-teal-950/50 dark:text-teal-100";

  const toolbarBtnFull =
    "w-full min-w-0 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-sm font-medium text-neutral-900 shadow-sm transition-colors hover:bg-neutral-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700";
  const toolbarBtnFullActive =
    "w-full min-w-0 rounded-lg border border-teal-600 bg-teal-50 px-3 py-2 text-left text-sm font-semibold text-teal-900 ring-2 ring-teal-500/30 dark:border-teal-500 dark:bg-teal-950/60 dark:text-teal-50";

  const mapContainerStyleResolved: CSSProperties = fullViewport
    ? { width: "100%", height: "100%" }
    : mapContainerStyle;

  const mapContainerClassResolved = fullViewport
    ? "absolute inset-0 h-full w-full overflow-hidden"
    : "overflow-hidden rounded-lg border border-[var(--border)]";

  const measureHelp = (
    <>
      Clique no mapa para marcar vértices da polilinha.
      {measureLengthM != null && (
        <span
          className={
            fullViewport
              ? "mt-1 block font-medium text-neutral-900 dark:text-zinc-100"
              : "ml-2 font-medium text-[var(--text)]"
          }
        >
          Distância: {formatDistanceMeters(measureLengthM)}
        </span>
      )}
    </>
  );

  const drawHelp = (
    <>
      Use a barra de desenho do Google Maps (linha, polígono ou marcador). «Ponto»
      remove desenhos e camadas importadas.
    </>
  );

  return (
    <div
      className={`${className ?? ""} ${fullViewport ? "relative h-[100vh] min-h-0 w-full" : ""}`.trim()}
    >
      {!fullViewport && showToolbar && (
        <div
          className="mb-2 flex flex-wrap gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2"
          role="toolbar"
          aria-label="Ferramentas do mapa"
        >
          <button
            type="button"
            className={`${toolbarBtn} ${effectiveTool === "nav" ? toolbarBtnActive : toolbarBtnIdle}`}
            onClick={resetTools}
          >
            📍 Ponto
          </button>
          <button
            type="button"
            className={`${toolbarBtn} ${effectiveTool === "measure" ? toolbarBtnActive : toolbarBtnIdle}`}
            onClick={() => {
              setImportError(null);
              clearSketchOverlays(sketchOverlaysRef.current);
              sketchOverlaysRef.current = [];
              setMapTool("measure");
              setMeasurePath([]);
            }}
          >
            📏 Medir
          </button>
          <button
            type="button"
            className={`${toolbarBtn} ${effectiveTool === "draw" ? toolbarBtnActive : toolbarBtnIdle}`}
            onClick={() => {
              setImportError(null);
              clearSketchOverlays(sketchOverlaysRef.current);
              sketchOverlaysRef.current = [];
              setMeasurePath([]);
              setMapTool("draw");
            }}
          >
            ✏️ Desenhar
          </button>
          <button
            type="button"
            className={`${toolbarBtn} ${toolbarBtnIdle}`}
            onClick={() => importInputRef.current?.click()}
          >
            🗺️ Importar
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,.geojson,application/geo+json"
            className="sr-only"
            aria-hidden
            onChange={onImportFileChange}
          />
          {effectiveTool === "measure" && measurePath.length > 0 && (
            <button
              type="button"
              className={`${toolbarBtn} ${toolbarBtnIdle}`}
              onClick={() => setMeasurePath([])}
            >
              Limpar medida
            </button>
          )}
        </div>
      )}
      {!fullViewport && showToolbar && effectiveTool === "measure" && (
        <p className="mb-2 text-xs text-[var(--muted)]">{measureHelp}</p>
      )}
      {!fullViewport && showToolbar && effectiveTool === "draw" && (
        <p className="mb-2 text-xs text-[var(--muted)]">{drawHelp}</p>
      )}
      {!fullViewport && importError && (
        <p className="mb-2 text-sm text-red-600 dark:text-red-400" role="alert">
          {importError}
        </p>
      )}
      <GoogleMap
        id={fullViewport ? "map" : undefined}
        mapContainerStyle={mapContainerStyleResolved}
        mapContainerClassName={mapContainerClassResolved}
        center={center}
        zoom={16}
        options={mapOptions}
        onClick={onMapClick}
        onLoad={(m) => {
          mapRef.current = m;
        }}
        onUnmount={() => {
          mapRef.current = null;
        }}
      >
        {effectiveTool === "draw" && (
          <DrawingManagerF
            options={{
              drawingControl: true,
              drawingControlOptions: {
                position: google.maps.ControlPosition.TOP_CENTER,
                drawingModes: [
                  google.maps.drawing.OverlayType.POLYLINE,
                  google.maps.drawing.OverlayType.POLYGON,
                  google.maps.drawing.OverlayType.MARKER,
                ],
              },
            }}
            onPolylineComplete={pushSketch}
            onPolygonComplete={pushSketch}
            onMarkerComplete={pushSketch}
          />
        )}
        {measurePath.length > 0 && (
          <PolylineF
            path={measurePath}
            options={{
              strokeColor: "#0d9488",
              strokeOpacity: 0.95,
              strokeWeight: 3,
              clickable: false,
            }}
          />
        )}
        {obraPosition && (
          <Marker
            position={obraPosition}
            title="Referência da obra"
            label={{ text: "Obra", color: "#1a1a1a", fontSize: "11px", fontWeight: "600" }}
          />
        )}
        {furos.map((f) => {
          if (
            f.latitude == null ||
            f.longitude == null ||
            !Number.isFinite(f.latitude) ||
            !Number.isFinite(f.longitude)
          ) {
            return null;
          }
          return (
            <Marker
              key={f.id}
              position={{ lat: f.latitude, lng: f.longitude }}
              title={`Furo ${f.codigo}`}
              label={{
                text: f.codigo.length > 8 ? `${f.codigo.slice(0, 7)}…` : f.codigo,
                color: "#0f766e",
                fontSize: "11px",
                fontWeight: "600",
              }}
            />
          );
        })}
        {userPosition && (
          <Marker
            position={userPosition}
            title={userPositionTitle ?? "A sua posição (GPS)"}
            icon={userIcon}
          />
        )}
      </GoogleMap>
      {fullViewport && showToolbar && (
        <div
          className="toolbar absolute left-[10px] top-[50px] z-20 flex min-w-[152px] max-w-[min(260px,calc(100vw-24px))] flex-col gap-[10px] rounded-[10px] bg-white p-[10px] shadow-lg dark:border dark:border-zinc-600 dark:bg-zinc-900"
          role="toolbar"
          aria-label="Ferramentas do mapa"
        >
          <button
            type="button"
            className={
              effectiveTool === "nav" ? toolbarBtnFullActive : toolbarBtnFull
            }
            onClick={resetTools}
          >
            📍 Ponto
          </button>
          <button
            type="button"
            className={
              effectiveTool === "measure"
                ? toolbarBtnFullActive
                : toolbarBtnFull
            }
            onClick={() => {
              setImportError(null);
              clearSketchOverlays(sketchOverlaysRef.current);
              sketchOverlaysRef.current = [];
              setMapTool("measure");
              setMeasurePath([]);
            }}
          >
            📏 Medir
          </button>
          <button
            type="button"
            className={
              effectiveTool === "draw" ? toolbarBtnFullActive : toolbarBtnFull
            }
            onClick={() => {
              setImportError(null);
              clearSketchOverlays(sketchOverlaysRef.current);
              sketchOverlaysRef.current = [];
              setMeasurePath([]);
              setMapTool("draw");
            }}
          >
            ✏️ Desenhar
          </button>
          <button
            type="button"
            className={toolbarBtnFull}
            onClick={() => importInputRef.current?.click()}
          >
            🗺️ Importar
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,.geojson,application/geo+json"
            className="sr-only"
            aria-hidden
            onChange={onImportFileChange}
          />
          {effectiveTool === "measure" && measurePath.length > 0 && (
            <button
              type="button"
              className={toolbarBtnFull}
              onClick={() => setMeasurePath([])}
            >
              Limpar medida
            </button>
          )}
          {effectiveTool === "measure" && (
            <p className="text-xs leading-snug text-neutral-600 dark:text-zinc-300">
              {measureHelp}
            </p>
          )}
          {effectiveTool === "draw" && (
            <p className="text-xs leading-snug text-neutral-600 dark:text-zinc-300">
              {drawHelp}
            </p>
          )}
          {importError && (
            <p className="text-xs font-medium text-red-600 dark:text-red-400" role="alert">
              {importError}
            </p>
          )}
        </div>
      )}
      {fullViewport && hint && (
        <div className="absolute bottom-3 left-3 right-3 z-10 max-w-lg rounded-[10px] border border-neutral-200/80 bg-white/95 p-3 text-xs text-neutral-700 shadow-md dark:border-zinc-600 dark:bg-zinc-900/95 dark:text-zinc-200 md:right-auto">
          {hint}
        </div>
      )}
      {!fullViewport && hint}
    </div>
  );
}

export function FieldCampaignMap(props: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  if (!apiKey) {
    return <MapMissingKeyMessage className={props.className ?? ""} />;
  }
  return <FieldCampaignMapWithKey {...props} apiKey={apiKey} />;
}
