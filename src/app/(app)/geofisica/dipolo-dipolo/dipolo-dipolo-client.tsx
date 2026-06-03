"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGeofisicaObra } from "@/hooks/use-geofisica-obra";
import {
  defaultColorScale,
  type ResistivityColorScale,
} from "@/lib/geofisica/dipolo2d/colormap";
import {
  drawModelCanvasMessage,
  drawModelSection,
  drawPseudoScatter,
  drawResidualSection,
  findNearestPseudoHit,
  formatRhoApparentOhmM,
  type ModelDrawOptions,
  type ModelLogContrast,
  type PseudoHit,
} from "@/lib/geofisica/dipolo2d/dipolo-pseudo-draw";
import type { ModelRenderMode } from "@/lib/geofisica/dipolo2d/model-section-render";
import {
  computeRelativeRmsPercent,
  modelStatsFromLog10,
  rhoPercentileBounds,
  type ModelDisplayScale,
} from "@/lib/geofisica/dipolo2d/model-visual-scale";
import { invertDipolo2D } from "@/lib/geofisica/dipolo2d/invert-methods-2d";
import {
  checkPhysicsEngineOnline,
  invertDipolo2DPhysics,
  type InvertEngineId,
  type PhysicsForwardModelId,
} from "@/lib/geofisica/dipolo2d/physics-invert-2d";
import {
  HORIZONTAL_LAYERS_INVERT_PARAMS,
  RES2DINV_COLOR_LEVELS,
  RES2DINV_DEFAULT_METHOD,
  RES2DINV_DISPLAY_SMOOTH_PASSES,
  RES2DINV_FIXED_COLOR_SCALE,
  RES2DINV_FORWARD_MODEL,
  RES2DINV_INVERSION_NOTICE,
  RES2DINV_INVERT_PARAMS,
  RES2DINV_LOG_CONTRAST,
  RES2DINV_PREFER_PHYSICS_ENGINE,
  RES2DINV_RENDER_MODE,
} from "@/lib/geofisica/dipolo2d/res2dinv-preset";
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
  type Dipolo2DInvertResult,
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
import { buildSyntheticInvertResult } from "@/lib/geofisica/dipolo2d/synthetic-invert-model";
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

const defaultParams: Dipolo2DInvertParams = { ...RES2DINV_INVERT_PARAMS };

const precisionPreset: Dipolo2DInvertParams = res2dinvDataPreset;

