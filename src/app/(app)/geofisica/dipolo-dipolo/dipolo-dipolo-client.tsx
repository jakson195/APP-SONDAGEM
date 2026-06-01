"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  defaultColorScale,
  type ResistivityColorScale,
} from "@/lib/geofisica/dipolo2d/colormap";
import {
  drawModelSection,
  drawPseudoScatter,
  drawResidualSection,
  findNearestPseudoHit,
  formatRhoApparentOhmM,
  type ModelDrawOptions,
  type PseudoHit,
} from "@/lib/geofisica/dipolo2d/dipolo-pseudo-draw";
import { invertDipolo2D } from "@/lib/geofisica/dipolo2d/invert-methods-2d";
import {
  invertDipolo2DPhysics,
  type InvertEngineId,
} from "@/lib/geofisica/dipolo2d/physics-invert-2d";
import { res2dinvDataPreset } from "@/lib/geofisica/dipolo2d/smooth-invert-2d";
import { qcGradesByRowIndex } from "@/lib/geofisica/qc/qc-row-grades";
import { loadSolodataLinha12Demo } from "@/lib/geofisica/dipolo2d/solodata-linha-demo";
import {
  activeReadingsForInversion,
  excludedReadingIndices,
  readingsToSolodataLinha,
  solodataLinhaToReadings,
  toggleReadingExcluded,
} from "@/lib/geofisica/dipolo2d/solodata-linha-readings";
import {
  defaultSolodataLinhaState,
  type SolodataLinhaState,
} from "@/lib/geofisica/dipolo2d/solodata-linha-types";
import {
  parseDipoloImportFile,
  parseRes2dinvDatWithTopography,
  extractTopographyFromImportText,
} from "@/lib/geofisica/dipolo2d/parse-dipolo-import";
import { buildDemoTopography } from "@/lib/geofisica/dipolo2d/parse-topography";
import { applyTopographyToLinha } from "@/lib/geofisica/dipolo2d/topography-from-linha";
import type { TopographyPoint } from "@/lib/geofisica/dipolo2d/topography-types";
import {
  DIPOLO2D_INVERT_METHODS,
  type Dipolo2DInvertMethodId,
  type Dipolo2DInvertParams,
  type Dipolo2DReading,
} from "@/lib/geofisica/dipolo2d/types";
import { res2dinvToSolodataLinha } from "@/lib/geofisica/dipolo2d/parse-res2dinv-dat";
import type {
  GeoSurveyLocation,
  RegionalGeologyProfile,
  SectionGeologicInterpretation,
} from "@/lib/geofisica/dipolo2d/interpret-types";
import { regionalMatchesLocation } from "@/lib/geofisica/dipolo2d/interpret-types";
import { GARUVA_DEFAULT_LOCATION } from "@/lib/geofisica/dipolo2d/regional-geology";
import { downloadTextFile } from "@/lib/field-export-kml-gpx";
import { ColorScalePanel } from "./color-scale-panel";
import { DipoloInterpretPanel } from "./dipolo-interpret-panel";
import {
  cloneClassificationTable,
  type ResistivityRefRow,
} from "@/lib/geofisica/dipolo2d/resistivity-reference-table-br";
import { DipoloInvertCompare } from "./dipolo-invert-compare";
import { DipoloModelExportPanel } from "./dipolo-model-export-panel";
import { DipoloTopographyPanel } from "./dipolo-topography-panel";
import { DipoloReadingsTable } from "./dipolo-readings-table";
import { SolodataLinhaSheet } from "./solodata-linha-sheet";
import { buildSavedSectionFromDipolo } from "@/lib/geofisica/geophys-project/dipolo-to-saved-section";
import { loadGeophysProject } from "@/lib/geofisica/geophys-project/geophys-project-storage";
import {
  GeophysSectionsPanel,
  persistGeophysSection,
  suggestNextGeoCode,
} from "../geophys-sections-panel";

const STORAGE = "datageo-digital-geofisica-dipolo2d-v5";

type TabId = "dados" | "pseudo" | "modelo" | "interpretacao" | "ajustes";

type ModelMaskMode = NonNullable<ModelDrawOptions["maskMode"]>;

const defaultParams: Dipolo2DInvertParams = {
  factorDepth: 0.37,
  sigmaXM: 8,
  sigmaZM: 4,
  lambda: 3.5,
  huberC: 0.03,
  maxIter: 16,
  lambdaDecay: 0.9,
  lambdaMin: 0.35,
  minImprovement: 0.0015,
  nx: 28,
  nz: 16,
  hybridAlpha: 1,
};

const precisionPreset: Dipolo2DInvertParams = res2dinvDataPreset;

const fastPreset: Dipolo2DInvertParams = {
  factorDepth: 0.37,
  sigmaXM: 9,
  sigmaZM: 5,
  lambda: 2.2,
  huberC: 0.04,
  maxIter: 8,
  lambdaDecay: 0.95,
  lambdaMin: 0.4,
  minImprovement: 0.002,
  nx: 20,
  nz: 12,
  hybridAlpha: 1,
};

function HybridAlphaControl({
  value,
  onChange,
  bordered = true,
}: {
  value: number;
  onChange: (alpha: number) => void;
  bordered?: boolean;
}) {
  const alpha = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
  return (
    <fieldset
      className={
        bordered
          ? "rounded-lg border border-[var(--border)] px-3 py-3"
          : "block"
      }
    >
      <legend
        className={`px-1 font-medium text-[var(--text)] ${bordered ? "text-sm" : "mb-1 text-xs"}`}
      >
        Mistura L2 / L1 nos resíduos (α)
      </legend>
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-16 shrink-0 text-xs text-[var(--muted)]">L1</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          className="min-w-[10rem] flex-1"
          value={Math.round(alpha * 100)}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
        />
        <span className="w-16 shrink-0 text-right text-xs text-[var(--muted)]">
          L2
        </span>
        <span className="font-mono text-sm text-[var(--text)]">
          α = {alpha.toFixed(2)}
        </span>
      </div>
      <p className="mt-2 text-xs text-[var(--muted)]">
        Φ<sub>dados</sub> = α·Huber(L2) + (1−α)·|resíduo|. Só afecta o método
        «Híbrida» (pesos IRLS L2+L1). Suavizada permanece L2 puro.
      </p>
    </fieldset>
  );
}

