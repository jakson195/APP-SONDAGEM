"use client";

import { GeodataSourcesPanel } from "@/components/geodata-sources-panel";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveBrazilCitySearch } from "@/lib/geofisica/dipolo2d/city-geocode";
import {
  autoDetectChangeDates,
  changeGridToDataUrl,
} from "@/lib/geo/temporal/change-detection";
import { analyzeTemporalAi } from "@/lib/geo/temporal/ai/temporal-ai-detector";
import type { TemporalInterpretResult } from "@/lib/geo/temporal/ai/temporal-interpret-ai";
import { useTemporalTimeline } from "@/lib/geo/temporal/use-temporal-timeline";
import {
  BRAZIL_CENTER,
  bboxFromCenter,
  clampBboxToBrazil,
  defaultBrazilStudyBbox,
  isPointInBrazil,
} from "@/lib/geo/temporal/brazil-bbox";
import type {
  SpectralIndex,
  TemporalAiResult,
  TemporalAiTarget,
  TemporalChangeAnalysis,
  TemporalProvider,
  TemporalScene,
  TemporalViewMode,
  Wgs84Bbox,
} from "@/lib/geo/temporal/temporal-types";
import type { ProviderCapabilities } from "@/lib/geo/temporal/providers/temporal-providers";
import {
  SPECTRAL_INDEX_LABELS,
  TEMPORAL_AI_TARGET_LABELS,
  TEMPORAL_HISTORY_YEARS,
  TEMPORAL_PROVIDER_LABELS,
  defaultTemporalDateFrom,
  defaultTemporalDateTo,
} from "@/lib/geo/temporal/temporal-types";
import { defaultCatalogLimit } from "@/lib/geo/temporal/temporal-date-range";
import { searchLandsatStac } from "@/lib/geo/temporal/providers/landsat-stac-provider";
import {
  GARUVA_DATE_FROM,
  GARUVA_DATE_TO,
  GARUVA_EXAMPLE_BBOX,
} from "@/lib/geo/temporal/landsat-engine-client";
import { TemporalTimelinePanel } from "./temporal-timeline-panel";
import { TemporalHeatmapView } from "./temporal-heatmap-view";
import { TemporalVoxelPanel } from "./temporal-voxel-panel";
import { TemporalAiPanel } from "./temporal-ai-panel";
import { geotiffToPngDataUrlAndBounds } from "@/lib/geotiff-for-leaflet";

const TemporalMapPanel = dynamic(
  () => import("./temporal-map-panel").then((m) => m.TemporalMapPanel),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex w-full items-center justify-center rounded-lg border border-[var(--border)] text-xs text-[var(--muted)]"
        style={{ height: "min(520px, 58vh)" }}
      >
        A carregar mapa…
      </div>
    ),
  },
);

const DEFAULT_PROVIDERS: TemporalProvider[] = [
  "sentinel2",
  "landsat",
  "cbers",
  "inpe",
  "gee",
  "sentinel_hub",
  "srtm",
];

const ALL_AI_TARGETS = Object.entries(TEMPORAL_AI_TARGET_LABELS).map(
  ([id, label]) => ({ id, label }),
);

