"use client";

import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { useCallback, useMemo, useRef, useState } from "react";
import Map, { Layer, Source, useControl } from "react-map-gl/mapbox";
import type { MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  bboxFromGeoJson,
  downloadLandsatScene,
  downloadDemOpenTopography,
  GARUVA_BBOX,
  imageCoordsFromBbox,
  LANDSAT_YEAR_MAX,
  LANDSAT_YEAR_MIN,
  searchLandsatByYear,
  type StacScene,
} from "@/lib/geo/temporal/landsat-stac-api";
import type { SpectralIndex, Wgs84Bbox } from "@/lib/geo/temporal/temporal-types";
import { SPECTRAL_INDEX_LABELS } from "@/lib/geo/temporal/temporal-types";

type DrawControlProps = {
  onBbox: (bbox: Wgs84Bbox | null) => void;
};

function DrawControl({ onBbox }: DrawControlProps) {
  const onBboxRef = useRef(onBbox);
  onBboxRef.current = onBbox;

  useControl(({ map }) => {
    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {
        polygon: true,
        trash: true,
      },
      defaultMode: "draw_polygon",
    });

    const sync = () => {
      const fc = draw.getAll();
      const feat = fc.features[fc.features.length - 1];
      onBboxRef.current(bboxFromGeoJson(feat));
    };

    map.on("draw.create", sync);
    map.on("draw.update", sync);
    map.on("draw.delete", () => onBboxRef.current(null));

    return draw;
  });

  return null;
}