export function DipoloDipoloClient() {
  const [tab, setTab] = useState<TabId>("dados");
  const [linha, setLinha] = useState<SolodataLinhaState>(() =>
    defaultSolodataLinhaState(91),
  );
  const [defaultA, setDefaultA] = useState("15");
  const [params, setParams] = useState<Dipolo2DInvertParams>(defaultParams);
  const [invertMethod, setInvertMethod] =
    useState<Dipolo2DInvertMethodId>("smoothness");
  const [invertEngine, setInvertEngine] = useState<InvertEngineId>("proxy");
  const [physicsResult, setPhysicsResult] = useState<
    import("@/lib/geofisica/dipolo2d/types").Dipolo2DInvertResult | null
  >(null);
  const [physicsBusy, setPhysicsBusy] = useState(false);
  const [physicsError, setPhysicsError] = useState<string | null>(null);

  const selectInvertMethod = useCallback((id: Dipolo2DInvertMethodId) => {
    setInvertMethod(id);
    setParams((p) => {
      if (id === "hybrid" && (p.hybridAlpha ?? 1) >= 0.999) {
        return { ...p, hybridAlpha: 0.65 };
      }
      return p;
    });
  }, []);
  const [colorScale, setColorScale] =
    useState<ResistivityColorScale>(defaultColorScale);
  const [selectedReadingIndex, setSelectedReadingIndex] = useState<number | null>(
    null,
  );
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [surveyLocation, setSurveyLocation] = useState<GeoSurveyLocation | null>(
    () => ({ ...GARUVA_DEFAULT_LOCATION, label: "Garuva" }),
  );
  const [regionalGeology, setRegionalGeology] =
    useState<RegionalGeologyProfile | null>(null);
  const [geologicInterpretation, setGeologicInterpretation] =
    useState<SectionGeologicInterpretation | null>(null);
  const [modelMaskMode, setModelMaskMode] = useState<ModelMaskMode>("full");
  const [modelColorScale, setModelColorScale] =
    useState<ResistivityColorScale>(defaultColorScale);
  const [modelScaleXM, setModelScaleXM] = useState(1);
  const [modelScaleZM, setModelScaleZM] = useState(1);
  const [topography, setTopography] = useState<TopographyPoint[]>([]);
  const [showTopography, setShowTopography] = useState(true);
  const [sectionCode, setSectionCode] = useState("");
  const [sectionNotice, setSectionNotice] = useState<string | null>(null);
  const [sectionsVersion, setSectionsVersion] = useState(0);
  const [classificationTable, setClassificationTable] = useState<
    ResistivityRefRow[]
  >(() => cloneClassificationTable());
  const modelRef = useRef<HTMLCanvasElement>(null);
  const modelWrapRef = useRef<HTMLDivElement>(null);
  const pseudoObsRef = useRef<HTMLCanvasElement>(null);
  const pseudoCalcRef = useRef<HTMLCanvasElement>(null);
  const residualRef = useRef<HTMLCanvasElement>(null);
  const pseudoHitsRef = useRef<PseudoHit[]>([]);
  const pseudoCalcHitsRef = useRef<PseudoHit[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (raw) {
        const j = JSON.parse(raw) as {
          linha?: SolodataLinhaState;
          defaultA?: string;
          params?: Partial<Dipolo2DInvertParams>;
          invertMethod?: Dipolo2DInvertMethodId;
          colorScale?: ResistivityColorScale;
          surveyLocation?: GeoSurveyLocation;
          regionalGeology?: RegionalGeologyProfile;
          modelMaskMode?: ModelMaskMode;
          modelColorScale?: ResistivityColorScale;
          modelScaleXM?: number;
          modelScaleZM?: number;
          topography?: TopographyPoint[];
          showTopography?: boolean;
          classificationTable?: ResistivityRefRow[];
        };
        if (j.linha?.rows?.length) setLinha(j.linha);
        if (j.defaultA) setDefaultA(j.defaultA);
        if (j.params) setParams((p) => ({ ...p, ...j.params }));
        if (
          j.invertMethod &&
          DIPOLO2D_INVERT_METHODS.some((m) => m.id === j.invertMethod)
        ) {
          setInvertMethod(j.invertMethod);
        }
        if (j.colorScale) setColorScale((s) => ({ ...s, ...j.colorScale }));
        if (j.surveyLocation) setSurveyLocation(j.surveyLocation);
        if (
          j.regionalGeology &&
          j.surveyLocation &&
          regionalMatchesLocation(
            j.regionalGeology,
            j.surveyLocation.lat,
            j.surveyLocation.lng,
          )
        ) {
          setRegionalGeology(j.regionalGeology);
        }
        if (j.modelMaskMode === "full" || j.modelMaskMode === "coverage") {
          setModelMaskMode(j.modelMaskMode);
        }
        if (j.modelColorScale) {
          setModelColorScale((s) => ({ ...s, ...j.modelColorScale }));
        }
        if (typeof j.modelScaleXM === "number" && j.modelScaleXM > 0) {
          setModelScaleXM(j.modelScaleXM);
        }
        if (typeof j.modelScaleZM === "number" && j.modelScaleZM > 0) {
          setModelScaleZM(j.modelScaleZM);
        }
        if (Array.isArray(j.topography)) setTopography(j.topography);
        if (typeof j.showTopography === "boolean") {
          setShowTopography(j.showTopography);
        }
        if (j.classificationTable?.length) {
          setClassificationTable(j.classificationTable);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE,
          JSON.stringify({
            linha,
            defaultA,
            params,
            invertMethod,
            colorScale,
            surveyLocation,
            regionalGeology,
            modelMaskMode,
            modelColorScale,
            modelScaleXM,
            modelScaleZM,
            topography,
            showTopography,
            classificationTable,
          }),
        );
      } catch {
        /* ignore */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [
    linha,
    defaultA,
    params,
    invertMethod,
    colorScale,
    surveyLocation,
    regionalGeology,
    modelMaskMode,
    modelColorScale,
    modelScaleXM,
    modelScaleZM,
    topography,
    showTopography,
    classificationTable,
  ]);

  const aNum = useMemo(() => {
    const n = Number(defaultA.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 15;
  }, [defaultA]);

  const readings = useMemo(
    () => solodataLinhaToReadings(linha, aNum),
    [linha, aNum],
  );

  const activeReadings = useMemo(
    () => activeReadingsForInversion(readings),
    [readings],
  );

  const excludedSet = useMemo(
    () => excludedReadingIndices(readings),
    [readings],
  );

  const rhoRange = useMemo(() => {
    const vals = readings
      .filter((r) => !r.excluded)
      .map((r) => r.rhoApparentOhmM);
    if (!vals.length) return { min: 10, max: 1000 };
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [readings]);

  const loadDemo = useCallback(() => {
    const demo = loadSolodataLinha12Demo();
    setDefaultA("15");
    const demoReadings = solodataLinhaToReadings(demo, 15);
    const topo = buildDemoTopography(demoReadings.map((r) => r.stationM));
    setLinha(applyTopographyToLinha(demo, topo));
    setTopography(topo);
    setShowTopography(true);
    setImportNotice(
      "Demo SOLODATA + topografia de exemplo carregadas. Veja na aba Modelo invertido.",
    );
    setTab("modelo");
  }, []);

  const clearAll = useCallback(() => {
    setLinha(defaultSolodataLinhaState(91));
  }, []);

  const importGeophysicsFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const lower = file.name.toLowerCase();
      const bundle = parseDipoloImportFile(text, file.name);
      if (!bundle) {
        const hint = lower.endsWith(".txt")
          ? " Ficheiros .txt RES2DINV (x2ipi) aceites — leituras dist·a·n·ρa e bloco topográfico 1/N."
          : "";
        setImportNotice(
          `Não foi possível ler «${file.name}».${hint} Formatos: RES2DINV (.dat/.txt) ou CSV/TSV com dist, n, ρa.`,
        );
        return;
      }

      const topoFromFile = extractTopographyFromImportText(text);
      const topo =
        topoFromFile.length >= 2
          ? topoFromFile
          : bundle.topography.length >= 2
            ? bundle.topography
            : null;

      if (bundle.readings.length < 4) {
        if (topo) {
          setTopography(topo);
          setShowTopography(true);
          setLinha((prev) => applyTopographyToLinha(prev, topo));
          setImportNotice(
            `Topografia (${topo.length} pontos) importada de «${file.name}» — falta importar leituras ρa (mín. 4).`,
          );
          setTab("modelo");
        } else {
          setImportNotice(
            `«${file.name}»: mínimo 4 leituras válidas (dist, n, ρa). Topografia: bloco 1/N, linha 0 0 0 ou coluna cota.`,
          );
        }
        return;
      }

      const resParsed = parseRes2dinvDatWithTopography(text);

      if (resParsed && resParsed.readings.length >= 4) {
        setLinha((prev) => {
          let next = res2dinvToSolodataLinha(resParsed, prev);
          if (topo) {
            next = applyTopographyToLinha(next, topo);
          }
          return next;
        });
        setDefaultA(String(resParsed.unitSpacingM));
        setParams(res2dinvDataPreset);
        setInvertMethod("smoothness");
        const rhos = resParsed.readings.map((r) => r.rhoApparentOhmM);
        const rhoMin = Math.min(...rhos);
        const rhoMax = Math.max(...rhos);
        setColorScale({
          auto: false,
          rhoMinOhmM: Math.max(1, rhoMin * 0.45),
          rhoMaxOhmM: rhoMax * 1.15,
          palette: "x2ipi",
        });
      } else {
        setLinha((prev) =>
          readingsToSolodataLinha(bundle.readings, prev, topo ?? undefined),
        );
        const firstA = bundle.readings.find((r) => r.aM > 0)?.aM;
        if (firstA) setDefaultA(String(firstA));
      }

      if (topo) {
        setTopography(topo);
        setShowTopography(true);
      } else {
        setTopography([]);
        setShowTopography(false);
      }

      const hasRealTopo = topo != null;
      const topoMsg = hasRealTopo
        ? ` · topografia ${topo.length} pts (${topo[0]!.elevationM.toFixed(1)}–${topo[topo.length - 1]!.elevationM.toFixed(1)} m) na secção`
        : "";
      const title = resParsed?.title ? ` «${resParsed.title}»` : "";
      const warn =
        bundle.warnings.length > 0 ? ` ${bundle.warnings.join(" ")}` : "";
      setImportNotice(
        `Importado${title}: ${bundle.readings.length} leituras${topoMsg} — secção invertida com terreno.${warn}`,
      );
      setTab("modelo");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "erro desconhecido";
      setImportNotice(`Erro ao importar «${file.name}»: ${msg}`);
    }
  }, []);

  const qcByRow = useMemo(
    () => qcGradesByRowIndex(linha, aNum),
    [linha, aNum],
  );

  const proxyInvertResult = useMemo(() => {
    if (activeReadings.length < 4) return null;
    return invertDipolo2D(activeReadings, params, invertMethod, qcByRow);
  }, [activeReadings, params, invertMethod, qcByRow]);

  useEffect(() => {
    if (invertEngine !== "physics" || activeReadings.length < 4) {
      setPhysicsResult(null);
      setPhysicsError(null);
      setPhysicsBusy(false);
      return;
    }
    let cancelled = false;
    setPhysicsBusy(true);
    setPhysicsError(null);
    const qcMap = new Map<
      number,
      { qualityScore: number; isSpike: boolean }
    >();
    qcByRow.forEach((g, rowIdx) => {
      qcMap.set(rowIdx, {
        qualityScore: g.qualityScore,
        isSpike: g.isSpike,
      });
    });
    invertDipolo2DPhysics(
      readings,
      params,
      invertMethod,
      topography,
      qcMap,
    )
      .then((r) => {
        if (!cancelled) setPhysicsResult(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setPhysicsResult(null);
          setPhysicsError(
            e instanceof Error ? e.message : "Erro na inversão FDM",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setPhysicsBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    invertEngine,
    activeReadings.length,
    readings,
    params,
    invertMethod,
    topography,
    qcByRow,
  ]);

  const invertResult =
    invertEngine === "physics" ? physicsResult : proxyInvertResult;

  useEffect(() => {
    const project = loadGeophysProject();
    setSectionCode(suggestNextGeoCode(project.sections));
  }, [invertResult, tab]);

  const saveSectionToProject = useCallback(() => {
    if (!invertResult) return;
    const project = loadGeophysProject();
    const code =
      sectionCode.trim().toUpperCase() ||
      suggestNextGeoCode(project.sections);
    const section = buildSavedSectionFromDipolo({
      linha,
      defaultAM: aNum,
      params,
      invertMethod,
      invertResult,
      surveyLocation,
      topography,
      code,
      lineIndex: project.sections.length,
      existingSections: project.sections,
    });
    persistGeophysSection(section);
    setSectionsVersion((v) => v + 1);
    setSectionCode(suggestNextGeoCode([...project.sections, section]));
    setSectionNotice(
      `${section.code} guardada (${section.readings.length} leituras, modelo ${invertResult.methodLabel}).`,
    );
  }, [
    invertResult,
    sectionCode,
    linha,
    aNum,
    params,
    invertMethod,
    surveyLocation,
    topography,
  ]);

  const modelRhoRange = useMemo(() => {
    if (!invertResult) return { min: 10, max: 1000 };
    const vals: number[] = [];
    for (let k = 0; k < invertResult.mLog10.length; k++) {
      vals.push(10 ** invertResult.mLog10[k]!);
    }
    if (!vals.length) return { min: 10, max: 1000 };
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [invertResult]);

  const toggleExcludedAt = useCallback(
    (index: number, excluded: boolean) => {
      const r = readings[index];
      if (!r) return;
      setLinha((prev) => toggleReadingExcluded(prev, r, excluded));
      if (excluded && selectedReadingIndex === index) {
        setSelectedReadingIndex(null);
      }
    },
    [readings, selectedReadingIndex],
  );

  const editReadingRho = useCallback(
    (index: number, rho: number | null) => {
      const r = readings[index];
      if (r?.sourceRowIndex == null) return;
      setLinha((prev) => ({
        ...prev,
        rows: prev.rows.map((row, i) =>
          i === r.sourceRowIndex ? { ...row, rap: rho } : row,
        ),
      }));
    },
    [readings],
  );

  const redrawCanvases = useCallback(() => {
    const excluded = excludedSet;
    if (pseudoObsRef.current && readings.length > 0) {
      pseudoHitsRef.current = drawPseudoScatter(
        pseudoObsRef.current,
        readings,
        {
          factorDepth: params.factorDepth,
          excludedIndices: excluded,
          selectedIndex: selectedReadingIndex,
          colorScale,
          title: "ρa observada — clique no ponto para ver ρa",
        },
      );
    }
    if (pseudoCalcRef.current && readings.length > 0 && invertResult) {
      const synFull: number[] = [];
      let ai = 0;
      for (let i = 0; i < readings.length; i++) {
        if (readings[i]!.excluded) {
          synFull.push(readings[i]!.rhoApparentOhmM);
        } else {
          synFull.push(10 ** invertResult.ySynLog10[ai]!);
          ai++;
        }
      }
      pseudoCalcHitsRef.current = drawPseudoScatter(pseudoCalcRef.current, readings, {
        factorDepth: params.factorDepth,
        apparentOverride: synFull,
        excludedIndices: excluded,
        selectedIndex: selectedReadingIndex,
        colorScale,
        title: "ρa calculada (inversão)",
      });
    }
    if (modelRef.current && invertResult) {
      const containerWidthPx =
        modelWrapRef.current?.clientWidth ??
        modelRef.current.parentElement?.clientWidth ??
        800;
      drawModelSection(
        modelRef.current,
        invertResult.mLog10,
        invertResult.nx,
        invertResult.nz,
        invertResult.xEdgesM,
        invertResult.zEdgesM,
        modelColorScale,
        {
          readings: activeReadings,
          factorDepth: params.factorDepth,
          iterations: invertResult.iterations,
          rmsLog10: invertResult.rmsLog10,
          methodLabel: invertResult.methodLabel,
          maskMode: modelMaskMode,
          scaleXM: modelScaleXM,
          scaleZM: modelScaleZM,
          containerWidthPx,
          topography,
          showTopography: showTopography && topography.length >= 2,
        },
      );
    }
    if (residualRef.current && readings.length > 0 && invertResult) {
      const residualsFull: number[] = [];
      let ai = 0;
      for (let i = 0; i < readings.length; i++) {
        if (readings[i]!.excluded) residualsFull.push(0);
        else {
          residualsFull.push(
            invertResult.yObsLog10[ai]! - invertResult.ySynLog10[ai]!,
          );
          ai++;
        }
      }
      drawResidualSection(
        residualRef.current,
        readings,
        params.factorDepth,
        residualsFull,
        excluded,
      );
    }
  }, [
    readings,
    excludedSet,
    selectedReadingIndex,
    colorScale,
    params.factorDepth,
    invertResult,
    activeReadings,
    modelColorScale,
    modelMaskMode,
    modelScaleXM,
    modelScaleZM,
    topography,
    showTopography,
  ]);

  useEffect(() => {
    const id = requestAnimationFrame(() => redrawCanvases());
    return () => cancelAnimationFrame(id);
  }, [tab, redrawCanvases]);

  useEffect(() => {
    const wrap = modelWrapRef.current;
    if (!wrap || tab !== "modelo") return;
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => redrawCanvases());
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [tab, redrawCanvases]);

  useEffect(() => {
    window.addEventListener("resize", redrawCanvases);
    return () => window.removeEventListener("resize", redrawCanvases);
  }, [redrawCanvases]);

  const selectedPointInfo = useMemo(() => {
    if (selectedReadingIndex == null) return null;
    const r = readings[selectedReadingIndex];
    if (!r) return null;
    const psZ = params.factorDepth * r.n * r.aM;
    let rhoCalc: number | null = null;
    if (invertResult && !r.excluded) {
      let ai = 0;
      for (let i = 0; i < readings.length; i++) {
        if (readings[i]!.excluded) continue;
        if (i === selectedReadingIndex) {
          rhoCalc = 10 ** invertResult.ySynLog10[ai]!;
          break;
        }
        ai++;
      }
    }
    return { r, psZ, rhoCalc };
  }, [selectedReadingIndex, readings, params.factorDepth, invertResult]);

  const pickPseudoReading = useCallback(
    (canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const hits =
        canvas === pseudoCalcRef.current
          ? pseudoCalcHitsRef.current
          : pseudoHitsRef.current;
      return findNearestPseudoHit(hits, x, y);
    },
    [],
  );

  const onPseudoObsClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const idx = pickPseudoReading(e.currentTarget, e.clientX, e.clientY);
    if (idx != null) setSelectedReadingIndex(idx);
  };

  const onPseudoObsDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const idx = pickPseudoReading(e.currentTarget, e.clientX, e.clientY);
    if (idx == null) return;
    const r = readings[idx];
    toggleExcludedAt(idx, !r?.excluded);
  };

  const exportTsv = () => {
    const lines = ["station_m\ta_m\tn\trhoa_ohm_m"];
    for (const r of readings) {
      lines.push(`${r.stationM}\t${r.aM}\t${r.n}\t${r.rhoApparentOhmM}`);
    }
    downloadTextFile(
      `dipolo-dipolo-2d-${Date.now()}.tsv`,
      lines.join("\n"),
      "text/tab-separated-values;charset=utf-8",
    );
  };

  const tabBtn = (id: TabId, label: string) => (
    <button
      type="button"
      key={id}
      onClick={() => setTab(id)}
      className={
        tab === id
          ? "border-b-2 border-teal-600 px-3 py-2 text-sm font-medium text-teal-800 dark:text-teal-300"
          : "border-b-2 border-transparent px-3 py-2 text-sm text-[var(--muted)] hover:text-[var(--text)]"
      }
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-[min(100%,96rem)] space-y-4 p-4 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link
            href="/geofisica"
            className="text-sm text-teal-700 hover:underline dark:text-teal-400"
          >
            ← Geofísica
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-[var(--text)]">
            Dipolo-Dipolo 2D — estilo x2ipi
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
            Edite ρa na tabela, exclua ruído (duplo-clique na pseudoseção ou coluna
            Ruído), ajuste a escala de cor e inverta como no RES2DINV/x2ipi.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setParams(precisionPreset)}
            className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700"
          >
            Preset RES2DINV (.dat)
          </button>
          <button
            type="button"
            onClick={() => setParams(fastPreset)}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--muted)]/10"
          >
            Modo rápido
          </button>
        </div>
      </div>

      <div className="flex flex-wrap border-b border-[var(--border)]">
        {tabBtn("dados", "Dados")}
        {tabBtn("pseudo", "Pseudoseção ρa")}
        {tabBtn("modelo", "Modelo invertido")}
        {tabBtn("interpretacao", "Interpretação geológica")}
        {tabBtn("ajustes", "Parâmetros")}
      </div>

      {tab === "dados" && (
        <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--muted)]">
                <em>a</em> (m) por defeito — coluna Esp vazia
              </label>
              <input
                type="text"
                inputMode="decimal"
                className="mt-1 w-32 rounded border border-[var(--border)] bg-white px-2 py-2 text-sm dark:bg-gray-900"
                value={defaultA}
                onChange={(e) => setDefaultA(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadDemo}
              className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700"
            >
              Carregar PLANILHA SOLODATA (91 leituras)
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              Limpar
            </button>
            {readings.length > 0 && (
              <button
                type="button"
                onClick={exportTsv}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--muted)]/10"
              >
                Exportar TSV
              </button>
            )}
            <label className="cursor-pointer rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--muted)]/10">
              Importar CSV/TSV (ρa + topografia)
              <input
                type="file"
                accept=".csv,.tsv,.txt"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  await importGeophysicsFile(file);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            <label className="cursor-pointer rounded-lg border border-teal-600/40 bg-teal-600/10 px-3 py-2 text-sm font-medium text-teal-900 hover:bg-teal-600/20 dark:text-teal-200">
              Importar RES2DINV (.dat / .txt + topo)
              <input
                type="file"
                accept=".dat,.txt,.DAT,.TXT"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  await importGeophysicsFile(file);
                  e.currentTarget.value = "";
                }}
              />
            </label>
          </div>
          {importNotice && (
            <p className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900 dark:border-teal-900/50 dark:bg-teal-950/40 dark:text-teal-100">
              {importNotice}
            </p>
          )}
          <SolodataLinhaSheet
            state={linha}
            onChange={setLinha}
            defaultAM={aNum}
          />
          <p className="text-sm text-[var(--muted)]">
            Leituras: <strong>{readings.length}</strong> total,{" "}
            <strong>{activeReadings.length}</strong> ativas,{" "}
            <strong>{readings.length - activeReadings.length}</strong> excluídas
            {activeReadings.length > 0 && (
              <span className="ml-2">
                (Dist {Math.min(...activeReadings.map((r) => r.stationM))}–
                {Math.max(...activeReadings.map((r) => r.stationM))} m)
              </span>
            )}
          </p>
          <GeophysSectionsPanel
            onNotice={setSectionNotice}
            refreshKey={sectionsVersion}
            showQcActions
          />
        </div>
      )}

      {tab === "pseudo" && (
        <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
            <ColorScalePanel
              scale={colorScale}
              onChange={setColorScale}
              suggestedMin={rhoRange.min}
              suggestedMax={rhoRange.max}
            />
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={selectedReadingIndex == null}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 enabled:hover:bg-red-50 disabled:opacity-40 dark:border-red-900/50 dark:text-red-400"
                  onClick={() => {
                    if (selectedReadingIndex == null) return;
                    toggleExcludedAt(selectedReadingIndex, true);
                  }}
                >
                  Excluir ponto (ruído)
                </button>
                <button
                  type="button"
                  disabled={selectedReadingIndex == null}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--muted)]/10 disabled:opacity-40"
                  onClick={() => {
                    if (selectedReadingIndex == null) return;
                    toggleExcludedAt(selectedReadingIndex, false);
                  }}
                >
                  Restaurar ponto
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--muted)]/10"
                  onClick={() => {
                    setLinha((prev) => ({
                      ...prev,
                      rows: prev.rows.map((row) => ({ ...row, excluded: false })),
                    }));
                  }}
                >
                  Restaurar todos
                </button>
              </div>
              <p className="text-xs text-[var(--muted)]">
                Clique num ponto para ver ρa · duplo-clique para
                excluir/restaurar · Ps.Z = fator×n×a
              </p>
              {selectedPointInfo && (
                <div className="rounded-lg border border-amber-400/70 bg-amber-50/90 px-3 py-2 text-sm text-[var(--text)] dark:border-amber-600/50 dark:bg-amber-950/40">
                  <span className="font-semibold">
                    Ponto {(selectedReadingIndex ?? 0) + 1}
                  </span>
                  {selectedPointInfo.r.excluded && (
                    <span className="ml-2 text-xs text-[var(--muted)]">
                      (excluído)
                    </span>
                  )}
                  <span className="mt-1 block text-xs text-[var(--muted)] sm:mt-0 sm:inline sm:ml-2">
                    Estação {selectedPointInfo.r.stationM} m · a=
                    {selectedPointInfo.r.aM} m · n={selectedPointInfo.r.n} ·
                    Ps.Z {selectedPointInfo.psZ.toFixed(2)} m
                  </span>
                  <span className="mt-1 block sm:mt-0 sm:inline sm:ml-3">
                    <strong className="text-amber-900 dark:text-amber-200">
                      ρa obs ={" "}
                      {formatRhoApparentOhmM(
                        selectedPointInfo.r.rhoApparentOhmM,
                      )}{" "}
                      Ω·m
                    </strong>
                    {selectedPointInfo.rhoCalc != null && (
                      <span className="ml-3 text-[var(--muted)]">
                        ρa calc ={" "}
                        {formatRhoApparentOhmM(selectedPointInfo.rhoCalc)} Ω·m
                      </span>
                    )}
                  </span>
                </div>
              )}
              <DipoloReadingsTable
                readings={readings}
                factorDepth={params.factorDepth}
                selectedIndex={selectedReadingIndex}
                onSelect={setSelectedReadingIndex}
                onToggleExcluded={toggleExcludedAt}
                onEditRho={editReadingRho}
              />
            </div>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            <div>
              <canvas
                ref={pseudoObsRef}
                className="w-full cursor-crosshair rounded-lg border border-[var(--border)]"
                onClick={onPseudoObsClick}
                onDoubleClick={onPseudoObsDoubleClick}
              />
            </div>
            <div>
              <canvas
                ref={pseudoCalcRef}
                className="w-full cursor-crosshair rounded-lg border border-[var(--border)]"
                onClick={onPseudoObsClick}
                onDoubleClick={onPseudoObsDoubleClick}
              />
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-[var(--muted)]">
              Resíduos (apenas pontos ativos)
            </p>
            <canvas
              ref={residualRef}
              className="w-full rounded-lg border border-[var(--border)]"
            />
          </div>
        </div>
      )}

      {tab === "modelo" && (
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-[var(--text)]">
              Motor de inversão
            </legend>
            <div className="flex flex-wrap gap-3 text-sm">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2">
                <input
                  type="radio"
                  name="invert-engine"
                  checked={invertEngine === "proxy"}
                  onChange={() => setInvertEngine("proxy")}
                />
                <span>
                  <strong>Rápido (proxy)</strong>
                  <span className="block text-xs text-[var(--muted)]">
                    Sensibilidade gaussiana — preview instantâneo
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2">
                <input
                  type="radio"
                  name="invert-engine"
                  checked={invertEngine === "physics"}
                  onChange={() => setInvertEngine("physics")}
                />
                <span>
                  <strong>Físico (FDM)</strong>
                  <span className="block text-xs text-[var(--muted)]">
                    Poisson 2D + Jacobiana + Gauss-Newton/Occam/L1/L2 + QC
                  </span>
                </span>
              </label>
            </div>
            {invertEngine === "physics" && physicsBusy && (
              <p className="mt-2 text-xs text-teal-700 dark:text-teal-300">
                A calcular inversão FDM (motor Python :8092)…
              </p>
            )}
            {physicsError && (
              <p className="mt-2 text-xs text-red-700 dark:text-red-300">
                {physicsError}
              </p>
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-[var(--text)]">
              Método de inversão
            </legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {DIPOLO2D_INVERT_METHODS.map((m) => (
                <label
                  key={m.id}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    invertMethod === m.id
                      ? "border-teal-600 bg-teal-600/10"
                      : "border-[var(--border)] hover:bg-[var(--muted)]/10"
                  }`}
                >
                  <input
                    type="radio"
                    name="invert-method"
                    className="mt-1"
                    checked={invertMethod === m.id}
                    onChange={() => selectInvertMethod(m.id)}
                  />
                  <span>
                    <span className="font-medium text-[var(--text)]">
                      {m.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--muted)]">
                      {m.id === "least_squares" &&
                        "Solução única L2 + regularização λ."}
                      {m.id === "occam" &&
                        "λ alto → reduz até ajuste alvo (estilo Occam)."}
                      {m.id === "gauss_newton" &&
                        "Passos iterativos na matriz normal + busca em linha."}
                      {m.id === "smoothness" &&
                        "IRLS Huber + decaimento λ (preset RES2DINV)."}
                      {m.id === "robust_l1" &&
                        "IRLS com norma L1 nos resíduos (outliers)."}
                      {m.id === "hybrid" &&
                        "IRLS Huber+L1 misturados; α controla L2 vs robustez."}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {invertMethod === "hybrid" && (
            <HybridAlphaControl
              value={params.hybridAlpha ?? 0.65}
              onChange={(hybridAlpha) =>
                setParams((p) => ({ ...p, hybridAlpha }))
              }
            />
          )}

          {activeReadings.length >= 4 && (
            <DipoloInvertCompare
              activeReadings={activeReadings}
              params={params}
              colorScale={modelColorScale}
              maskMode={modelMaskMode}
              selectedMethod={invertMethod}
              onSelectMethod={selectInvertMethod}
            />
          )}

          {!invertResult && (
            <p className="text-sm text-[var(--muted)]">
              Precisa de pelo menos 4 leituras <strong>ativas</strong> (não
              excluídas) na aba Pseudoseção/Dados.
            </p>
          )}
          {invertResult && (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <p className="max-w-prose text-xs text-[var(--muted)]">
                  {invertEngine === "physics" ? (
                    <>
                      {invertResult.methodLabel} — FDM Poisson 2D, Jacobiana por
                      diferenças finitas, regularização L1/L2 e pesos QC.
                      {invertResult.physicsMessage
                        ? ` ${invertResult.physicsMessage}`
                        : ""}
                    </>
                  ) : (
                    <>
                      {invertResult.methodLabel} — preview rápido com matriz de
                      sensibilidade gaussiana (não é RES2DINV). Interpolação
                      bilinear + paleta P8–P92.
                    </>
                  )}
                </p>
                <fieldset className="shrink-0 text-xs">
                  <legend className="mb-1 font-medium text-[var(--text)]">
                    Área exibida
                  </legend>
                  <div className="flex rounded-lg border border-[var(--border)] p-0.5">
                    <button
                      type="button"
                      onClick={() => setModelMaskMode("full")}
                      className={`rounded-md px-2.5 py-1 ${
                        modelMaskMode === "full"
                          ? "bg-teal-600 text-white"
                          : "text-[var(--muted)] hover:bg-[var(--muted)]/10"
                      }`}
                    >
                      Malha completa
                    </button>
                    <button
                      type="button"
                      onClick={() => setModelMaskMode("coverage")}
                      className={`rounded-md px-2.5 py-1 ${
                        modelMaskMode === "coverage"
                          ? "bg-teal-600 text-white"
                          : "text-[var(--muted)] hover:bg-[var(--muted)]/10"
                      }`}
                    >
                      Trapézio (cobertura)
                    </button>
                  </div>
                </fieldset>
              </div>
              <p className="text-[11px] text-[var(--muted)]">
                {modelMaskMode === "full"
                  ? "Toda a malha invertida — sem faixas brancas entre estações."
                  : "Limita a profundidade pela cobertura das leituras (trapézio), com interpolação suave entre colunas."}
              </p>

              <DipoloTopographyPanel
                topography={topography}
                onChange={setTopography}
                showTopography={showTopography}
                onShowTopographyChange={setShowTopography}
                readings={readings}
              />

              {showTopography && topography.length >= 2 ? (
                <p className="rounded border border-green-600/30 bg-green-600/10 px-2 py-1 text-xs text-green-900 dark:text-green-200">
                  Topografia ativa: {topography.length} pontos no perfil.
                </p>
              ) : (
                <p className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-950 dark:text-amber-200">
                  Sem topografia no gráfico — importe/cole dados abaixo ou use
                  «Carregar PLANILHA SOLODATA» na aba Dados (inclui topo de
                  exemplo).
                </p>
              )}

              <div
                ref={modelWrapRef}
                className="flex w-full justify-center overflow-x-hidden overflow-y-auto rounded-lg border border-[var(--border)] bg-white dark:bg-gray-950"
                style={{ minHeight: "min(480px, 55vh)" }}
              >
                <canvas ref={modelRef} className="block w-full max-w-full" />
              </div>
              <DipoloModelExportPanel
                invertResult={invertResult}
                activeReadings={activeReadings}
                factorDepth={params.factorDepth}
                maskMode={modelMaskMode}
                colorScale={modelColorScale}
                onColorScaleChange={setModelColorScale}
                scaleXM={modelScaleXM}
                scaleZM={modelScaleZM}
                onScaleXMChange={setModelScaleXM}
                onScaleZMChange={setModelScaleZM}
                suggestedRhoMin={modelRhoRange.min}
                suggestedRhoMax={modelRhoRange.max}
                topography={topography}
                showTopography={showTopography}
              />
              <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-6">
                <div className="col-span-2 sm:col-span-6">
                  <dt className="text-[var(--muted)]">Método</dt>
                  <dd className="font-medium">
                    {invertResult.methodLabel}
                    <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                      ({invertResult.engine === "physics" ? "FDM" : "proxy"})
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">RMS log₁₀ ρ</dt>
                  <dd className="font-mono">{invertResult.rmsLog10.toFixed(4)}</dd>
                </div>
                {invertResult.rmsPercent != null && (
                  <div>
                    <dt className="text-[var(--muted)]">RMS relativo</dt>
                    <dd className="font-mono">
                      {invertResult.rmsPercent.toFixed(2)}%
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-[var(--muted)]">Rugosidade L2</dt>
                  <dd className="font-mono">
                    {invertResult.roughnessL2.toFixed(4)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Iterações</dt>
                  <dd className="font-mono">{invertResult.iterations}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Malha</dt>
                  <dd className="font-mono">
                    {invertResult.nx}×{invertResult.nz}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 space-y-3 rounded-lg border border-teal-600/30 bg-teal-50/50 p-4 dark:bg-teal-950/20">
                <h3 className="text-sm font-semibold text-[var(--text)]">
                  Guardar secção no projeto
                </h3>
                <p className="text-xs text-[var(--muted)]">
                  Grava leituras, topografia, parâmetros, posição e o{" "}
                  <strong>modelo invertido</strong> (GEO01, GEO02…) para
                  interpolar no{" "}
                  <Link
                    href="/geofisica/volume-3d"
                    className="text-teal-700 underline dark:text-teal-400"
                  >
                    Modelo 3D
                  </Link>
                  .
                </p>
                {sectionNotice && (
                  <p className="text-xs text-teal-800 dark:text-teal-200">
                    {sectionNotice}
                  </p>
                )}
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs text-[var(--muted)]">
                    Código
                    <input
                      type="text"
                      value={sectionCode}
                      onChange={(e) => setSectionCode(e.target.value.toUpperCase())}
                      placeholder="GEO01"
                      className="mt-1 block w-28 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 font-mono text-sm uppercase"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={saveSectionToProject}
                    className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
                  >
                    Guardar secção no projeto
                  </button>
                </div>
              </div>

              <GeophysSectionsPanel
                className="mt-4"
                onNotice={setSectionNotice}
                refreshKey={sectionsVersion}
                showQcActions
              />
            </>
          )}
        </div>
      )}

      {tab === "interpretacao" && (
        <DipoloInterpretPanel
          invertResult={invertResult}
          params={params}
          activeReadings={activeReadings}
          location={surveyLocation}
          onLocationChange={setSurveyLocation}
          regional={regionalGeology}
          onRegionalChange={setRegionalGeology}
          interpretation={geologicInterpretation}
          onInterpretationChange={setGeologicInterpretation}
          classificationTable={classificationTable}
          onClassificationTableChange={setClassificationTable}
        />
      )}

      {tab === "ajustes" && (
        <div className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-2">
          {(
            [
              ["factorDepth", "Fator prof. pseudo z = f·n·a", 0.05, 0.8, 0.01],
              ["sigmaXM", "σx sensibilidade (m)", 1, 80, 1],
              ["sigmaZM", "σz sensibilidade (m)", 1, 60, 1],
              ["lambda", "λ regularização", 0.1, 50, 0.1],
              ["huberC", "Huber c (log₁₀ ρ)", 0.001, 0.2, 0.001],
              ["maxIter", "Iterações IRLS", 1, 40, 1],
              ["lambdaDecay", "Decaimento λ/iter", 0.5, 0.99, 0.01],
              ["lambdaMin", "λ mínimo", 0.05, 5, 0.05],
              ["minImprovement", "Ganho mínimo relativo", 0.0001, 0.02, 0.0001],
              ["nx", "Células X", 8, 48, 1],
              ["nz", "Células Z", 6, 32, 1],
            ] as const
          ).map(([key, label, min, max, step]) => (
            <label key={key} className="block text-sm">
              <span className="text-[var(--muted)]">{label}</span>
              <input
                type="number"
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1"
                min={min}
                max={max}
                step={step}
                value={params[key]}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v)) return;
                  setParams((p) => ({ ...p, [key]: v }));
                }}
              />
            </label>
          ))}
          {invertMethod === "hybrid" && (
            <div className="sm:col-span-2">
              <HybridAlphaControl
                value={params.hybridAlpha ?? 0.65}
                onChange={(hybridAlpha) =>
                  setParams((p) => ({ ...p, hybridAlpha }))
                }
                bordered={false}
              />
            </div>
          )}
          <p className="sm:col-span-2 text-xs text-[var(--muted)]">
            Aumente λ para um modelo mais suave; diminua σx/σz para sensibilidade
            mais localizada. Huber reduz o peso de outliers em log₁₀(ρa).
          </p>
        </div>
      )}
    </div>
  );
}