export function TemporalImageryClient() {
  const [bbox, setBbox] = useState<Wgs84Bbox>(() => defaultBrazilStudyBbox());
  const [locationLabel, setLocationLabel] = useState(BRAZIL_CENTER.label);
  const [cityQuery, setCityQuery] = useState("");
  const [cityHits, setCityHits] = useState<
    { lat: number; lng: number; label: string }[]
  >([]);
  const [citySearching, setCitySearching] = useState(false);
  const [dateFrom, setDateFrom] = useState(defaultTemporalDateFrom);
  const [dateTo, setDateTo] = useState(defaultTemporalDateTo);
  const [providers, setProviders] =
    useState<TemporalProvider[]>(DEFAULT_PROVIDERS);
  const [scenes, setScenes] = useState<TemporalScene[]>([]);
  const [capabilities, setCapabilities] = useState<ProviderCapabilities[]>([]);
  const [demoMode, setDemoMode] = useState(true);
  const [index, setIndex] = useState<SpectralIndex>("rgb");
  const [viewMode, setViewMode] = useState<TemporalViewMode>("single");
  const [splitPct, setSplitPct] = useState(50);
  const [change, setChange] = useState<TemporalChangeAnalysis | null>(null);
  const [heatmapUrl, setHeatmapUrl] = useState<string | null>(null);
  const [ai, setAi] = useState<TemporalAiResult | null>(null);
  const [interpretation, setInterpretation] =
    useState<TemporalInterpretResult | null>(null);
  const [aiTargets, setAiTargets] = useState<string[]>([
    "geological_alteration",
    "vegetation_change",
    "paleochannels",
    "mineralization",
    "slope_movement",
    "erosion_expansion",
  ]);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzeBusy, setAnalyzeBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const timeline = useTemporalTimeline(scenes);
  const selectEpochRef = useRef(timeline.selectEpoch);
  selectEpochRef.current = timeline.selectEpoch;

  const goToLocation = useCallback((lat: number, lng: number, label: string) => {
    if (!isPointInBrazil(lat, lng)) {
      setNotice("Localização fora do território brasileiro.");
      return;
    }
    setLocationLabel(label);
    setBbox(clampBboxToBrazil(bboxFromCenter(lat, lng)));
    setCityHits([]);
    setCityQuery(label);
  }, []);

  const handleBboxFromMap = useCallback((next: Wgs84Bbox) => {
    setBbox(next);
    setLocationLabel("Área personalizada");
  }, []);

  const searchCity = useCallback(async () => {
    const q = cityQuery.trim();
    if (q.length < 2) return;
    setCitySearching(true);
    try {
      const { results } = await resolveBrazilCitySearch(q);
      const inBrazil = results.filter((r) => isPointInBrazil(r.lat, r.lng));
      setCityHits(inBrazil);
      if (inBrazil.length === 1) {
        goToLocation(inBrazil[0]!.lat, inBrazil[0]!.lng, inBrazil[0]!.label);
      } else if (inBrazil.length === 0) {
        setNotice("Nenhuma cidade encontrada no Brasil.");
      }
    } finally {
      setCitySearching(false);
    }
  }, [cityQuery, goToLocation]);

  const sceneCurrent = timeline.sceneForDate(timeline.currentEpoch);
  const sceneA = timeline.sceneForDate(timeline.dateA);
  const sceneB = timeline.sceneForDate(timeline.dateB);

  const {
    setDateA,
    setDateB,
  } = timeline;

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    try {
      const res = await fetch("/api/geo/temporal/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bbox,
          dateFrom,
          dateTo,
          providers,
          maxCloudPct: 40,
          limit: defaultCatalogLimit(dateFrom, dateTo),
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        scenes?: TemporalScene[];
        demoMode?: boolean;
        warnings?: string[];
        capabilities?: ProviderCapabilities[];
        error?: string;
      };
      if (!json.ok) throw new Error(json.error ?? "Falha catálogo");
      let loaded = json.scenes ?? [];
      const landsatAllDemo =
        providers.includes("landsat") &&
        loaded.filter((s) => s.provider === "landsat").every((s) => s.demo);
      if (landsatAllDemo) {
        try {
          const ls = await searchLandsatStac({
            bbox,
            dateFrom,
            dateTo,
            maxCloudPct: 40,
            limit: defaultCatalogLimit(dateFrom, dateTo),
          });
          if (ls.length > 0) {
            loaded = [
              ...loaded.filter((s) => s.provider !== "landsat"),
              ...ls,
            ];
          }
        } catch {
          /* servidor ou browser sem STAC */
        }
      }
      setScenes(loaded);
      setDemoMode(loaded.length === 0 || loaded.every((s) => s.demo));
      setCapabilities(json.capabilities ?? []);
      setChange(null);
      setHeatmapUrl(null);
      const auto = autoDetectChangeDates(loaded);
      if (auto) {
        setDateA(auto.dateA);
        setDateB(auto.dateB);
        selectEpochRef.current(auto.dateB);
      }
      setNotice(
        `${loaded.length} cena(s) · ${json.demoMode ? "modo demo" : "dados reais"}` +
          (json.warnings?.length ? ` · ${json.warnings[0]}` : ""),
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Erro ao carregar catálogo");
    } finally {
      setLoading(false);
    }
  }, [bbox, dateFrom, dateTo, providers, setDateA, setDateB]);

  useEffect(() => {
    const t = window.setTimeout(() => void loadCatalog(), 350);
    return () => window.clearTimeout(t);
  }, [loadCatalog]);

  const runChangeAnalysis = useCallback(async () => {
    const dateA = timeline.dateA;
    const dateB = timeline.dateB;
    if (!dateA || !dateB) {
      setNotice("Seleccione duas datas para comparar.");
      return;
    }
    setAnalyzeBusy(true);
    try {
      const res = await fetch("/api/geo/temporal/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateA, dateB, index, bbox }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        change?: TemporalChangeAnalysis;
        error?: string;
      };
      if (!json.ok || !json.change) throw new Error(json.error ?? "Falha análise");
      setChange(json.change);
      const url = changeGridToDataUrl(json.change.heatmapGrid, index);
      setHeatmapUrl(url);
      setViewMode("heatmap");
      setNotice(
        `Mudança detectada: ${json.change.changePct.toFixed(1)}% (${dateA} → ${dateB}).`,
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Erro na análise");
    } finally {
      setAnalyzeBusy(false);
    }
  }, [timeline.dateA, timeline.dateB, index, bbox]);

  const runAi = useCallback(async () => {
    if (!change) {
      setNotice("Execute análise de mudança antes da IA.");
      return;
    }
    setAiBusy(true);
    try {
      const clientAi = await analyzeTemporalAi(
        {
          change,
          bbox,
          targets: aiTargets as TemporalAiTarget[],
        },
        true,
      );
      setAi(clientAi);

      const res = await fetch("/api/geo/temporal/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          change,
          bbox,
          targets: aiTargets,
          useOpenAi: true,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        ai?: TemporalAiResult;
        interpretation?: TemporalInterpretResult;
      };
      if (json.ai) setAi(json.ai);
      if (json.interpretation) setInterpretation(json.interpretation);
      setNotice("IA temporal concluída.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Erro IA");
    } finally {
      setAiBusy(false);
    }
  }, [change, bbox, aiTargets]);

  const importGeotiff = useCallback(async (file: File) => {
    try {
      const imp = await geotiffToPngDataUrlAndBounds(file);
      const scene: TemporalScene = {
        id: `geotiff-${Date.now()}`,
        provider: "gee",
        satellite: file.name,
        date: new Date().toISOString().slice(0, 10),
        bounds: {
          west: imp.bounds.west,
          south: imp.bounds.south,
          east: imp.bounds.east,
          north: imp.bounds.north,
        },
        thumbnailUrl: imp.dataUrl,
        demo: false,
      };
      setScenes((prev) => [...prev, scene]);
      setBbox(scene.bounds);
      setLocationLabel(file.name);
      timeline.selectEpoch(scene.date);
      setNotice(`GeoTIFF «${file.name}» importado (${imp.crs.label}).`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Falha ao ler GeoTIFF");
    }
  }, [timeline]);

  const toggleProvider = (p: TemporalProvider) => {
    setProviders((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  };

  const toggleAiTarget = (id: string) => {
    setAiTargets((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const showSplit = useMemo(
    () =>
      viewMode === "split" ||
      (timeline.mode === "compare" && timeline.compareMode !== "diff"),
    [viewMode, timeline.mode, timeline.compareMode],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/geo"
            className="text-xs text-teal-700 hover:underline dark:text-teal-400"
          >
            ← GEO
          </Link>
          <h1 className="mt-1 text-2xl font-bold">Imagens históricas</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Timelapse {TEMPORAL_HISTORY_YEARS} anos —{" "}
            <strong className="font-normal text-[var(--text)]">
              Planetary Computer
            </strong>{" "}
            (Landsat) · geologia{" "}
            <strong className="font-normal text-[var(--text)]">GeoSGB</strong> ·
            Sentinel via{" "}
            <strong className="font-normal text-[var(--text)]">Copernicus</strong>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/geo/temporal/landsat"
            className="rounded-lg border border-teal-600/40 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-900 dark:bg-teal-950/30 dark:text-teal-100"
          >
            Landsat STAC + Mapbox
          </Link>
          <button
            type="button"
            disabled={loading}
            onClick={() => void loadCatalog()}
            className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {loading ? "A carregar…" : "Actualizar catálogo"}
          </button>
        </div>
      </div>

      {notice && (
        <p className="rounded-lg border border-teal-600/30 bg-teal-50 px-3 py-2 text-xs text-teal-900 dark:bg-teal-950/30 dark:text-teal-100">
          {notice}
        </p>
      )}

      <section className="grid gap-4 lg:grid-cols-4">
        <div className="space-y-3 lg:col-span-1">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
            <p className="mb-2 font-medium">Local no Brasil</p>
            <div className="mb-2 flex gap-1">
              <input
                type="search"
                value={cityQuery}
                onChange={(e) => setCityQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void searchCity();
                }}
                placeholder="Cidade, município ou região…"
                className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs"
              />
              <button
                type="button"
                disabled={citySearching}
                onClick={() => void searchCity()}
                className="shrink-0 rounded bg-teal-700 px-2 py-1 text-[10px] text-white disabled:opacity-50"
              >
                {citySearching ? "…" : "Ir"}
              </button>
            </div>
            {cityHits.length > 1 && (
              <ul className="mb-2 max-h-28 space-y-0.5 overflow-y-auto rounded border border-[var(--border)] p-1">
                {cityHits.map((hit) => (
                  <li key={`${hit.lat}-${hit.lng}-${hit.label}`}>
                    <button
                      type="button"
                      className="w-full rounded px-1 py-0.5 text-left text-[10px] hover:bg-teal-600/10"
                      onClick={() =>
                        goToLocation(hit.lat, hit.lng, hit.label)
                      }
                    >
                      {hit.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mb-2 text-[10px] text-[var(--muted)]">
              Área actual: <strong className="text-[var(--text)]">{locationLabel}</strong>
              {" · "}
              arraste o mapa para ajustar a janela de estudo.
            </p>
            <div className="mb-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  goToLocation(
                    BRAZIL_CENTER.lat,
                    BRAZIL_CENTER.lng,
                    BRAZIL_CENTER.label,
                  )
                }
                className="text-[10px] text-teal-700 underline"
              >
                Centro do Brasil
              </button>
              <button
                type="button"
                onClick={() => {
                  setLocationLabel("Garuva, SC");
                  setBbox(GARUVA_EXAMPLE_BBOX);
                  setDateFrom(GARUVA_DATE_FROM);
                  setDateTo(GARUVA_DATE_TO);
                }}
                className="text-[10px] text-teal-700 underline"
              >
                Exemplo Garuva SC (1972–2026)
              </button>
            </div>
            <p className="mb-2 mt-3 font-medium">Período</p>
            <label className="mb-2 block text-xs text-[var(--muted)]">
              De
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
              />
            </label>
            <label className="mb-2 block text-xs text-[var(--muted)]">
              Até
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
              />
            </label>
            <div className="mb-2 flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => {
                  setDateFrom(defaultTemporalDateFrom());
                  setDateTo(defaultTemporalDateTo());
                }}
                className="rounded border border-teal-600/40 bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-900 dark:bg-teal-950/30 dark:text-teal-100"
              >
                Últimos {TEMPORAL_HISTORY_YEARS} anos
              </button>
            </div>
            <p className="mb-2 text-[10px] text-[var(--muted)]">
              Amostragem ~1 cena/ano (50 anos). Modo{" "}
              <strong className="text-[var(--text)]">RGB natural</strong> = visual
              Google Earth via Landsat STAC. Anterior a 1999 → P&B automático.
            </p>
            <label className="mt-2 block cursor-pointer text-[10px] text-teal-800 underline dark:text-teal-300">
              Importar GeoTIFF (geotiff.js)
              <input
                type="file"
                accept=".tif,.tiff,.geotiff"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importGeotiff(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-2 text-sm font-medium">Fontes</p>
            <div className="flex flex-wrap gap-1">
              {DEFAULT_PROVIDERS.map((p) => {
                const cap = capabilities.find((c) => c.id === p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => toggleProvider(p)}
                    className={`rounded px-2 py-0.5 text-[10px] ${
                      providers.includes(p)
                        ? "bg-slate-700 text-white"
                        : "border border-[var(--border)] opacity-50"
                    }`}
                    title={
                      cap?.configured ? "Configurado" : "Demo / requer credenciais"
                    }
                  >
                    {TEMPORAL_PROVIDER_LABELS[p]}
                    {!cap?.configured && p !== "landsat" && p !== "srtm" ? " *" : ""}
                  </button>
                );
              })}
            </div>
            {demoMode && (
              <p className="mt-2 text-[10px] text-amber-700 dark:text-amber-400">
                * Configure GEE, Sentinel Hub ou Copernicus para cenas reais.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-2 text-sm font-medium">Modo visual</p>
            <p className="mb-2 text-[10px] text-[var(--muted)]">
              Use <strong className="text-[var(--text)]">RGB natural</strong> para
              timelapse fotográfico. Índices (NDVI, etc.) são camadas analíticas.
            </p>
            <select
              value={index}
              onChange={(e) => setIndex(e.target.value as SpectralIndex)}
              className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
            >
              {Object.entries(SPECTRAL_INDEX_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={analyzeBusy}
              onClick={() => void runChangeAnalysis()}
              className="mt-2 w-full rounded bg-slate-700 py-1.5 text-xs text-white disabled:opacity-50"
            >
              {analyzeBusy ? "A analisar…" : "Analisar mudança temporal"}
            </button>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-2 text-sm font-medium">Layout</p>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["single", "Mapa"],
                  ["split", "Split screen"],
                  ["animation", "Animação"],
                  ["heatmap", "Heatmap"],
                  ["voxel3d", "Voxel 3D"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setViewMode(id)}
                  className={`rounded px-2 py-0.5 text-[10px] ${
                    viewMode === id
                      ? "bg-teal-700 text-white"
                      : "border border-[var(--border)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {showSplit && (
              <label className="mt-2 block text-xs text-[var(--muted)]">
                Divisor split
                <input
                  type="range"
                  min={10}
                  max={90}
                  value={splitPct}
                  onChange={(e) => setSplitPct(Number(e.target.value))}
                  className="w-full"
                />
              </label>
            )}
          </div>

          <TemporalAiPanel
            ai={ai}
            interpretation={interpretation}
            loading={aiBusy}
            onRun={() => void runAi()}
            targets={aiTargets}
            onToggleTarget={toggleAiTarget}
            allTargets={ALL_AI_TARGETS}
          />

          <GeodataSourcesPanel compact />
        </div>

        <div className="space-y-3 lg:col-span-3">
          <TemporalTimelinePanel timeline={timeline} />

          {(viewMode === "single" ||
            viewMode === "split" ||
            viewMode === "animation") && (
            <TemporalMapPanel
              bbox={bbox}
              sceneA={
                timeline.mode === "compare"
                  ? sceneA
                  : sceneCurrent
              }
              sceneB={showSplit ? sceneB : null}
              spectralIndex={index}
              demoMode={demoMode}
              showSplit={showSplit}
              splitPct={splitPct}
              locationLabel={locationLabel}
              onBboxChange={handleBboxFromMap}
              heatmapDataUrl={
                timeline.compareMode === "diff" ? heatmapUrl : null
              }
            />
          )}

          {viewMode === "heatmap" && <TemporalHeatmapView change={change} />}

          {viewMode === "voxel3d" && <TemporalVoxelPanel change={change} />}

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--muted)]">
            <strong className="text-[var(--text)]">{scenes.length}</strong> cenas
            · índice <strong className="text-[var(--text)]">{index}</strong> ·{" "}
            {demoMode ? "demonstração" : "Copernicus/dados reais"}
          </div>
        </div>
      </section>
    </div>
  );
}