export function LandsatStacMapboxClient() {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const mapRef = useRef<MapRef>(null);

  const [bbox, setBbox] = useState<Wgs84Bbox | null>(null);
  const [year, setYear] = useState(2010);
  const [spectralMode, setSpectralMode] = useState<SpectralIndex>("rgb");
  const [opacity, setOpacity] = useState(0.92);
  const [scenes, setScenes] = useState<StacScene[]>([]);
  const [selected, setSelected] = useState<StacScene | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBounds, setPreviewBounds] = useState<Wgs84Bbox | null>(null);
  const [compareUrl, setCompareUrl] = useState<string | null>(null);
  const [compareBounds, setCompareBounds] = useState<Wgs84Bbox | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [demType, setDemType] = useState("COP30");

  const initialView = useMemo(
    () => ({
      longitude: -48.67,
      latitude: -26.28,
      zoom: 11,
    }),
    [],
  );

  const loadGaruvaRect = useCallback(() => {
    setBbox(GARUVA_BBOX);
    setNotice("Área Garuva SC — desenhe ou use o retângulo exemplo.");
    mapRef.current?.flyTo({
      center: [(-48.72 + -48.58) / 2, (-26.32 + -26.22) / 2],
      zoom: 12,
    });
  }, []);

  const handleSearch = useCallback(async () => {
    if (!bbox) {
      setNotice("Desenhe um polígono ou retângulo no mapa.");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const result = await searchLandsatByYear(bbox, year);
      if (!result.ok) throw new Error(result.error ?? "Busca falhou");
      setScenes(result.scenes ?? []);
      setNotice(
        `${result.scenes?.length ?? 0} cena(s) em ${year} · STAC: ${result.sources?.join(", ") ?? "PC"}`,
      );
      if (result.warnings?.length) {
        setNotice((n) => `${n ?? ""} · ${result.warnings![0]}`);
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Erro na busca STAC");
      setScenes([]);
    } finally {
      setBusy(false);
    }
  }, [bbox, year]);

  const handleDownloadScene = useCallback(
    async (scene: StacScene, asCompare = false) => {
      if (!bbox) return;
      setBusy(true);
      setSelected(scene);
      try {
        const result = await downloadLandsatScene({
          bbox,
          date: scene.date,
          sceneId: scene.id,
          stacItemUrl: scene.stac_item_url,
          spectralMode,
        });
        if (!result.ok) throw new Error(result.error ?? "Download falhou");
        const url = `${result.previewProxyUrl}&t=${Date.now()}`;
        if (asCompare) {
          setCompareUrl(url);
          setCompareBounds(result.bounds);
        } else {
          setPreviewUrl(url);
          setPreviewBounds(result.bounds);
        }
        setNotice(
          `GeoTIFF ${scene.satellite} · ${scene.date} · ${result.spectral_mode}`,
        );
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "Erro no download");
      } finally {
        setBusy(false);
      }
    },
    [bbox, spectralMode],
  );

  const handleDownloadDem = useCallback(async () => {
    if (!bbox) {
      setNotice("Desenhe uma área no mapa para baixar o DEM.");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const result = await downloadDemOpenTopography(bbox, demType);
      if (!result.ok) throw new Error(result.error ?? "Download DEM falhou");
      setNotice(`DEM ${demType} baixado (OpenTopography · Copernicus GLO-30).`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Erro OpenTopography");
    } finally {
      setBusy(false);
    }
  }, [bbox, demType]);

  if (!token) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-6 text-sm text-amber-100">
        Configure <code className="text-amber-50">NEXT_PUBLIC_MAPBOX_TOKEN</code>{" "}
        no .env.local. Motor Python:{" "}
        <code className="text-amber-50">LANDSAT_ENGINE_URL=http://127.0.0.1:8093</code>
      </div>
    );
  }

  const displayBounds = previewBounds ?? bbox;

  return (
    <div className="grid gap-4 lg:grid-cols-4">
      <aside className="space-y-3 lg:col-span-1">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
          <h2 className="mb-2 font-semibold">Landsat STAC</h2>
          <p className="mb-3 text-xs text-[var(--muted)]">
            1. Desenhe área · 2. Escolha ano · 3. Buscar · 4. Baixar GeoTIFF · 5.
            Ver no mapa
          </p>
          <ol className="mb-3 list-decimal space-y-1 pl-4 text-[10px] text-[var(--muted)]">
            <li>Retângulo ou polígono no mapa</li>
            <li>Ano (1972–{LANDSAT_YEAR_MAX})</li>
            <li>Busca pystac + Planetary Computer</li>
            <li>Download rasterio → GeoTIFF</li>
            <li>Overlay Mapbox (RGB / NDVI / falso cor)</li>
          </ol>
          <button
            type="button"
            onClick={loadGaruvaRect}
            className="mb-2 text-[10px] text-teal-700 underline dark:text-teal-400"
          >
            Exemplo Garuva SC
          </button>
          {bbox && (
            <p className="mb-2 font-mono text-[9px] text-[var(--muted)]">
              {bbox.west.toFixed(4)}, {bbox.south.toFixed(4)} →{" "}
              {bbox.east.toFixed(4)}, {bbox.north.toFixed(4)}
            </p>
          )}
          <label className="mb-2 block text-xs">
            Ano
            <input
              type="range"
              min={LANDSAT_YEAR_MIN}
              max={LANDSAT_YEAR_MAX}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full"
            />
            <span className="font-medium">{year}</span>
          </label>
          <label className="mb-2 block text-xs">
            Visual
            <select
              value={spectralMode}
              onChange={(e) => setSpectralMode(e.target.value as SpectralIndex)}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm"
            >
              {Object.entries(SPECTRAL_INDEX_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="mb-3 block text-xs">
            Opacidade
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              className="w-full"
            />
          </label>
          <button
            type="button"
            disabled={busy || !bbox}
            onClick={() => void handleSearch()}
            className="mb-2 w-full rounded-lg bg-teal-700 py-2 text-xs text-white disabled:opacity-50"
          >
            {busy ? "A processar…" : "Buscar imagens STAC"}
          </button>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
          <h2 className="mb-1 text-xs font-semibold">Elevação (OpenTopography)</h2>
          <p className="mb-2 text-[10px] text-[var(--muted)]">
            DEM GeoTIFF da área desenhada — recomendado COP30 (Copernicus GLO-30).
          </p>
          <label className="mb-2 block text-xs">
            Produto
            <select
              value={demType}
              onChange={(e) => setDemType(e.target.value)}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm"
            >
              <option value="COP30">COP30 — Copernicus GLO-30</option>
              <option value="SRTMGL1">SRTM GL1 — 30 m</option>
              <option value="NASADEM">NASADEM — 30 m</option>
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !bbox}
            onClick={() => void handleDownloadDem()}
            className="w-full rounded-lg border border-teal-700 py-2 text-xs text-teal-800 dark:text-teal-300 disabled:opacity-50"
          >
            {busy ? "A processar…" : "Baixar DEM OpenTopography"}
          </button>
        </div>

        <div className="max-h-64 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2">
          <p className="mb-1 text-[10px] font-medium uppercase text-[var(--muted)]">
            Cenas ({scenes.length})
          </p>
          {scenes.length === 0 && (
            <p className="text-[10px] text-[var(--muted)]">Nenhuma cena ainda.</p>
          )}
          {scenes.map((s) => (
            <div
              key={s.id}
              className={`mb-1 rounded border p-2 text-[10px] ${
                selected?.id === s.id
                  ? "border-teal-600 bg-teal-50 dark:bg-teal-950/30"
                  : "border-[var(--border)]"
              }`}
            >
              <p className="font-medium">{s.date}</p>
              <p className="text-[var(--muted)]">
                {s.satellite} · nuvem {s.cloud_cover_pct?.toFixed(0) ?? "?"}%
              </p>
              <div className="mt-1 flex gap-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleDownloadScene(s, false)}
                  className="rounded bg-slate-700 px-2 py-0.5 text-white disabled:opacity-50"
                >
                  Ver
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleDownloadScene(s, true)}
                  className="rounded border border-[var(--border)] px-2 py-0.5 disabled:opacity-50"
                >
                  Comparar
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <div className="relative min-h-[520px] overflow-hidden rounded-xl border border-[var(--border)] lg:col-span-3">
        <Map
          ref={mapRef}
          mapboxAccessToken={token}
          initialViewState={{ ...initialView, bearing: 0, pitch: 0 }}
          mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
          style={{ width: "100%", height: "min(520px, 65vh)" }}
        >
          <DrawControl onBbox={setBbox} />

          {previewUrl && displayBounds && (
            <Source
              id="landsat-preview"
              type="image"
              url={previewUrl}
              coordinates={imageCoordsFromBbox(displayBounds)}
            >
              <Layer
                id="landsat-preview-layer"
                type="raster"
                paint={{ "raster-opacity": opacity }}
              />
            </Source>
          )}

          {compareUrl && compareBounds && (
            <Source
              id="landsat-compare"
              type="image"
              url={compareUrl}
              coordinates={imageCoordsFromBbox(compareBounds)}
            >
              <Layer
                id="landsat-compare-layer"
                type="raster"
                paint={{
                  "raster-opacity": opacity * 0.85,
                  "raster-fade-duration": 0,
                }}
              />
            </Source>
          )}
        </Map>
        {notice && (
          <p className="absolute bottom-2 left-2 z-10 max-w-[90%] rounded bg-black/70 px-2 py-1 text-[10px] text-white">
            {notice}
          </p>
        )}
        <p className="absolute right-2 top-2 z-10 rounded bg-black/55 px-2 py-0.5 text-[9px] text-white">
          Ferramentas: retângulo · polígono · apagar
        </p>
      </div>
    </div>
  );
}