const fastPreset: Dipolo2DInvertParams = {
  ...RES2DINV_INVERT_PARAMS,
  nx: 22,
  nz: 14,
  maxIter: 10,
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
  const router = useRouter();
  const pathname = usePathname() ?? "/geofisica/dipolo-dipolo";
  const {
    obras,
    obrasLoading,
    obrasError,
    selectedObraId,
    obraNome,
    selectObra,
  } = useGeofisicaObra();
  const [tab, setTab] = useState<TabId>("dados");
  const [linha, setLinha] = useState<SolodataLinhaState>(() =>
    defaultSolodataLinhaState(91),
  );
  const [defaultA, setDefaultA] = useState("15");
  const [params, setParams] = useState<Dipolo2DInvertParams>(defaultParams);
  const [invertMethod, setInvertMethod] =
    useState<Dipolo2DInvertMethodId>(RES2DINV_DEFAULT_METHOD);
  const [invertEngine, setInvertEngine] = useState<InvertEngineId>(
    RES2DINV_PREFER_PHYSICS_ENGINE ? "physics" : "proxy",
  );
  const [physicsForwardModel, setPhysicsForwardModel] =
    useState<PhysicsForwardModelId>("fdm");
  const [physicsResult, setPhysicsResult] = useState<
    import("@/lib/geofisica/dipolo2d/types").Dipolo2DInvertResult | null
  >(null);
  const [physicsBusy, setPhysicsBusy] = useState(false);
  const [physicsError, setPhysicsError] = useState<string | null>(null);
  /** null = a verificar; true = :8092 online → motor físico por defeito. */
  const [physicsEngineOnline, setPhysicsEngineOnline] = useState<boolean | null>(
    null,
  );
  const [physicsCheckError, setPhysicsCheckError] = useState<string | null>(
    null,
  );
  /** Só quando o motor físico está online: permite preview proxy. */
  const [proxyOverride, setProxyOverride] = useState(false);

  const selectInvertMethod = useCallback(
    (id: Dipolo2DInvertMethodId) => {
      if (invertEngine === "proxy" && id === "least_squares") {
        setImportNotice(
          "«Mínimos quadrados (proxy)» apenas projecta a ρa aparente na malha (parecido com x2ipi). Use motor Físico + Robusta L1 para inversão real.",
        );
        return;
      }
      setInvertMethod(id);
      setParams((p) => {
        if (id === "hybrid" && (p.hybridAlpha ?? 1) >= 0.999) {
          return { ...p, hybridAlpha: 0.65 };
        }
        return p;
      });
    },
    [invertEngine],
  );

  /** Força novo cálculo FDM mesmo que parâmetros não mudem. */
  const [physicsInvertNonce, setPhysicsInvertNonce] = useState(0);

  const applyRes2dinvPreset = useCallback(() => {
    setParams({ ...res2dinvDataPreset });
    selectInvertMethod(RES2DINV_DEFAULT_METHOD);
    setInvertEngine(RES2DINV_PREFER_PHYSICS_ENGINE ? "physics" : "proxy");
    setPhysicsForwardModel("fdm");
    setModelRenderMode(RES2DINV_RENDER_MODE);
    setModelDisplaySmoothPasses(RES2DINV_DISPLAY_SMOOTH_PASSES);
    setModelMaskMode("full");
    setModelLogContrast(RES2DINV_LOG_CONTRAST);
    setModelColorScale({ ...RES2DINV_FIXED_COLOR_SCALE });
    setProxyOverride(false);
    setShowTopography(true);
  }, [selectInvertMethod]);

  /** λ_z alto + interpolação só em x (contactos horizontais na visualização). */
  const applyHorizontalLayersStyle = useCallback(() => {
    setParams({ ...HORIZONTAL_LAYERS_INVERT_PARAMS });
    selectInvertMethod(RES2DINV_DEFAULT_METHOD);
    setInvertEngine(RES2DINV_PREFER_PHYSICS_ENGINE ? "physics" : "proxy");
    setPhysicsForwardModel("fdm");
    setModelRenderMode(RES2DINV_RENDER_MODE);
    setModelDisplaySmoothPasses(RES2DINV_DISPLAY_SMOOTH_PASSES);
    setModelMaskMode("coverage");
    setModelLogContrast("auto");
    setModelColorScale({
      auto: true,
      rhoMinOhmM: null,
      rhoMaxOhmM: null,
      palette: "x2ipi",
    });
    setProxyOverride(false);
    setImportNotice(
      "Camadas horizontais: λ_z alto, FDM (rápido). FEM só se precisar — pode demorar >10 min.",
    );
  }, [selectInvertMethod]);

  const recheckPhysicsEngine = useCallback(() => {
    setPhysicsEngineOnline(null);
    setPhysicsCheckError(null);
    checkPhysicsEngineOnline().then((status) => {
      setPhysicsEngineOnline(status.online);
      setPhysicsCheckError(status.error ?? null);
      if (status.online) {
        setInvertEngine("physics");
        setProxyOverride(false);
        setInvertMethod((m) =>
          m === "least_squares" ? RES2DINV_DEFAULT_METHOD : m,
        );
        setImportNotice(
          "Motor Python online (:8092). Inversão requer também npm run dev no outro terminal.",
        );
      } else {
        setImportNotice(
          status.error ??
            "Motor Python offline. Veja os comandos abaixo e clique Verificar de novo.",
        );
      }
    });
  }, []);

  useEffect(() => {
    recheckPhysicsEngine();
  }, [recheckPhysicsEngine]);

  useEffect(() => {
    if (invertEngine === "physics" && invertMethod === "least_squares") {
      selectInvertMethod(RES2DINV_DEFAULT_METHOD);
      setImportNotice(
        "Mínimos quadrados no motor físico usa só 1 iteração. Método alterado para Robusta L1 (inversão iterativa).",
      );
    }
  }, [invertEngine, invertMethod, selectInvertMethod]);
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
  const [modelMaskMode, setModelMaskMode] = useState<ModelMaskMode>("coverage");
  /** 0 = sem blur na imagem (mais próximo RES2DINV). */
  const [modelDisplaySmoothPasses, setModelDisplaySmoothPasses] = useState(
    RES2DINV_DISPLAY_SMOOTH_PASSES,
  );
  const [modelRenderMode, setModelRenderMode] =
    useState<ModelRenderMode>(RES2DINV_RENDER_MODE);
  const [modelLogContrast, setModelLogContrast] =
    useState<ModelLogContrast>(RES2DINV_LOG_CONTRAST);
  const [modelDisplayScale, setModelDisplayScale] =
    useState<ModelDisplayScale>("log");
  const [modelColorScale, setModelColorScale] =
    useState<ResistivityColorScale>({
      ...defaultColorScale,
      auto: true,
      palette: "x2ipi",
    });
  const [modelScaleXM, setModelScaleXM] = useState(1);
  const [modelScaleZM, setModelScaleZM] = useState(1);
  const [modelRenderError, setModelRenderError] = useState<string | null>(null);
  const [syntheticDemoResult, setSyntheticDemoResult] =
    useState<Dipolo2DInvertResult | null>(null);
  const [modelSectionTitle, setModelSectionTitle] = useState<string | null>(
    null,
  );
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
          modelDisplaySmoothPasses?: number;
          modelLogContrast?: ModelLogContrast;
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
        if (typeof j.modelDisplaySmoothPasses === "number") {
          setModelDisplaySmoothPasses(
            Math.max(0, Math.min(3, Math.round(j.modelDisplaySmoothPasses))),
          );
        }
        if (j.modelLogContrast === "standard") {
          setModelLogContrast("standard");
        } else if ((j.modelLogContrast as string) === "res2dinv") {
          setModelLogContrast("minmax");
        } else if (
          j.modelLogContrast === "auto" ||
          j.modelLogContrast === "percentile" ||
          j.modelLogContrast === "minmax" ||
          j.modelLogContrast === "equalize" ||
          j.modelLogContrast === "stdstretch"
        ) {
          setModelLogContrast(j.modelLogContrast);
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
            modelDisplaySmoothPasses,
            modelLogContrast,
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
    modelDisplaySmoothPasses,
    modelLogContrast,
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
        setInvertMethod(RES2DINV_DEFAULT_METHOD);
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
    if (invertEngine === "physics" || activeReadings.length < 4) return null;
    return invertDipolo2D(activeReadings, params, invertMethod, qcByRow);
  }, [invertEngine, activeReadings, params, invertMethod, qcByRow]);

  const physicsRunIdRef = useRef(0);
  const physicsBusyCountRef = useRef(0);
  const physicsInputsRef = useRef({
    readings,
    params,
    invertMethod,
    topography,
    qcByRow,
    physicsForwardModel,
  });
  physicsInputsRef.current = {
    readings,
    params,
    invertMethod,
    topography,
    qcByRow,
    physicsForwardModel,
  };

  const runPhysicsInversion = useCallback(async () => {
    if (invertEngine !== "physics") return;
    if (activeReadings.length < 4) {
      setPhysicsError("Mínimo 4 leituras activas para inversão RES2DINV.");
      setPhysicsResult(null);
      setPhysicsBusy(false);
      return;
    }

    const runId = ++physicsRunIdRef.current;
    physicsBusyCountRef.current += 1;
    setPhysicsBusy(true);
    setPhysicsError(null);
    setSyntheticDemoResult(null);

    const {
      readings: rIn,
      params: pIn,
      invertMethod: methodIn,
      topography: topoIn,
      qcByRow: qcIn,
      physicsForwardModel: fwdIn,
    } = physicsInputsRef.current;

    const qcMap = new Map<
      number,
      { qualityScore: number; isSpike: boolean }
    >();
    qcIn.forEach((g, rowIdx) => {
      qcMap.set(rowIdx, {
        qualityScore: g.qualityScore,
        isSpike: g.isSpike,
      });
    });

    try {
      const r = await invertDipolo2DPhysics(
        rIn,
        pIn,
        methodIn,
        topoIn,
        qcMap,
        fwdIn,
      );
      if (runId !== physicsRunIdRef.current) return;

      if (!r) {
        setPhysicsResult(null);
        setPhysicsError(
          "Inversão concluída sem modelo na resposta. Reinicie o motor Python (npm run geophysics:kill-port, depois geophysics:engine).",
        );
        return;
      }

      setPhysicsResult(r);
      setPhysicsEngineOnline(true);
      setPhysicsError(null);
      setImportNotice(
        `Inversão concluída (${r.forwardModel?.toUpperCase() ?? "FDM"}) — ${r.iterations} iterações, malha ${r.nx}×${r.nz}.`,
      );
    } catch (e: unknown) {
      if (runId !== physicsRunIdRef.current) return;
      setPhysicsResult(null);
      const msg = e instanceof Error ? e.message : "Erro na inversão FDM";
      setPhysicsError(msg);
      if (
        /indisponível|ECONNREFUSED|contactar|fetch failed|motor python|timeout|aborted/i.test(
          msg,
        )
      ) {
        setPhysicsEngineOnline(false);
      } else {
        setPhysicsEngineOnline(true);
      }
    } finally {
      physicsBusyCountRef.current = Math.max(0, physicsBusyCountRef.current - 1);
      if (physicsBusyCountRef.current === 0) {
        setPhysicsBusy(false);
      }
    }
  }, [invertEngine, activeReadings.length]);

  useEffect(() => {
    if (invertEngine !== "physics" || activeReadings.length < 4) {
      setPhysicsResult(null);
      setPhysicsError(null);
      setPhysicsBusy(false);
      physicsBusyCountRef.current = 0;
      return;
    }

    const timer = window.setTimeout(() => {
      void runPhysicsInversion();
    }, 400);

    return () => window.clearTimeout(timer);
  }, [
    invertEngine,
    activeReadings.length,
    physicsForwardModel,
    physicsInvertNonce,
    runPhysicsInversion,
  ]);

  /** Um clique: preset RES2DINV + aba modelo + inversão física. */
  const applyRes2dinvInversion = useCallback(() => {
    if (activeReadings.length < 4) {
      setImportNotice(
        "Inversão RES2DINV: importe ou preencha pelo menos 4 leituras activas.",
      );
      return;
    }
    applyRes2dinvPreset();
    setSyntheticDemoResult(null);
    setTab("modelo");
    setPhysicsEngineOnline(null);
    setPhysicsError(null);
    setImportNotice("A calcular inversão RES2DINV (FDM Poisson + Jacobiana)…");
    setPhysicsInvertNonce((n) => n + 1);
    void recheckPhysicsEngine();
  }, [activeReadings.length, applyRes2dinvPreset, recheckPhysicsEngine]);

  /** Dados SOLODATA + topografia + preset RES2DINV (estilo GARUVA LINHA 10). */
  const applyGaruvaRes2dinvWorkflow = useCallback(() => {
    const demo = loadSolodataLinha12Demo();
    setDefaultA("15");
    const demoReadings = solodataLinhaToReadings(demo, 15);
    const topo = buildDemoTopography(demoReadings.map((r) => r.stationM));
    setLinha(applyTopographyToLinha(demo, topo));
    setTopography(topo);
    setShowTopography(true);
    setPhysicsForwardModel("fdm");
    setSurveyLocation((loc) => ({
      ...(loc ?? GARUVA_DEFAULT_LOCATION),
      label: "Garuva",
    }));
    setModelSectionTitle("Geofisica - GARUVA (LINHA 10)");
    setImportNotice(
      "GARUVA: SOLODATA + topografia + malha 40×22 + escala RES2DINV. A calcular inversão FDM…",
    );
    if (demoReadings.filter((r) => !r.excluded).length >= 4) {
      applyRes2dinvInversion();
    } else {
      applyRes2dinvPreset();
      setTab("modelo");
    }
  }, [applyRes2dinvInversion, applyRes2dinvPreset]);

  const invertResult =
    syntheticDemoResult ??
    (invertEngine === "physics" ? physicsResult : proxyInvertResult);

  const loadSyntheticModelDemo = useCallback(
    (pattern: "layered" | "block" | "gradient" = "gradient") => {
      const demo = buildSyntheticInvertResult(activeReadings, params, {
        pattern,
        rhoBackground: 100,
        rhoContrast: 1000,
        nx: params.nx,
        nz: params.nz,
      });
      setSyntheticDemoResult(demo);
      setModelRenderError(null);
      setModelMaskMode("full");
      setModelColorScale((s) => ({
        ...s,
        auto: false,
        rhoMinOhmM: 100,
        rhoMaxOhmM: 1000,
        palette: "x2ipi",
      }));
      setModelLogContrast("res2dinv");
      setTab("modelo");
      setImportNotice(
        `Modo teste sintético — ${demo.methodLabel} (${demo.nx}×${demo.nz}). Não é saída do motor :8092.`,
      );
    },
    [activeReadings, params],
  );

  const clearSyntheticModelDemo = useCallback(() => {
    setSyntheticDemoResult(null);
    setImportNotice("Teste sintético removido — a mostrar inversão real (se disponível).");
  }, []);

  useEffect(() => {
    if (selectedObraId == null) {
      setSectionCode("");
      return;
    }
    const project = loadGeophysProject(selectedObraId);
    setSectionCode(suggestNextGeoCode(project.sections));
  }, [invertResult, tab, selectedObraId]);

  const saveSectionToProject = useCallback(() => {
    if (selectedObraId == null) {
      setSectionNotice("Selecione a obra do projeto antes de guardar a secção.");
      return;
    }
    if (!invertResult) return;
    const project = loadGeophysProject(selectedObraId);
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
    persistGeophysSection(section, selectedObraId);
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
    selectedObraId,
  ]);

  const modelRhoRange = useMemo(() => {
    if (!invertResult) return { min: 10, max: 1000 };
    const vals: number[] = [];
    for (let k = 0; k < invertResult.mLog10.length; k++) {
      vals.push(10 ** invertResult.mLog10[k]!);
    }
    if (!vals.length) return { min: 10, max: 1000 };
    const { rhoMin, rhoMax } = rhoPercentileBounds(vals, 5, 95);
    return { min: rhoMin, max: rhoMax };
  }, [invertResult]);

  const modelStats = useMemo(() => {
    if (!invertResult) return null;
    return modelStatsFromLog10(invertResult.mLog10);
  }, [invertResult]);

  const displayRmsPercent = useMemo(() => {
    if (!invertResult) return null;
    return computeRelativeRmsPercent(
      invertResult.yObsLog10,
      invertResult.ySynLog10,
    );
  }, [invertResult]);

  /** Aviso só para inversão física real — não modo sintético nem bom ajuste (RMS baixo). */
  const showInadequateModelWarning = useMemo(() => {
    if (!invertResult || syntheticDemoResult) return false;
    if (invertResult.engine !== "physics") return false;

    const rms = displayRmsPercent ?? invertResult.rmsPercent ?? 999;
    const iters = invertResult.iterations;
    const nm = invertResult.nx * invertResult.nz;
    const ratio =
      modelStats && modelStats.min > 0
        ? modelStats.max / modelStats.min
        : 1;

    if (rms <= 8 && ratio >= 2 && iters >= 1) return false;

    if (invertResult.forwardModel === "fem") return true;
    if (iters === 0) return true;
    if (nm < 400) return true;
    if (iters < 4 && rms > 12) return true;
    if (ratio < 1.8 && rms > 15) return true;
    if (rms > 35) return true;
    return false;
  }, [
    invertResult,
    syntheticDemoResult,
    displayRmsPercent,
    modelStats,
  ]);

  const showGoodFitHint = useMemo(() => {
    if (!invertResult || syntheticDemoResult) return false;
    if (invertResult.engine !== "physics") return false;
    const rms = displayRmsPercent ?? invertResult.rmsPercent ?? 999;
    const ratio =
      modelStats && modelStats.min > 0
        ? modelStats.max / modelStats.min
        : 1;
    return (
      rms <= 10 &&
      ratio >= 2 &&
      invertResult.iterations >= 1 &&
      invertResult.forwardModel !== "fem"
    );
  }, [invertResult, syntheticDemoResult, displayRmsPercent, modelStats]);

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
    if (modelRef.current) {
      const containerWidthPx =
        modelWrapRef.current?.clientWidth ??
        modelRef.current.parentElement?.clientWidth ??
        800;
      if (!invertResult) {
        const ctx = modelRef.current.getContext("2d");
        if (ctx) {
          const w = modelRef.current.width;
          const h = modelRef.current.height;
          ctx.clearRect(0, 0, w, h);
          ctx.fillStyle = "#f8fafc";
          ctx.fillRect(0, 0, w, h);
          if (invertEngine === "physics" && physicsBusy) {
            ctx.fillStyle = "#374151";
            ctx.font = "14px system-ui,sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(
              "A calcular inversão FDM (Poisson + GN + L1)…",
              w / 2,
              h / 2 - 8,
            );
            ctx.font = "12px system-ui,sans-serif";
            ctx.fillStyle = "#6b7280";
            ctx.fillText(
              "Células reais — aguarde (não é pseudoseção)",
              w / 2,
              h / 2 + 14,
            );
            ctx.textAlign = "left";
          }
        }
      } else {
        const drawAsPhysics =
          syntheticDemoResult != null || invertEngine === "physics";
        try {
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
              rmsPercent: displayRmsPercent ?? invertResult.rmsPercent,
              methodLabel: invertResult.methodLabel,
              invertEngine: drawAsPhysics ? "physics" : "proxy",
              renderMode: drawAsPhysics ? modelRenderMode : "bilinear",
              activeCells: invertResult.activeCells ?? null,
              zCoverM: invertResult.zCoverM ?? null,
              maskMode:
                drawAsPhysics && !syntheticDemoResult
                  ? "coverage"
                  : modelMaskMode,
              displaySmoothPasses: modelDisplaySmoothPasses,
              logContrast: modelLogContrast,
              displayScale: modelDisplayScale,
              scaleXM: modelScaleXM,
              scaleZM: modelScaleZM,
              containerWidthPx,
              topography,
              showTopography: showTopography && topography.length >= 2,
              sectionTitle: modelSectionTitle ?? undefined,
              colorLevels: RES2DINV_COLOR_LEVELS,
            },
          );
          setModelRenderError(null);
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Erro desconhecido no render";
          setModelRenderError(msg);
          drawModelCanvasMessage(
            modelRef.current,
            "Erro ao desenhar o modelo",
            msg,
          );
        }
      }
    }
    if (residualRef.current && readings.length > 0 && invertResult) {
      const residualsFull: number[] = [];
      let ai = 0;
      for (let i = 0; i < readings.length; i++) {
        if (readings[i]!.excluded) residualsFull.push(0);
        else {
          const obs = 10 ** invertResult.yObsLog10[ai]!;
          const syn = 10 ** invertResult.ySynLog10[ai]!;
          residualsFull.push(obs - syn);
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
    syntheticDemoResult,
    invertEngine,
    physicsBusy,
    modelRenderMode,
    activeReadings,
    modelColorScale,
    modelMaskMode,
    modelDisplaySmoothPasses,
    modelLogContrast,
    modelDisplayScale,
    displayRmsPercent,
    modelScaleXM,
    modelScaleZM,
    topography,
    showTopography,
    modelSectionTitle,
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
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[14rem] flex-col gap-1 text-xs font-medium text-[var(--muted)]">
            Obra (projeto)
            <select
              value={selectedObraId ?? ""}
              disabled={obrasLoading}
              onChange={(e) => {
                const next = e.target.value ? Number(e.target.value) : null;
                selectObra(next);
                const params = new URLSearchParams(
                  typeof window !== "undefined" ? window.location.search : "",
                );
                if (next != null) params.set("obraId", String(next));
                else params.delete("obraId");
                const qs = params.toString();
                router.replace(qs ? `${pathname}?${qs}` : pathname);
              }}
              className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] dark:bg-gray-900"
            >
              <option value="">
                {obrasLoading ? "A carregar obras…" : "— Selecione a obra —"}
              </option>
              {obras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                  {o.cliente ? ` — ${o.cliente}` : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={applyGaruvaRes2dinvWorkflow}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
            title="SOLODATA Garuva + topografia + malha 40×22 + escala RES2DINV (como referência LINHA 10)"
          >
            GARUVA RES2DINV
          </button>
          <button
            type="button"
            onClick={applyRes2dinvInversion}
            disabled={activeReadings.length < 4}
            className="rounded-lg border border-teal-600 bg-teal-600/10 px-3 py-2 text-sm font-semibold text-teal-900 hover:bg-teal-600/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-teal-100"
            title="Poisson FDM + Jacobiana + L1 + malha 40×22 + exibição RES2DINV"
          >
            Inversão RES2DINV
          </button>
          <button
            type="button"
            onClick={applyRes2dinvPreset}
            className="rounded-lg border border-teal-600/50 bg-teal-600/10 px-3 py-2 text-sm font-medium text-teal-900 hover:bg-teal-600/20 dark:text-teal-100"
            title="Só parâmetros e exibição, sem mudar de aba"
          >
            Preset RES2DINV
          </button>
          <button
            type="button"
            onClick={applyHorizontalLayersStyle}
            className="rounded-lg border border-teal-600/50 bg-teal-600/10 px-3 py-2 text-sm font-medium text-teal-900 hover:bg-teal-600/20 dark:text-teal-100"
            title="λ_z máximo — camadas horizontais nítidas na inversão e no desenho"
          >
            Camadas horizontais
          </button>
          <button
            type="button"
            onClick={() => setParams(precisionPreset)}
            className="rounded-lg border border-teal-600/40 px-3 py-2 text-sm font-medium text-teal-900 hover:bg-teal-50 dark:text-teal-200 dark:hover:bg-teal-950/40"
            title="Parâmetros do .dat Garuva (λ=0,2, malha 40×22)"
          >
            Malha .dat
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

      {obrasError && (
        <p className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
          {obrasError}{" "}
          <Link href="/obra" className="font-medium underline">
            Criar obra
          </Link>
        </p>
      )}
      {selectedObraId != null && obraNome && (
        <p className="text-xs text-[var(--muted)]">
          Obra activa: <strong className="text-[var(--text)]">{obraNome}</strong>
          {" "}
          (secções ERT guardadas só nesta obra)
        </p>
      )}
      {selectedObraId == null && !obrasLoading && obras.length > 0 && (
        <p className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
          Selecione a obra para guardar secções no projeto e usar o Modelo 3D / QC
          vinculados a ela.
        </p>
      )}

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
            obraId={selectedObraId}
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
              displayScale={modelDisplayScale}
              onDisplayScaleChange={setModelDisplayScale}
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
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-teal-600/30 bg-teal-600/5 px-3 py-3">
            <button
              type="button"
              onClick={applyRes2dinvInversion}
              disabled={activeReadings.length < 4 || physicsBusy}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {physicsBusy ? "A calcular…" : "Inversão RES2DINV"}
            </button>
            <p className="min-w-[12rem] flex-1 text-xs text-[var(--muted)]">
              FDM Poisson · Jacobiana · L1 · λ_z/λ_x · topografia · sem blur visual.
              Requer motor Python em :8092.
            </p>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-[var(--text)]">
              Motor de inversão
            </legend>
            <div className="flex flex-wrap gap-3 text-sm">
              <label
                className={`flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 ${
                  physicsEngineOnline === true && !proxyOverride
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer"
                }`}
              >
                <input
                  type="radio"
                  name="invert-engine"
                  checked={invertEngine === "proxy"}
                  disabled={physicsEngineOnline === true && !proxyOverride}
                  onChange={() => setInvertEngine("proxy")}
                />
                <span>
                  <strong>Rápido (proxy)</strong>
                  <span className="block text-xs text-[var(--muted)]">
                    Sensibilidade gaussiana — não comparável ao RES2DINV
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2">
                <input
                  type="radio"
                  name="invert-engine"
                  checked={invertEngine === "physics"}
                  onChange={() => {
                    setInvertEngine("physics");
                    setProxyOverride(false);
                    setInvertMethod((m) =>
                      m === "smoothness" || m === "least_squares"
                        ? RES2DINV_DEFAULT_METHOD
                        : m,
                    );
                  }}
                />
                <span>
                  <strong>Físico (FDM/FEM)</strong>
                  <span className="block text-xs text-[var(--muted)]">
                    Poisson FDM + Jacobiana — recomendado (RES2DINV)
                  </span>
                </span>
              </label>
            </div>
            {physicsEngineOnline === null && (
              <p className="mt-2 text-xs text-[var(--muted)]">
                A verificar motor Python (:8092)…
              </p>
            )}
            {physicsEngineOnline === true && (
              <p className="mt-2 text-xs text-teal-800 dark:text-teal-200">
                Motor Python online (:8092). Use FDM + Robusta L1. Confirme{" "}
                <code className="text-[10px]">npm run dev</code> para calcular o
                modelo.
              </p>
            )}
            {physicsEngineOnline === false && !physicsBusy && !physicsResult && (
              <div className="mt-2 space-y-2 text-xs text-amber-800 dark:text-amber-200">
                <p>
                  <strong>Motor Python offline</strong> na última verificação.
                  Pode tentar <strong>Inversão RES2DINV</strong> na mesma — liga
                  directo à porta 8092. Terminais: motor (:8092) e{" "}
                  <code>npm run dev</code>.
                </p>
                {physicsCheckError && (
                  <p className="text-red-700 dark:text-red-300">
                    {physicsCheckError}
                  </p>
                )}
                <code className="block rounded bg-[var(--muted)]/15 px-2 py-1">
                  cd c:\VISION\APP-SONDAGEM\app-web
                  <br />
                  npm run geophysics:kill-port
                  <br />
                  npm run geophysics:engine
                </code>
                <p className="text-[var(--muted)]">
                  Deixe esse terminal aberto. Depois clique em Verificar de novo (se
                  alterou .env.local, reinicie também <code>npm run dev</code>).
                </p>
                <button
                  type="button"
                  onClick={recheckPhysicsEngine}
                  className="rounded-md border border-amber-600/50 bg-amber-500/10 px-3 py-1.5 font-medium hover:bg-amber-500/20"
                >
                  Verificar motor de novo
                </button>
              </div>
            )}
            {physicsEngineOnline === true && (
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={proxyOverride}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setProxyOverride(on);
                    if (on) setInvertEngine("proxy");
                    else setInvertEngine("physics");
                  }}
                />
                Permitir preview proxy (não usar para comparar com RES2DINV)
              </label>
            )}
            {invertEngine === "physics" && (
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                <span className="self-center text-[var(--muted)]">Forward:</span>
                <label className="flex cursor-pointer items-center gap-1.5 rounded border border-[var(--border)] px-2 py-1">
                  <input
                    type="radio"
                    name="physics-forward"
                    checked={physicsForwardModel === "fdm"}
                    onChange={() => setPhysicsForwardModel("fdm")}
                  />
                  FDM (adjoint)
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 rounded border border-[var(--border)] px-2 py-1">
                  <input
                    type="radio"
                    name="physics-forward"
                    checked={physicsForwardModel === "fem"}
                    onChange={() => {
                      setImportNotice(
                        "FEM experimental — para inversão tipo RES2DINV use FDM (adjoint).",
                      );
                      setPhysicsForwardModel("fem");
                      setImportNotice(
                        "FEM pode demorar 15–40 min ou não terminar. Para calcular agora: seleccione FDM (adjoint).",
                      );
                    }}
                  />
                  FEM P1 (triangular)
                </label>
              </div>
            )}
            {invertEngine === "physics" && physicsBusy && (
              <p className="mt-2 text-xs text-teal-700 dark:text-teal-300">
                A calcular inversão {physicsForwardModel.toUpperCase()} (
                {activeReadings.length} leituras, motor :8092)…
                {physicsForwardModel === "fem" ? (
                  <span className="block font-medium text-amber-800 dark:text-amber-200">
                    FEM muito lento — use FDM (adjoint).
                  </span>
                ) : (
                  <span className="block text-[var(--muted)]">
                    FDM adjoint: ~30 s com poucas leituras, 1–3 min com perfil
                    grande. Se passar de 5 min, reinicie o motor Python.
                  </span>
                )}
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
              {DIPOLO2D_INVERT_METHODS.map((m) => {
                const proxyBlocksLs =
                  invertEngine === "proxy" && m.id === "least_squares";
                return (
                <label
                  key={m.id}
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    proxyBlocksLs
                      ? "cursor-not-allowed opacity-45"
                      : "cursor-pointer"
                  } ${
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
                    disabled={proxyBlocksLs}
                    onChange={() => selectInvertMethod(m.id)}
                  />
                  <span>
                    <span className="font-medium text-[var(--text)]">
                      {invertEngine === "physics" && m.id === "blocky_l1"
                        ? "Blocky L1 (contraste / bordas)"
                        : invertEngine === "physics" && m.id === "robust_l1"
                          ? "Robusta L1 (inversão física)"
                          : invertEngine === "physics" && m.id === "smoothness"
                            ? "Suavizada L2 (inversão física)"
                            : m.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--muted)]">
                      {m.id === "least_squares" &&
                        (invertEngine === "proxy"
                          ? "Desactivado no proxy (≈ pseudoseção)."
                          : "Solução única L2 + regularização λ.")}
                      {m.id === "occam" &&
                        "λ alto → reduz até ajuste alvo (estilo Occam)."}
                      {m.id === "gauss_newton" &&
                        "Passos iterativos na matriz normal + busca em linha."}
                      {m.id === "smoothness" &&
                        "L2 suavizada — tende a espalhar contraste; use L1 para contactos."}
                      {m.id === "blocky_l1" &&
                        "L1 nos dados + IRLS em ∇m — máximo contraste (recomendado)."}
                      {m.id === "robust_l1" &&
                        "L1 robusta nos dados — preserva contactos."}
                      {m.id === "hybrid" &&
                        "IRLS Huber+L1 misturados; α controla L2 vs robustez."}
                    </span>
                  </span>
                </label>
              );
              })}
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

          {activeReadings.length >= 4 && invertEngine === "proxy" && (
            <DipoloInvertCompare
              activeReadings={activeReadings}
              params={params}
              colorScale={modelColorScale}
              maskMode={modelMaskMode}
              selectedMethod={invertMethod}
              onSelectMethod={selectInvertMethod}
            />
          )}

          {activeReadings.length < 4 && (
            <p className="text-sm text-[var(--muted)]">
              Precisa de pelo menos 4 leituras <strong>ativas</strong> (não
              excluídas) na aba Pseudoseção/Dados — tem{" "}
              <strong>{activeReadings.length}</strong> ativa(s).
            </p>
          )}
          {activeReadings.length >= 4 &&
            invertEngine === "physics" &&
            !invertResult &&
            !physicsBusy &&
            !physicsError &&
            physicsEngineOnline !== false && (
              <p className="text-sm text-[var(--muted)]">
                Aguardando inversão física ({activeReadings.length} leituras
                ativas)…
              </p>
            )}
          {invertResult && invertEngine === "proxy" && (
            <div
              role="alert"
              className="rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
            >
              <strong>Não é inversão de dados (RES2DINV).</strong> O motor{" "}
              <em>proxy</em> distribui a <strong>resistividade aparente (ρa)</strong>{" "}
              na malha com pesos gaussianos — o desenho fica parecido com a
              pseudoseção do x2ipi. Para modelo invertido com camadas:{" "}
              <strong>Físico (FDM)</strong> + <strong>Robusta L1</strong> (botão
              Estilo RES2DINV).
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-violet-500/40 bg-violet-500/5 px-3 py-2 text-sm">
            <span className="text-[var(--muted)]">Diagnóstico render:</span>
            <button
              type="button"
              onClick={() => loadSyntheticModelDemo("gradient")}
              className="rounded-md bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-700"
            >
              Modelo sintético (gradiente 100→1000 Ω·m)
            </button>
            <button
              type="button"
              onClick={() => loadSyntheticModelDemo("layered")}
              className="rounded-md border border-violet-600/50 px-2.5 py-1 text-xs text-violet-900 hover:bg-violet-600/10 dark:text-violet-100"
            >
              Camadas
            </button>
            <button
              type="button"
              onClick={() => loadSyntheticModelDemo("block")}
              className="rounded-md border border-violet-600/50 px-2.5 py-1 text-xs text-violet-900 hover:bg-violet-600/10 dark:text-violet-100"
            >
              Bloco
            </button>
            {syntheticDemoResult && (
              <button
                type="button"
                onClick={clearSyntheticModelDemo}
                className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] hover:bg-[var(--muted)]/10"
              >
                Limpar teste
              </button>
            )}
          </div>

          {syntheticDemoResult && (
            <div
              role="status"
              className="rounded-lg border border-violet-500/50 bg-violet-500/10 px-3 py-2 text-sm text-violet-950 dark:text-violet-100"
            >
              <strong>Modo teste sintético.</strong> Modelo sintético (gradiente
              100→1000 Ω·m). Se o perfil aparecer aqui mas não após inversão real,
              o problema está no JSON do motor (:8092), não no canvas.
              {syntheticDemoResult.methodLabel !==
              "Modelo sintético (gradiente 100→1000 Ω·m)" ? (
                <> Variante activa: {syntheticDemoResult.methodLabel}.</>
              ) : null}
            </div>
          )}

          {invertResult && (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <p className="max-w-prose text-xs text-[var(--muted)]">
                  {syntheticDemoResult ? (
                    <>
                      {invertResult.methodLabel}
                      {invertResult.physicsMessage
                        ? ` — ${invertResult.physicsMessage}`
                        : ""}
                    </>
                  ) : invertEngine === "physics" ? (
                    <>
                      {invertResult.methodLabel} — Poisson FDM 2D + Jacobiana
                      (adjoint, com fallback FD), L1/L2 e pesos QC.
                      {invertResult.physicsMessage
                        ? ` ${invertResult.physicsMessage}`
                        : ""}
                    </>
                  ) : (
                    <>
                      {invertResult.methodLabel} — preview rápido com matriz de
                      sensibilidade gaussiana (não é RES2DINV). Exibição{" "}
                      {modelDisplayScale === "log" ? "log₁₀(ρ)" : "ρ linear"},{" "}
                      {modelLogContrast === "auto"
                        ? "auto ±2σ / equalização"
                        : modelLogContrast === "percentile"
                          ? "P5–P95"
                          : modelLogContrast === "equalize"
                            ? "equalização"
                            : modelLogContrast === "stdstretch"
                              ? "±2σ linear"
                              : modelLogContrast === "minmax"
                                ? "min–máx"
                                : modelLogContrast}
                      {modelDisplaySmoothPasses === 0
                        ? ", sem blur visual"
                        : `, blur visual ×${modelDisplaySmoothPasses}`}
                      .
                    </>
                  )}
                </p>
                <fieldset className="shrink-0 text-xs">
                  <legend className="mb-1 font-medium text-[var(--text)]">
                    Exibição (ρ = log₁₀ escala)
                  </legend>
                  <div className="mb-2 flex flex-col gap-1.5">
                    <label className="flex items-center gap-2">
                      <span className="text-[var(--muted)]">Contraste</span>
                      <select
                        value={modelLogContrast}
                        onChange={(e) =>
                          setModelLogContrast(
                            e.target.value as ModelLogContrast,
                          )
                        }
                        className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5"
                      >
                        <option value="res2dinv">RES2DINV (classes 0–4500)</option>
                        <option value="auto">Auto (faixa estreita → ±2σ)</option>
                        <option value="equalize">Equalização</option>
                        <option value="stdstretch">Stretch ±2σ (linear)</option>
                        <option value="percentile">P5–P95 log</option>
                        <option value="minmax">Min–máx</option>
                        <option value="standard">P8–P92</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2">
                      <span className="text-[var(--muted)]">Escala ρ</span>
                      <select
                        value={modelDisplayScale}
                        onChange={(e) =>
                          setModelDisplayScale(
                            e.target.value as ModelDisplayScale,
                          )
                        }
                        className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5"
                      >
                        <option value="log">Log₁₀ (RES2DINV)</option>
                        <option value="linear">Linear (Ω·m)</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2">
                      <span className="text-[var(--muted)]">Blur visual</span>
                      <select
                        value={modelDisplaySmoothPasses}
                        onChange={(e) =>
                          setModelDisplaySmoothPasses(Number(e.target.value))
                        }
                        className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5"
                      >
                        <option value={0}>0 (RES2DINV)</option>
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                      </select>
                    </label>
                  </div>
                </fieldset>
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

              {modelRenderError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-500/60 bg-red-500/10 px-3 py-2 text-sm text-red-950 dark:text-red-100"
                >
                  <strong>Renderização do modelo falhou.</strong>{" "}
                  {modelRenderError}
                  <span className="mt-1 block text-xs opacity-90">
                    Abra o console (F12) para detalhes. Verifique se o motor em
                    :8092 está online e se a inversão retornou m_log10 válido.
                  </span>
                </div>
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
                logContrast={modelLogContrast}
                displayScale={modelDisplayScale}
              />
              {showGoodFitHint && (
                <div
                  role="status"
                  className="rounded-lg border border-green-600/40 bg-green-600/10 px-3 py-2 text-sm text-green-950 dark:text-green-100"
                >
                  <strong>Bom ajuste aos dados.</strong> Malha {invertResult.nx}×
                  {invertResult.nz}, {invertResult.iterations} iterações, erro relativo{" "}
                  {(displayRmsPercent ?? invertResult.rmsPercent ?? 0).toFixed(1)}%.
                  {modelStats ? (
                    <>
                      {" "}
                      Contraste ρ {modelStats.min.toFixed(0)}–{modelStats.max.toFixed(0)} Ω·m.
                    </>
                  ) : null}
                </div>
              )}
              {showInadequateModelWarning && (
                  <div
                    role="alert"
                    className="rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
                  >
                    <strong>Modelo provavelmente inadequado.</strong> Malha{" "}
                    {invertResult.nx}×{invertResult.nz}, {invertResult.iterations}{" "}
                    iterações, erro relativo{" "}
                    {(displayRmsPercent ?? invertResult.rmsPercent ?? 0).toFixed(1)}%.
                    {invertResult.iterations === 0 ? (
                      <span className="mt-1 block text-xs">
                        Nenhuma iteração registada — reinicie o motor (:8092) e use{" "}
                        <strong>Estilo RES2DINV</strong>.
                      </span>
                    ) : null}
                    <span className="mt-1 block text-xs">
                      Para camadas horizontais como no RES2DINV: clique{" "}
                      <strong>Estilo RES2DINV</strong> (FDM + L1, malha fina), ou
                      aumente Células X/Z na aba Parâmetros e use{" "}
                      <strong>FDM (adjoint)</strong> em vez de FEM.
                    </span>
                  </div>
                )}
              <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-6">
                <div className="col-span-2 sm:col-span-6">
                  <dt className="text-[var(--muted)]">Método</dt>
                  <dd className="font-medium">
                    {invertResult.methodLabel}
                    <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                      (
                      {invertResult.engine === "physics"
                        ? (invertResult.forwardModel ?? "fdm").toUpperCase()
                        : "proxy"}
                      )
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">RMS log₁₀ ρ</dt>
                  <dd className="font-mono">{invertResult.rmsLog10.toFixed(4)}</dd>
                </div>
                {displayRmsPercent != null && (
                  <div>
                    <dt className="text-[var(--muted)]">RMS relativo</dt>
                    <dd className="font-mono">
                      {displayRmsPercent.toFixed(2)}%
                    </dd>
                  </div>
                )}
                {modelStats && (
                  <div className="col-span-2 sm:col-span-6">
                    <dt className="text-[var(--muted)]">Modelo ρ (Ω·m)</dt>
                    <dd className="font-mono text-xs sm:text-sm">
                      min {modelStats.min.toFixed(1)} · max{" "}
                      {modelStats.max.toFixed(1)} · σ{" "}
                      {modelStats.std.toFixed(1)} · média{" "}
                      {modelStats.mean.toFixed(1)}
                    </dd>
                  </div>
                )}
                {invertResult.chi2Reduced != null &&
                  invertResult.chi2Target != null && (
                    <div>
                      <dt className="text-[var(--muted)]">χ² Occam</dt>
                      <dd className="font-mono">
                        {invertResult.chi2Reduced.toFixed(1)} /{" "}
                        {invertResult.chi2Target.toFixed(0)}
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
                    disabled={selectedObraId == null}
                    className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Guardar secção no projeto
                  </button>
                </div>
              </div>

              <GeophysSectionsPanel
                className="mt-4"
                obraId={selectedObraId}
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
              ["lambda", "λ_reg (global)", 0.02, 2, 0.01],
              ["lambdaX", "λ_x horizontal (D_x) — menor = mais contraste lateral", 0.01, 1, 0.01],
              ["lambdaZ", "λ_z vertical (D_z) — maior = camadas horizontais", 0.1, 2.5, 0.02],
              ["huberC", "Huber c (log₁₀ ρ)", 0.001, 0.2, 0.001],
              ["maxIter", "Iterações IRLS", 1, 40, 1],
              ["lambdaDecay", "Decaimento λ/iter", 0.5, 0.99, 0.01],
              ["lambdaMin", "λ mínimo", 0.05, 5, 0.05],
              ["minImprovement", "Ganho mínimo relativo", 0.0001, 0.02, 0.0001],
              ["nx", "Células X (malha inversão)", 16, 48, 1],
              ["nz", "Células Z (malha inversão)", 12, 32, 1],
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
            RES2DINV-like: m = log₁₀(ρ), λ_reg ≈ 0,15, λ_x &lt; λ_z favorece
            camadas horizontais. Use «Robusta L1» ou «Gauss-Newton» + motor Físico
            (FDM) para Jacobiana real. Exibição sem blur (aba Modelo).
          </p>
        </div>
      )}
    </div>
  );
}
