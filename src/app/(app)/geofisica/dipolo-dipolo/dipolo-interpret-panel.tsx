"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PerfilEstratigrafico } from "@/components/perfil-estratigrafico";
import { drawGeologicInterpretSection } from "@/lib/geofisica/dipolo2d/draw-geologic-interpret";
import {
  buildInterpretReportTxt,
  interpretInvertedSection,
  summarizeInvertCells,
} from "@/lib/geofisica/dipolo2d/interpret-section-lithology";
import type {
  GeoSurveyLocation,
  RegionalGeologyProfile,
  SectionGeologicInterpretation,
} from "@/lib/geofisica/dipolo2d/interpret-types";
import { regionalMatchesLocation } from "@/lib/geofisica/dipolo2d/interpret-types";
import {
  GARUVA_DEFAULT_LOCATION,
  inferRegionalGeology,
} from "@/lib/geofisica/dipolo2d/regional-geology";
import type { Dipolo2DInvertParams, Dipolo2DInvertResult } from "@/lib/geofisica/dipolo2d/types";
import type { Dipolo2DReading } from "@/lib/geofisica/dipolo2d/types";
import { resolveBrazilCitySearch } from "@/lib/geofisica/dipolo2d/city-geocode";
import { downloadTextFile } from "@/lib/field-export-kml-gpx";
import {
  classifyRhoOhmM,
  formatNormLegend,
} from "@/lib/geofisica/dipolo2d/resistivity-norms-br";
import {
  buildModelZCoverProfile,
  bilinearLogRho,
  zCoverInterpolated,
} from "@/lib/geofisica/dipolo2d/model-section-render";
import {
  formatRefRowRange,
  type ResistivityRefRow,
} from "@/lib/geofisica/dipolo2d/resistivity-reference-table-br";
import { ResistivityReferenceTable } from "./resistivity-reference-table";
import { classificationRowsFromRegional } from "@/lib/geofisica/dipolo2d/sync-classification-from-regional";

function fetchGeologyAtPoint(lat: number, lng: number, timeoutMs: number) {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(`/api/geofisica/geology?lat=${lat}&lng=${lng}`, {
    cache: "no-store",
    signal: ctrl.signal,
  }).finally(() => window.clearTimeout(timer));
}

const DipoloLocationMap = dynamic(
  () =>
    import("./dipolo-location-map").then((m) => ({ default: m.DipoloLocationMap })),
  { ssr: false, loading: () => <div className="h-56 animate-pulse rounded-lg bg-[var(--muted)]/20" /> },
);

type Props = {
  invertResult: Dipolo2DInvertResult | null;
  params: Dipolo2DInvertParams;
  activeReadings: Dipolo2DReading[];
  location: GeoSurveyLocation | null;
  onLocationChange: (loc: GeoSurveyLocation | null) => void;
  regional: RegionalGeologyProfile | null;
  onRegionalChange: (r: RegionalGeologyProfile | null) => void;
  interpretation: SectionGeologicInterpretation | null;
  onInterpretationChange: (i: SectionGeologicInterpretation | null) => void;
  classificationTable: ResistivityRefRow[];
  onClassificationTableChange: (rows: ResistivityRefRow[]) => void;
};

export function DipoloInterpretPanel({
  invertResult,
  params,
  activeReadings,
  location,
  onLocationChange,
  regional,
  onRegionalChange,
  interpretation,
  onInterpretationChange,
  classificationTable,
  onClassificationTableChange,
}: Props) {
  const geoCanvasRef = useRef<HTMLCanvasElement>(null);
  const [clickedRho, setClickedRho] = useState<{
    stationM: number;
    depthM: number;
    rhoOhmM: number;
    classLabel: string;
    classRange: string;
  } | null>(null);
  const modelRhoMedian = useMemo(() => {
    if (!invertResult || activeReadings.length < 4) return null;
    return summarizeInvertCells(invertResult, params, activeReadings).rhoMedianOhmM;
  }, [invertResult, activeReadings, params]);
  const [busy, setBusy] = useState<"regional" | "interpret" | null>(null);
  const [citySearchBusy, setCitySearchBusy] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [cityQuery, setCityQuery] = useState("");
  const [cityResults, setCityResults] = useState<
    { lat: number; lng: number; label: string }[]
  >([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const geoReqRef = useRef(0);

  const latStr = location?.lat != null ? String(location.lat) : "";
  const lngStr = location?.lng != null ? String(location.lng) : "";

  const applyRegionalAndTable = useCallback(
    (reg: RegionalGeologyProfile, lat: number, lng: number) => {
      const anchored: RegionalGeologyProfile = {
        ...reg,
        anchorLat: lat,
        anchorLng: lng,
      };
      onRegionalChange(anchored);
      const rows = classificationRowsFromRegional(anchored);
      if (rows.length) onClassificationTableChange(rows);
      onInterpretationChange(null);
      return anchored;
    },
    [onRegionalChange, onClassificationTableChange, onInterpretationChange],
  );

  const loadRegionalFromMaps = useCallback(
    async (lat: number, lng: number, label?: string) => {
      const reqId = ++geoReqRef.current;
      setGeoBusy(true);

      const quick = inferRegionalGeology(lat, lng);
      applyRegionalAndTable(quick, lat, lng);
      setNotice(
        `Ponto ${lat.toFixed(5)}°, ${lng.toFixed(5)}° — a consultar GeoSGB/CPRM…`,
      );

      try {
        const res = await fetchGeologyAtPoint(lat, lng, 12_000);
        if (reqId !== geoReqRef.current) return quick;

        const data = (await res.json()) as {
          ok?: boolean;
          regional?: RegionalGeologyProfile;
          aiAvailable?: boolean;
          error?: string;
        };
        setAiAvailable(Boolean(data.aiAvailable));

        const fresh =
          data.ok && data.regional
            ? data.regional
            : quick;
        applyRegionalAndTable(fresh, lat, lng);
        const src = fresh.dataSources?.join(", ") ?? fresh.source;
        const units = fresh.mapUnits?.length ?? 0;
        setNotice(
          label
            ? `${label} — ${units} unidade(s) no mapa (${src}). Tabela ρ atualizada.`
            : `${units} unidade(s) em ${lat.toFixed(5)}°, ${lng.toFixed(5)}° (${src}). Inverta e gere o modelo geológico.`,
        );
        return fresh;
      } catch {
        if (reqId !== geoReqRef.current) return quick;
        applyRegionalAndTable(quick, lat, lng);
        setNotice(
          "GeoSGB/CPRM lento ou indisponível — classificação por regras regionais no ponto.",
        );
        return quick;
      } finally {
        if (reqId === geoReqRef.current) setGeoBusy(false);
      }
    },
    [applyRegionalAndTable],
  );

  useEffect(() => {
    void fetchGeologyAtPoint(
      location?.lat ?? GARUVA_DEFAULT_LOCATION.lat,
      location?.lng ?? GARUVA_DEFAULT_LOCATION.lng,
      6_000,
    )
      .then((r) => r.json())
      .then((d: { aiAvailable?: boolean }) =>
        setAiAvailable(Boolean(d.aiAvailable)),
      )
      .catch(() => {});
    const lat = location?.lat ?? GARUVA_DEFAULT_LOCATION.lat;
    const lng = location?.lng ?? GARUVA_DEFAULT_LOCATION.lng;
    if (!regional || !regionalMatchesLocation(regional, lat, lng)) {
      void loadRegionalFromMaps(lat, lng, location?.label);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carga inicial
  }, []);

  const applyLocation = useCallback(
    (lat: number, lng: number, label?: string, zoom?: number) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      onLocationChange({
        lat,
        lng,
        label: label ?? "Linha ERT",
        zoom,
        at: Date.now(),
      });
      setCityResults([]);
      void loadRegionalFromMaps(lat, lng, label);
    },
    [onLocationChange, loadRegionalFromMaps],
  );

  const goToCity = useCallback(
    (r: { lat: number; lng: number; label: string }) => {
      onLocationChange({
        lat: r.lat,
        lng: r.lng,
        label: r.label,
        zoom: 13,
        at: Date.now(),
      });
      setCityQuery(r.label);
      setCityResults([]);
      setNotice(
        `Mapa centrado em ${r.label} (${r.lat.toFixed(5)}°, ${r.lng.toFixed(5)}°). A consultar CPRM…`,
      );
      void loadRegionalFromMaps(r.lat, r.lng, r.label);
    },
    [onLocationChange, loadRegionalFromMaps],
  );

  const searchCity = useCallback(async () => {
    const q = cityQuery.trim();
    if (q.length < 2) {
      setNotice("Digite pelo menos 2 caracteres (ex.: Garuva, Joinville).");
      return;
    }
    setCitySearchBusy(true);
    setNotice(null);
    setCityResults([]);
    try {
      const { results } = await resolveBrazilCitySearch(q);
      if (!results.length) {
        setNotice(
          `Nenhum resultado para «${q}». Tente «Cidade UF» (ex.: Palhoça SC).`,
        );
        return;
      }
      if (results.length === 1) {
        goToCity(results[0]!);
        return;
      }
      setCityResults(results);
      setNotice(`${results.length} resultados — escolha abaixo.`);
    } catch {
      setNotice("Não foi possível buscar a cidade. Verifique a ligação.");
    } finally {
      setCitySearchBusy(false);
    }
  }, [cityQuery, goToCity]);

  const setCoords = useCallback(
    (lat: number, lng: number) => {
      applyLocation(lat, lng);
    },
    [applyLocation],
  );

  const characterizeRegion = useCallback(async () => {
    const lat = location?.lat ?? GARUVA_DEFAULT_LOCATION.lat;
    const lng = location?.lng ?? GARUVA_DEFAULT_LOCATION.lng;
    setBusy("regional");
    setNotice(null);
    try {
      const cellSummary =
        invertResult && activeReadings.length >= 4
          ? summarizeInvertCells(invertResult, params, activeReadings)
          : null;

      const res = await fetch("/api/geofisica/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng, cellSummary }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        regional?: RegionalGeologyProfile;
        aiAvailable?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.regional) {
        const fallback = inferRegionalGeology(lat, lng);
        onRegionalChange(fallback);
        onInterpretationChange(null);
        setNotice(
          data.error
            ? `API: ${data.error}. Usando regras regionais.`
            : "Caracterização por regras regionais.",
        );
      } else {
        const lat = location?.lat ?? GARUVA_DEFAULT_LOCATION.lat;
        const lng = location?.lng ?? GARUVA_DEFAULT_LOCATION.lng;
        applyRegionalAndTable(data.regional, lat, lng);
        setAiAvailable(Boolean(data.aiAvailable));
        const n = data.regional.mapUnits?.length ?? 0;
        const src = data.regional.dataSources?.join(", ") ?? data.regional.source;
        setNotice(
          data.regional.source === "ai"
            ? `CPRM/Macrostrat + IA: ${n} unidade(s). Tabela ρ atualizada. ${src}`
            : `CPRM/Macrostrat: ${n} unidade(s). Tabela ρ atualizada. ${src}`,
        );
      }
    } catch {
      const lat = location?.lat ?? GARUVA_DEFAULT_LOCATION.lat;
      const lng = location?.lng ?? GARUVA_DEFAULT_LOCATION.lng;
      onRegionalChange(inferRegionalGeology(lat, lng));
      onInterpretationChange(null);
      setNotice("Sem ligação à API — regras regionais aplicadas localmente.");
    } finally {
      setBusy(null);
    }
  }, [
    location,
    invertResult,
    activeReadings,
    params,
    location,
    applyRegionalAndTable,
    onInterpretationChange,
    classificationTable,
  ]);

  const refineInterpretationWithAi = useCallback(
    async (
      interp: SectionGeologicInterpretation,
      reg: RegionalGeologyProfile,
      lat: number,
      lng: number,
    ): Promise<SectionGeologicInterpretation> => {
      try {
        const cellSummary =
          invertResult && activeReadings.length >= 4
            ? summarizeInvertCells(invertResult, params, activeReadings)
            : null;
        const res = await fetch("/api/geofisica/interpret", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "section",
            lat,
            lng,
            cellSummary,
            regional: reg,
            section: {
              baseNarrative: interp.narrative,
              layerUnits: interp.layerUnits.map((u) => ({
                id: u.id,
                label: u.label,
                material: u.material,
                meanRhoOhmM: u.meanRhoOhmM,
                cellCount: u.cellCount,
              })),
              representativeLayers: interp.representative.layers.map((L) => ({
                topo: L.topo,
                base: L.base,
                material: L.material,
              })),
              contacts: interp.contactLines.map((c) => ({
                layerAbove: c.layerAbove,
                layerBelow: c.layerBelow,
              })),
            },
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          sectionAi?: {
            narrative: string;
            layerMaterials: Record<number, string>;
            fieldNotes: string;
            confidence: "alta" | "media" | "baixa";
          };
        };
        if (!res.ok || !data.ok || !data.sectionAi) {
          setAiAvailable(Boolean((data as { aiAvailable?: boolean }).aiAvailable));
          return interp;
        }
        setAiAvailable(true);

        const materialMap = new Map<string, string>();
        const renamedUnits = interp.layerUnits.map((u) => {
          const name = data.sectionAi!.layerMaterials[u.id];
          if (name) materialMap.set(u.material, name);
          return name ? { ...u, material: name } : u;
        });
        const renamedRepLayers = interp.representative.layers.map((L) => ({
          ...L,
          material: materialMap.get(L.material) ?? L.material,
        }));
        return {
          ...interp,
          narrative: data.sectionAi.narrative,
          fieldNotes: data.sectionAi.fieldNotes,
          aiConfidence: data.sectionAi.confidence,
          layerUnits: renamedUnits,
          representative: {
            ...interp.representative,
            layers: renamedRepLayers,
          },
        };
      } catch {
        return interp;
      }
    },
    [invertResult, activeReadings, params],
  );

  const runInterpretation = useCallback(async () => {
    if (!invertResult || activeReadings.length < 4) {
      setNotice("Inverta primeiro (mín. 4 leituras ativas).");
      return;
    }
    const lat = location?.lat ?? GARUVA_DEFAULT_LOCATION.lat;
    const lng = location?.lng ?? GARUVA_DEFAULT_LOCATION.lng;
    setBusy("interpret");
    try {
      let reg =
        regional && regionalMatchesLocation(regional, lat, lng)
          ? regional
          : null;
      if (!reg) {
        reg = inferRegionalGeology(lat, lng);
        onRegionalChange(reg);
        void loadRegionalFromMaps(lat, lng, location?.label);
      }
      let interp = interpretInvertedSection(
        invertResult,
        params,
        activeReadings,
        reg,
        classificationTable,
      );
      const beforeNarrative = interp.narrative;
      interp = await refineInterpretationWithAi(interp, reg, lat, lng);
      const usedAi = interp.narrative !== beforeNarrative || Boolean(interp.fieldNotes);
      onInterpretationChange(interp);
      setNotice(
        usedAi
          ? `Modelo geológico + narrativa IA para ${reg.regionName} (${lat.toFixed(4)}°, ${lng.toFixed(4)}°).`
          : `Modelo geológico gerado para ${reg.regionName} (${lat.toFixed(4)}°, ${lng.toFixed(4)}°).`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro na interpretação";
      setNotice(msg);
    } finally {
      setBusy(null);
    }
  }, [
    invertResult,
    activeReadings,
    params,
    regional,
    location,
    onRegionalChange,
    onInterpretationChange,
    loadRegionalFromMaps,
    classificationTable,
    refineInterpretationWithAi,
  ]);

  const suggestClassificationByLocation = useCallback(async () => {
    const lat = location?.lat ?? GARUVA_DEFAULT_LOCATION.lat;
    const lng = location?.lng ?? GARUVA_DEFAULT_LOCATION.lng;
    setSuggestBusy(true);
    try {
      const cellSummary =
        invertResult && activeReadings.length >= 4
          ? summarizeInvertCells(invertResult, params, activeReadings)
          : null;
      const res = await fetch("/api/geofisica/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng, cellSummary }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        regional?: RegionalGeologyProfile;
        aiAvailable?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.regional) {
        setNotice(
          data.error
            ? `Não foi possível sugerir por IA: ${data.error}`
            : "Não foi possível sugerir a classificação por localização.",
        );
        return;
      }

      applyRegionalAndTable(data.regional, lat, lng);
      setAiAvailable(Boolean(data.aiAvailable));
      const rows = classificationRowsFromRegional(data.regional);
      if (!rows.length) {
        setNotice("Sem materiais regionais suficientes para montar a tabela.");
        return;
      }
      onClassificationTableChange(rows);
      setNotice(
        `Tabela sugerida por ${
          data.regional.source === "ai"
            ? "IA + dados geológicos/artigos"
            : "dados geológicos regionais"
        } para ${data.regional.regionName}. Clique em Gerar modelo geológico.`,
      );
    } catch {
      setNotice("Falha ao buscar sugestão IA por localização.");
    } finally {
      setSuggestBusy(false);
    }
  }, [
    location,
    invertResult,
    activeReadings,
    params,
    applyRegionalAndTable,
    onClassificationTableChange,
  ]);

  const tableSignature = classificationTable
    .map((r) => `${r.id}:${r.meio}:${r.rhoMinOhmM}:${r.rhoMaxOhmM}:${r.cor}`)
    .join("|");

  const interpretationStale =
    interpretation != null &&
    interpretation.classificationTable != null &&
    tableSignature !==
      interpretation.classificationTable
        .map(
          (r) =>
            `${r.id}:${r.meio}:${r.rhoMinOhmM}:${r.rhoMaxOhmM}:${r.cor}`,
        )
        .join("|");

  useEffect(() => {
    if (!interpretation || !invertResult || !geoCanvasRef.current) return;
    const id = requestAnimationFrame(() => {
      if (!geoCanvasRef.current) return;
      drawGeologicInterpretSection(
        geoCanvasRef.current,
        invertResult,
        params,
        activeReadings,
        interpretation,
      );
    });
    return () => cancelAnimationFrame(id);
  }, [interpretation, invertResult, params, activeReadings, tableSignature]);

  useEffect(() => {
    const onResize = () => {
      if (!interpretation || !invertResult || !geoCanvasRef.current) return;
      drawGeologicInterpretSection(
        geoCanvasRef.current,
        invertResult,
        params,
        activeReadings,
        interpretation,
      );
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [interpretation, invertResult, params, activeReadings, tableSignature]);

  const onInterpretCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!geoCanvasRef.current || !invertResult || !interpretation) return;
      const canvas = geoCanvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const w = canvas.clientWidth;
      const h = Math.min(760, Math.max(440, Math.floor(w * 0.88)));
      const padL = 12;
      const padR = 12;
      const padT = 40;
      const padB = 110;
      const gap = 44;
      const depthAxisW = 44;
      const plotX0 = padL + depthAxisW;
      const plotX1 = w - padR;
      const plotW = plotX1 - plotX0;
      const totalPlotH = h - padT - padB - gap;
      const plotH = totalPlotH / 2;
      const yBot0 = padT + plotH + gap;

      if (
        clickX < plotX0 ||
        clickX > plotX1 ||
        clickY < yBot0 ||
        clickY > yBot0 + plotH
      ) {
        return;
      }

      const nx = invertResult.nx;
      const nz = invertResult.nz;
      const x0 = invertResult.xEdgesM[0]!;
      const x1 = invertResult.xEdgesM[nx]!;
      const z0 = invertResult.zEdgesM[0]!;
      const z1 = invertResult.zEdgesM[nz]!;
      const dx = (x1 - x0) / Math.max(1, nx);
      const dz = (z1 - z0) / Math.max(1, nz);

      const stationM = x0 + ((clickX - plotX0) / (plotW || 1)) * (x1 - x0);
      const depthM = z0 + ((clickY - yBot0) / (plotH || 1)) * (z1 - z0);

      if (activeReadings.length > 0) {
        const zCoverProfile = buildModelZCoverProfile(
          activeReadings,
          x0,
          x1,
          nx,
          z1,
          params.factorDepth,
        );
        const zCov = zCoverInterpolated(zCoverProfile, stationM, x0, dx, nx);
        if (depthM > zCov + dz * 0.35) return;
      }

      const fi = (stationM - x0) / dx - 0.5;
      const fj = (depthM - z0) / dz - 0.5;
      const logRho = bilinearLogRho(invertResult.mLog10, nx, nz, fi, fj);
      const rhoOhmM = 10 ** logRho;
      const band = classifyRhoOhmM(rhoOhmM, interpretation.resistivityNorm);
      const row = interpretation.classificationTable.find(
        (r) => r.meio.trim().toLowerCase() === band.label.trim().toLowerCase(),
      );
      setClickedRho({
        stationM,
        depthM,
        rhoOhmM,
        classLabel: band.label,
        classRange: row ? formatRefRowRange(row) : `${band.rhoMinOhmM}-${band.rhoMaxOhmM} Ω·m`,
      });
    },
    [activeReadings, invertResult, interpretation, params.factorDepth],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="text-sm font-semibold text-[var(--text)]">
            1. Local da linha geofísica
          </h2>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void searchCity();
            }}
          >
            <input
              type="search"
              placeholder="Cidade (ex.: Garuva, Criciúma SC)"
              className="min-w-[12rem] flex-1 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm dark:bg-gray-900"
              value={cityQuery}
              onChange={(e) => setCityQuery(e.target.value)}
            />
            <button
              type="submit"
              disabled={citySearchBusy}
              className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {citySearchBusy ? "A buscar…" : "Ir para cidade"}
            </button>
          </form>
          {cityResults.length > 1 && (
            <ul className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 text-sm">
              {cityResults.map((r) => (
                <li key={`${r.lat}-${r.lng}-${r.label}`}>
                  <button
                    type="button"
                    className="w-full rounded px-2 py-1.5 text-left hover:bg-teal-600/10"
                    onClick={() => goToCity(r)}
                  >
                    {r.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-1.5">
            {[
              "Garuva SC",
              "Criciúma",
              "Joinville",
              "Itapoá",
              "Curitiba",
              "Florianópolis",
            ].map(
              (nome) => (
                <button
                  key={nome}
                  type="button"
                  className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs text-[var(--muted)] hover:bg-[var(--muted)]/10"
                  onClick={() => {
                    setCityQuery(nome);
                    void (async () => {
                      setCitySearchBusy(true);
                      setNotice(null);
                      try {
                        const { results } = await resolveBrazilCitySearch(nome);
                        const r = results[0];
                        if (r) goToCity(r);
                        else setNotice(`Não encontrado: ${nome}`);
                      } catch {
                        setNotice("Erro ao buscar cidade.");
                      } finally {
                        setCitySearchBusy(false);
                      }
                    })();
                  }}
                >
                  {nome}
                </button>
              ),
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-[var(--muted)]">
              Latitude
              <input
                type="text"
                inputMode="decimal"
                className="mt-1 w-full rounded border border-[var(--border)] bg-white px-2 py-1.5 text-sm dark:bg-gray-900"
                value={latStr}
                onChange={(e) => {
                  const lat = Number(e.target.value.replace(",", "."));
                  const lng = location?.lng ?? GARUVA_DEFAULT_LOCATION.lng;
                  if (Number.isFinite(lat)) setCoords(lat, lng);
                }}
              />
            </label>
            <label className="text-xs text-[var(--muted)]">
              Longitude
              <input
                type="text"
                inputMode="decimal"
                className="mt-1 w-full rounded border border-[var(--border)] bg-white px-2 py-1.5 text-sm dark:bg-gray-900"
                value={lngStr}
                onChange={(e) => {
                  const lng = Number(e.target.value.replace(",", "."));
                  const lat = location?.lat ?? GARUVA_DEFAULT_LOCATION.lat;
                  if (Number.isFinite(lng)) setCoords(lat, lng);
                }}
              />
            </label>
          </div>
          <button
            type="button"
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--muted)]/10"
            onClick={() =>
              applyLocation(
                GARUVA_DEFAULT_LOCATION.lat,
                GARUVA_DEFAULT_LOCATION.lng,
                "Garuva",
              )
            }
          >
            Usar Garuva (exemplo)
          </button>
          <DipoloLocationMap
            location={location}
            onLocationChange={(loc) =>
              onLocationChange({
                lat: loc.lat,
                lng: loc.lng,
                label: loc.label,
                zoom: loc.zoom,
                at: loc.at,
              })
            }
            onMapPick={(loc) => {
              setCityResults([]);
              setNotice(
                `Ponto marcado (${loc.lat.toFixed(5)}°, ${loc.lng.toFixed(5)}°). A consultar GeoSGB/CPRM…`,
              );
              void loadRegionalFromMaps(loc.lat, loc.lng, loc.label);
            }}
          />
          <button
            type="button"
            disabled={geoBusy || location?.lat == null}
            onClick={() => {
              const lat = location?.lat ?? GARUVA_DEFAULT_LOCATION.lat;
              const lng = location?.lng ?? GARUVA_DEFAULT_LOCATION.lng;
              void loadRegionalFromMaps(lat, lng, location?.label ?? "Linha ERT");
            }}
            className="w-full rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {geoBusy
              ? "A consultar GeoSGB/CPRM…"
              : "Buscar geologia no ponto do mapa"}
          </button>
          {location?.lat != null && (
            <p className="text-[10px] text-[var(--muted)]">
              Ponto: {location.lat.toFixed(5)}°, {location.lng?.toFixed(5)}°
              {location.label ? ` · ${location.label}` : ""}
            </p>
          )}
        </div>

        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="text-sm font-semibold text-[var(--text)]">
            2. Geologia regional
          </h2>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void characterizeRegion()}
            className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {busy === "regional"
              ? "A caracterizar…"
              : "Caracterizar (CPRM + IA)"}
          </button>
          {aiAvailable && (
            <p className="text-xs text-teal-700 dark:text-teal-400">
              OPENAI_API_KEY ativa — refino regional (materiais, ρ) e narrativa da secção invertida.
            </p>
          )}
          {!aiAvailable && (
            <p className="text-xs text-[var(--muted)]">
              Defina OPENAI_API_KEY em app-web/.env.local e reinicie npm run dev.
            </p>
          )}
          {regional && (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-sm">
              <p className="font-medium text-[var(--text)]">{regional.regionName}</p>
              {regional.anchorLat != null && regional.anchorLng != null && (
                <p className="mt-0.5 font-mono text-[10px] text-teal-700 dark:text-teal-400">
                  Ponto: {regional.anchorLat.toFixed(5)}°, {regional.anchorLng.toFixed(5)}°
                </p>
              )}
              <p className="mt-1 text-xs text-[var(--muted)]">{regional.province}</p>
              <p className="mt-1 text-xs text-teal-700 dark:text-teal-400">
                {(regional.dataSources ?? []).join(" · ") || regional.source}
              </p>
              <p className="mt-2 text-[var(--text)]">{regional.summary}</p>
              {regional.mapUnits.length > 0 && (
                <>
                  <p className="mt-3 text-xs font-medium text-[var(--text)]">
                    Unidades no ponto (mapa)
                  </p>
                  <ul className="mt-1 space-y-1 text-xs text-[var(--muted)]">
                    {regional.mapUnits.map((u, i) => (
                      <li
                        key={`${u.source}-${u.sigla ?? u.name}-${i}`}
                        className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
                      >
                        <span className="font-medium text-[var(--text)]">
                          {u.sigla ? `${u.sigla} — ` : ""}
                          {u.name}
                        </span>
                        {u.lithology && u.lithology !== u.name && (
                          <span> · {u.lithology}</span>
                        )}
                        {u.age && <span className="block text-[10px]">{u.age}</span>}
                        <span className="text-[10px] uppercase opacity-70">
                          {u.source}
                          {u.layerName ? ` · ${u.layerName}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <ul className="mt-2 list-inside list-disc text-xs text-[var(--muted)]">
                {regional.formations.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              {regional.resistivityNorm && (
                <div className="mt-2 rounded-lg border border-teal-500/30 bg-teal-500/5 p-2 text-xs">
                  <p className="font-medium text-[var(--text)]">
                    Classificação por resistividade — {regional.resistivityNorm.name}
                  </p>
                  <p className="mt-1 text-[var(--muted)]">
                    {formatNormLegend(regional.resistivityNorm)}
                  </p>
                  <p className="mt-1 text-[var(--muted)]">
                    Fonte:{" "}
                    {regional.resistivityNorm.source === "ai"
                      ? "norma BR + ajuste IA regional"
                      : regional.resistivityNorm.source === "regional"
                        ? "norma BR + preset regional"
                        : "norma de referência BR (Loke/Reynolds/CPRM)"}
                  </p>
                </div>
              )}
              <p className="mt-2 text-xs text-[var(--muted)]">
                {regional.materials.length} materiais (ρ) para classificação
              </p>
            </div>
          )}
        </div>
      </div>

      <ResistivityReferenceTable
        rows={classificationTable}
        onChange={onClassificationTableChange}
        highlightRhoOhmM={modelRhoMedian}
        onSuggestByLocation={suggestClassificationByLocation}
        suggestBusy={suggestBusy}
      />

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-sm font-semibold text-[var(--text)]">
          3. Interpretar secção invertida
        </h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Gera perfil em dois painéis usando a tabela de classificação acima
          (meio físico × faixa de ρ). Ajuste as linhas e clique em gerar.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== null || !invertResult}
            onClick={runInterpretation}
            className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {busy === "interpret" ? "A interpretar…" : "Gerar modelo geológico"}
          </button>
          {interpretation && (
            <button
              type="button"
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--muted)]/10"
              onClick={() =>
                downloadTextFile(
                  "interpretacao-geologica-ert.txt",
                  buildInterpretReportTxt(interpretation),
                  "text/plain;charset=utf-8",
                )
              }
            >
              Exportar relatório
            </button>
          )}
        </div>
        {notice && (
          <p className="mt-2 text-xs text-[var(--muted)]">{notice}</p>
        )}
        {interpretationStale && (
          <p className="mt-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-100">
            A tabela de classificação foi alterada — clique em{" "}
            <strong>Gerar modelo geológico</strong> para atualizar a secção.
          </p>
        )}
      </div>

      {interpretation && (
        <div
          key={`${interpretation.generatedAt}-${tableSignature}`}
          className="grid gap-4 xl:grid-cols-[1fr_auto]"
        >
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2">
            <canvas
              ref={geoCanvasRef}
              className="w-full cursor-crosshair rounded-lg"
              onClick={onInterpretCanvasClick}
            />
            <p className="mt-1 px-1 text-[10px] text-[var(--muted)]">
              Clique na secção interpretativa para ler ρ no ponto.
            </p>
            {clickedRho && (
              <div className="mt-2 rounded-lg border border-teal-500/30 bg-teal-500/5 px-2 py-1.5 text-xs">
                <span className="font-medium text-[var(--text)]">Ponto:</span>{" "}
                est. {clickedRho.stationM.toFixed(1)} m · prof. {clickedRho.depthM.toFixed(1)} m ·{" "}
                <span className="font-mono text-[var(--text)]">
                  ρ ≈ {clickedRho.rhoOhmM.toFixed(0)} Ω·m
                </span>{" "}
                · classe <strong>{clickedRho.classLabel}</strong> ({clickedRho.classRange})
              </div>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-[var(--muted)]">
              Coluna representativa (est. {interpretation.representative.stationM.toFixed(0)} m)
            </p>
            <PerfilEstratigrafico
              dados={interpretation.representative.layers}
              escalaPxPorM={28}
              larguraPx={220}
            />
            <div className="max-w-xs rounded-lg border border-[var(--border)] p-2 text-xs">
              <p className="font-medium text-[var(--text)]">Faixas ρ aplicadas</p>
              <p className="mt-1 text-[var(--muted)]">
                {formatNormLegend(interpretation.resistivityNorm)}
              </p>
            </div>
            <p className="max-w-xs text-xs leading-relaxed text-[var(--muted)]">
              {interpretation.narrative}
            </p>
            {interpretation.fieldNotes && (
              <p className="max-w-xs text-xs italic text-amber-800 dark:text-amber-200">
                {interpretation.fieldNotes}
              </p>
            )}
            {interpretation.aiConfidence && (
              <p className="text-[10px] text-[var(--muted)]">
                Confiança IA: {interpretation.aiConfidence}
              </p>
            )}
            <div className="mt-2 space-y-1 text-xs">
              <p className="font-medium text-[var(--text)]">Camadas no perfil</p>
              <ul className="list-inside list-disc text-[var(--muted)]">
                {interpretation.layerUnits.map((u) => (
                  <li key={u.id}>
                    <span
                      className="mr-1 inline-block h-2 w-2 rounded-sm align-middle"
                      style={{ background: u.cor }}
                    />
                    {u.material} — ρ̄ {u.meanRhoOhmM.toFixed(0)} Ω·m
                  </li>
                ))}
              </ul>
              {interpretation.contactLines.length > 0 && (
                <>
                  <p className="mt-2 font-medium text-[var(--text)]">Contatos</p>
                  <ul className="list-inside list-disc text-[var(--muted)]">
                    {interpretation.contactLines.map((c, idx) => (
                      <li key={idx}>
                        {c.layerAbove} / {c.layerBelow}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {regional && (
        <details className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
          <summary className="cursor-pointer font-medium text-[var(--text)]">
            Materiais regionais e faixas de ρ (Ω·m)
          </summary>
          <table className="mt-2 w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--muted)]">
                <th className="py-1">Material</th>
                <th>ρ mín</th>
                <th>ρ máx</th>
                <th>Prior</th>
              </tr>
            </thead>
            <tbody>
              {regional.materials.map((m) => (
                <tr key={m.id} className="border-t border-[var(--border)]">
                  <td className="py-1 pr-2">
                    <span
                      className="mr-1 inline-block h-2 w-2 rounded-sm"
                      style={{ background: m.cor }}
                    />
                    {m.nome}
                  </td>
                  <td>{m.rhoMinOhmM}</td>
                  <td>{m.rhoMaxOhmM}</td>
                  <td>{(m.prior * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
