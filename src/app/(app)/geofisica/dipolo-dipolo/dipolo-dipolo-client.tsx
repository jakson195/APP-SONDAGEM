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
  type PhysicsForwardModelId,
} from "@/lib/geofisica/dipolo2d/physics-invert-2d";
import { resolvePhysicsInvertMethod } from "@/lib/geofisica/dipolo2d/invert-method-resolve";
import {
  BLOCKY_INVERT_PARAMS,
  DEFAULT_PHYSICS_BACKEND,
  HORIZONTAL_LAYERS_DISPLAY_SMOOTH_PASSES,
  HORIZONTAL_LAYERS_INVERT_PARAMS,
  HORIZONTAL_LAYERS_METHOD,
  HORIZONTAL_LAYERS_NOTICE,
  HORIZONTAL_LAYERS_RENDER_MODE,
  PROXY_DEFAULT_METHOD,
  PROXY_INVERT_PARAMS,
  RES2DINV_COLOR_LEVELS,
  RES2DINV_DEFAULT_METHOD,
  RES2DINV_DISPLAY_SMOOTH_PASSES,
  RES2DINV_FIXED_COLOR_SCALE,
  RES2DINV_FORWARD_MODEL,
  RES2DINV_INVERSION_NOTICE,
  RES2DINV_INVERT_PARAMS,
  RES2DINV_LOG_CONTRAST,
  RES2DINV_MATCH_INVERT_PARAMS,
  RES2DINV_MATCH_METHOD,
  RES2DINV_MATCH_NOTICE,
  RES2DINV_RENDER_MODE,
  RESIPY_RESULTS_COLOR_SCALE,
  RESIPY_RESULTS_DISPLAY_SCALE,
  RESIPY_RESULTS_INVERT_PARAMS,
  RESIPY_RESULTS_NOTICE,
  ROBUST_INVERT_PARAMS,
} from "@/lib/geofisica/dipolo2d/res2dinv-preset";
import { InvertConvergenceChart } from "@/lib/geofisica/dipolo2d/invert-convergence-chart";
import { res2dinvDataPreset } from "@/lib/geofisica/dipolo2d/smooth-invert-2d";
import {
  type ResipyWorkflowStepId,
} from "@/lib/geofisica/dipolo2d/resipy-workflow";
import { ResipyWorkflowPanel } from "./resipy-workflow-panel";
import { qcGradesByRowIndex } from "@/lib/geofisica/qc/qc-row-grades";
import { loadSolodataLinha12Demo } from "@/lib/geofisica/dipolo2d/solodata-linha-demo";
import {
  activeReadingsForInversion,
  applyGlobalEspToLinha,
  excludedReadingIndices,
  readingsToSolodataLinha,
  solodataLinhaToReadings,
  toggleReadingExcluded,
} from "@/lib/geofisica/dipolo2d/solodata-linha-readings";
import { computeModelZMaxM } from "@/lib/geofisica/dipolo2d/model-depth";
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
  RESIPY_INVERT_METHODS,
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
const RESIPY_BACKEND = DEFAULT_PHYSICS_BACKEND;

type TabId = "dados" | "pseudo" | "modelo" | "interpretacao" | "ajustes";

type ModelMaskMode = NonNullable<ModelDrawOptions["maskMode"]>;

const defaultParams: Dipolo2DInvertParams = { ...PROXY_INVERT_PARAMS };

const precisionPreset: Dipolo2DInvertParams = res2dinvDataPreset;

/** Malha ultra-compacta (testes rápidos). */
const compactMeshPreset: Dipolo2DInvertParams = {
  ...RES2DINV_INVERT_PARAMS,
  nx: 14,
  nz: 7,
  maxIter: 4,
  meshClFactor: 5,
};

const INVERT_PROGRESS_STAGES = [
  "A preparar leituras…",
  "A criar malha triangular (ResIPy)…",
  "A inverter — iterações R2…",
  "A resamplear modelo…",
  "A finalizar…",
] as const;

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
    useState<Dipolo2DInvertMethodId>(RES2DINV_MATCH_METHOD);
  const [physicsForwardModel, setPhysicsForwardModel] =
    useState<PhysicsForwardModelId>("fdm");
  const [physicsResult, setPhysicsResult] = useState<
    import("@/lib/geofisica/dipolo2d/types").Dipolo2DInvertResult | null
  >(null);
  const [physicsBusy, setPhysicsBusy] = useState(false);
  const [physicsStage, setPhysicsStage] = useState<string | null>(null);
  const [physicsError, setPhysicsError] = useState<string | null>(null);
  /** null = a verificar; true = :8092 online → motor físico por defeito. */
  const [physicsEngineOnline, setPhysicsEngineOnline] = useState<boolean | null>(
    null,
  );
  const [physicsCheckError, setPhysicsCheckError] = useState<string | null>(
    null,
  );
  const [resipyWorkflowStep, setResipyWorkflowStep] =
    useState<ResipyWorkflowStepId>("invert");

  const selectInvertMethod = useCallback((id: Dipolo2DInvertMethodId) => {
    setInvertMethod(id);
    setParams((p) => {
      if (id === "blocky_l1") {
        return { ...BLOCKY_INVERT_PARAMS };
      }
      if (id === "robust_l1") {
        return { ...ROBUST_INVERT_PARAMS };
      }
      return p;
    });
  }, []);

  /** Força novo cálculo FDM mesmo que parâmetros não mudem. */
  const [physicsInvertNonce, setPhysicsInvertNonce] = useState(0);

  const applyProxyOriginalPreset = useCallback(() => {
    setParams({ ...PROXY_INVERT_PARAMS });
    selectInvertMethod(PROXY_DEFAULT_METHOD);
    setPhysicsForwardModel("fdm");
    setModelRenderMode(RES2DINV_RENDER_MODE);
    setModelDisplaySmoothPasses(RES2DINV_DISPLAY_SMOOTH_PASSES);
    setModelMaskMode("coverage");
    setModelLogContrast("res2dinv");
    setModelColorScale({ ...RES2DINV_FIXED_COLOR_SCALE });
    setModelDisplayScale("log");
    setModelResipyResultsStyle(false);
    setModelRes2dinvSectionStyle(true);
    setShowTopography(true);
    setPhysicsResult(null);
    setPhysicsError(null);
  }, [selectInvertMethod]);

  /** Visual + inversão alinhados ao RES2DINV desktop (referência GARUVA). */
  const applyRes2dinvMatchStyle = useCallback(() => {
    setParams({ ...RES2DINV_MATCH_INVERT_PARAMS });
    selectInvertMethod(RES2DINV_MATCH_METHOD);
    setPhysicsForwardModel("fdm");
    setModelRenderMode(RES2DINV_RENDER_MODE);
    setModelDisplaySmoothPasses(RES2DINV_DISPLAY_SMOOTH_PASSES);
    setModelMaskMode("coverage");
    setModelLogContrast("res2dinv");
    setModelDisplayScale("log");
    setModelColorScale({ ...RES2DINV_FIXED_COLOR_SCALE });
    setModelScaleXM(1);
    setModelScaleZM(1);
    setModelResipyResultsStyle(false);
    setModelRes2dinvSectionStyle(true);
    setShowTopography(true);
  }, [selectInvertMethod]);

  const applyRes2dinvPreset = useCallback(() => {
    setParams({ ...RES2DINV_INVERT_PARAMS });
    selectInvertMethod(RES2DINV_DEFAULT_METHOD);
    setPhysicsForwardModel("fdm");
    setModelRenderMode(RES2DINV_RENDER_MODE);
    setModelDisplaySmoothPasses(RES2DINV_DISPLAY_SMOOTH_PASSES);
    setModelMaskMode("coverage");
    setModelLogContrast(RES2DINV_LOG_CONTRAST);
    setModelColorScale({ ...RES2DINV_FIXED_COLOR_SCALE });
    setModelDisplayScale("log");
    setModelResipyResultsStyle(false);
    setShowTopography(true);
  }, [selectInvertMethod]);

  /** Visual + inversão alinhados ao ResIPy desktop (aba Results). */
  const applyResipyResultsStyle = useCallback(() => {
    setParams({ ...RESIPY_RESULTS_INVERT_PARAMS });
    selectInvertMethod(RES2DINV_DEFAULT_METHOD);
    setPhysicsForwardModel("fdm");
    setModelRenderMode(RES2DINV_RENDER_MODE);
    setModelDisplaySmoothPasses(0);
    setModelMaskMode("coverage");
    setModelLogContrast("minmax");
    setModelDisplayScale(RESIPY_RESULTS_DISPLAY_SCALE);
    setModelColorScale({ ...RESIPY_RESULTS_COLOR_SCALE });
    setModelScaleXM(1);
    setModelScaleZM(1);
    setModelResipyResultsStyle(true);
    setModelRes2dinvSectionStyle(false);
    setShowTopography(true);
    setImportNotice(RESIPY_RESULTS_NOTICE);
  }, [selectInvertMethod]);

  /** λ_z alto + interpolação só em x + inversão física ResIPy. */
  const applyHorizontalLayersStyle = useCallback(() => {
    setParams({ ...HORIZONTAL_LAYERS_INVERT_PARAMS });
    selectInvertMethod(HORIZONTAL_LAYERS_METHOD);
    setPhysicsForwardModel("fdm");
    setModelRenderMode(HORIZONTAL_LAYERS_RENDER_MODE);
    setModelDisplaySmoothPasses(HORIZONTAL_LAYERS_DISPLAY_SMOOTH_PASSES);
    setModelMaskMode("coverage");
    setModelLogContrast("res2dinv");
    setModelDisplayScale("log");
    setModelColorScale({ ...RES2DINV_FIXED_COLOR_SCALE });
    setModelScaleXM(1);
    setModelScaleZM(1);
    setModelResipyResultsStyle(false);
    setModelRes2dinvSectionStyle(true);
    setShowTopography(true);
    setImportNotice(HORIZONTAL_LAYERS_NOTICE);
  }, [selectInvertMethod]);

  const recheckPhysicsEngine = useCallback(() => {
    setPhysicsEngineOnline(null);
    setPhysicsCheckError(null);
    checkPhysicsEngineOnline().then((status) => {
      setPhysicsEngineOnline(status.online);
      setPhysicsCheckError(status.error ?? null);
      if (status.online) {
        setImportNotice(
          "Motor ResIPy online (:8092). Inversão requer também npm run dev no outro terminal.",
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
    if (invertMethod === "hybrid") {
      selectInvertMethod(PROXY_DEFAULT_METHOD);
    }
  }, [invertMethod, selectInvertMethod]);

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
    useState<ModelLogContrast>("res2dinv");
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
  const [modelResipyResultsStyle, setModelResipyResultsStyle] = useState(false);
  /** Trapézio + eixos Depth/Distance com legenda RES2DINV (10–8000 Ω·m). */
  const [modelRes2dinvSectionStyle, setModelRes2dinvSectionStyle] =
    useState(true);
  const [modelRenderError, setModelRenderError] = useState<string | null>(null);
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
          j.invertMethod !== "hybrid" &&
          RESIPY_INVERT_METHODS.some((m) => m.id === j.invertMethod)
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
          setModelLogContrast("res2dinv");
        } else if (
          j.modelLogContrast === "auto" ||
          j.modelLogContrast === "percentile" ||
          j.modelLogContrast === "log_percentile" ||
          j.modelLogContrast === "minmax" ||
          j.modelLogContrast === "equalize" ||
          j.modelLogContrast === "stdstretch" ||
          j.modelLogContrast === "res2dinv"
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

  /** Confirma ESP (m) e aplica a todas as linhas SOLODATA. */
  const commitEspM = useCallback((raw: string) => {
    const esp = Number(String(raw).replace(",", ".").trim());
    if (!Number.isFinite(esp) || esp <= 0) {
      setDefaultA("15");
      return;
    }
    const espStr = String(esp);
    setDefaultA(espStr);
    setLinha((prev) => applyGlobalEspToLinha(prev, esp));
    setImportNotice(
      `ESP ${espStr} m aplicado a todas as linhas. Re-inverta para actualizar profundidade e modelo.`,
    );
  }, []);

  const readings = useMemo(
    () => solodataLinhaToReadings(linha, aNum),
    [linha, aNum],
  );

  const activeReadings = useMemo(
    () => activeReadingsForInversion(readings),
    [readings],
  );

  const modelDepthHintM = useMemo(() => {
    if (activeReadings.length < 1) return null;
    const z = computeModelZMaxM(activeReadings, params);
    return z >= 10 ? `${z.toFixed(0)} m` : `${z.toFixed(1)} m`;
  }, [activeReadings, params]);

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
    const esp = 15;
    setDefaultA(String(esp));
    let state = applyGlobalEspToLinha(demo, esp);
    const demoReadings = solodataLinhaToReadings(state, esp);
    const topo = buildDemoTopography(demoReadings.map((r) => r.stationM));
    setLinha(applyTopographyToLinha(state, topo));
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
        applyRes2dinvMatchStyle();
        if (resParsed.title) {
          setModelSectionTitle(resParsed.title);
        }
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
      if (resParsed && resParsed.readings.length >= 4) {
        setImportNotice(
          `${RES2DINV_MATCH_NOTICE} A calcular inversão a partir do .dat…`,
        );
        setPhysicsInvertNonce((n) => n + 1);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "erro desconhecido";
      setImportNotice(`Erro ao importar «${file.name}»: ${msg}`);
    }
  }, [applyRes2dinvMatchStyle]);

  const qcByRow = useMemo(
    () => qcGradesByRowIndex(linha, aNum),
    [linha, aNum],
  );

  const proxyResult = useMemo(() => {
    if (activeReadings.length < 4) return null;
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
    return invertDipolo2D(readings, params, invertMethod, qcMap);
  }, [readings, params, invertMethod, qcByRow, activeReadings.length]);

  useEffect(() => {
    setPhysicsResult(null);
    setPhysicsError(null);
  }, [readings, params, invertMethod, defaultA]);

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
      const physicsMethod = resolvePhysicsInvertMethod(methodIn);
      const r = await invertDipolo2DPhysics(
        rIn,
        pIn,
        physicsMethod,
        topoIn,
        qcMap,
        fwdIn,
        { physicsBackend: RESIPY_BACKEND },
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
      const stageTail =
        r.progressLog?.length ? ` · ${r.progressLog[r.progressLog.length - 1]}` : "";
      setImportNotice(
        `Inversão RES2DINV concluída — ${r.iterations} it., malha ${r.nx}×${r.nz}.${stageTail}`,
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
  }, [activeReadings.length]);

  useEffect(() => {
    if (!physicsBusy) {
      setPhysicsStage(null);
      return;
    }
    let stageIdx = 0;
    setPhysicsStage(INVERT_PROGRESS_STAGES[0] ?? null);
    const stageTimer = window.setInterval(() => {
      stageIdx = Math.min(stageIdx + 1, INVERT_PROGRESS_STAGES.length - 1);
      setPhysicsStage(INVERT_PROGRESS_STAGES[stageIdx] ?? null);
    }, 9000);
    return () => window.clearInterval(stageTimer);
  }, [physicsBusy]);

  /** ResIPy corre ao incrementar physicsInvertNonce (botões / import .dat / GARUVA). */
  useEffect(() => {
    if (physicsInvertNonce < 1) return;
    if (activeReadings.length < 4) return;
    const timer = window.setTimeout(() => {
      void runPhysicsInversion();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [physicsInvertNonce, activeReadings.length, runPhysicsInversion]);

  /** Um clique: preset ResIPy + aba modelo + inversão. */
  const applyResipyResultsInversion = useCallback(() => {
    if (activeReadings.length < 4) {
      setImportNotice(
        "Estilo ResIPy: importe ou preencha pelo menos 4 leituras activas.",
      );
      return;
    }
    applyResipyResultsStyle();
    setTab("modelo");
    setImportNotice(`${RESIPY_RESULTS_NOTICE} A calcular inversão…`);
    recheckPhysicsEngine();
    setPhysicsInvertNonce((n) => n + 1);
  }, [
    activeReadings.length,
    applyResipyResultsStyle,
    recheckPhysicsEngine,
  ]);

  const applyRes2dinvInversion = useCallback(() => {
    if (activeReadings.length < 4) {
      setImportNotice(
        "Inversão RES2DINV: importe ou preencha pelo menos 4 leituras activas.",
      );
      return;
    }
    applyRes2dinvMatchStyle();
    setTab("modelo");
    setPhysicsEngineOnline(null);
    setPhysicsError(null);
    setImportNotice(`${RES2DINV_MATCH_NOTICE} A calcular inversão…`);
    setPhysicsInvertNonce((n) => n + 1);
    void recheckPhysicsEngine();
  }, [activeReadings.length, applyRes2dinvMatchStyle, recheckPhysicsEngine]);

  const applyRes2dinvMatchInversion = applyRes2dinvInversion;

  const applyHorizontalLayersInversion = useCallback(() => {
    if (activeReadings.length < 4) {
      setImportNotice(
        "Camadas horizontais: importe ou preencha pelo menos 4 leituras activas.",
      );
      return;
    }
    applyHorizontalLayersStyle();
    setTab("modelo");
    setPhysicsError(null);
    setPhysicsInvertNonce((n) => n + 1);
    void recheckPhysicsEngine();
  }, [
    activeReadings.length,
    applyHorizontalLayersStyle,
    recheckPhysicsEngine,
  ]);

  /** Dados SOLODATA + topografia + preset RES2DINV (estilo GARUVA LINHA 10). */
  const applyGaruvaRes2dinvWorkflow = useCallback(() => {
    const demo = loadSolodataLinha12Demo();
    const esp = 15;
    setDefaultA(String(esp));
    let state = applyGlobalEspToLinha(demo, esp);
    const demoReadings = solodataLinhaToReadings(state, esp);
    const topo = buildDemoTopography(demoReadings.map((r) => r.stationM));
    setLinha(applyTopographyToLinha(state, topo));
    setTopography(topo);
    setShowTopography(true);
    setPhysicsForwardModel("fdm");
    setSurveyLocation((loc) => ({
      ...(loc ?? GARUVA_DEFAULT_LOCATION),
      label: "Garuva",
    }));
    setModelSectionTitle("Geofisica - GARUVA (LINHA 10)");
    setImportNotice(`${RES2DINV_MATCH_NOTICE} A calcular inversão…`);
    applyRes2dinvMatchStyle();
    setTab("modelo");
    setPhysicsInvertNonce((n) => n + 1);
    void recheckPhysicsEngine();
  }, [applyRes2dinvMatchStyle, recheckPhysicsEngine]);

  const invertResult = physicsResult ?? proxyResult;

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
    if (!invertResult) return false;
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
    displayRmsPercent,
    modelStats,
  ]);

  const showGoodFitHint = useMemo(() => {
    if (!invertResult) return false;
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
  }, [invertResult, displayRmsPercent, modelStats]);

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
          if (physicsBusy) {
            ctx.fillStyle = "#374151";
            ctx.font = "14px system-ui,sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(
              physicsStage ?? "A calcular inversão RES2DINV…",
              w / 2,
              h / 2 - 8,
            );
            ctx.font = "12px system-ui,sans-serif";
            ctx.fillStyle = "#6b7280";
            ctx.fillText("Malha triangular — aguarde", w / 2, h / 2 + 14);
            ctx.textAlign = "left";
          }
        }
      } else {
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
              modelDepthFactor: params.modelDepthFactor,
              iterations: invertResult.iterations,
              rmsLog10: invertResult.rmsLog10,
              rmsPercent: displayRmsPercent ?? invertResult.rmsPercent,
              methodLabel: invertResult.methodLabel,
              invertEngine: invertResult.engine ?? "physics",
              renderMode: modelRenderMode,
              activeCells:
                modelMaskMode === "coverage" ? null : invertResult.activeCells ?? null,
              zCoverM:
                modelRenderMode === "layer_smooth" ||
                modelRenderMode === "fem_smooth"
                  ? null
                  : invertResult.zCoverM ?? null,
              maskMode: modelMaskMode,
              displaySmoothPasses: modelDisplaySmoothPasses,
              logContrast: modelLogContrast,
              displayScale: modelDisplayScale,
              scaleXM: modelScaleXM,
              scaleZM: modelScaleZM,
              legendStyle: modelResipyResultsStyle ? "resipy" : "bottom",
              resipyAxisLabels:
                modelResipyResultsStyle || modelRes2dinvSectionStyle,
              showElectrodes: modelResipyResultsStyle,
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
    physicsBusy,
    physicsStage,
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
    modelResipyResultsStyle,
    modelRes2dinvSectionStyle,
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
            Ruído), ajuste a escala de cor e inverta com ResIPy R2.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[5.5rem] flex-col gap-1 text-xs font-medium text-[var(--muted)]">
            ESP (m)
            <input
              type="text"
              inputMode="decimal"
              className="w-20 rounded-lg border border-[var(--border)] bg-white px-2 py-2 text-sm font-semibold text-[var(--text)] dark:bg-gray-900"
              value={defaultA}
              onChange={(e) => setDefaultA(e.target.value)}
              onBlur={(e) => commitEspM(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitEspM(defaultA);
                }
              }}
              title="Espaçamento entre eletrodos (coluna ESP SOLODATA). Enter ou sair do campo para aplicar a todas as linhas."
            />
            {modelDepthHintM && (
              <span className="text-[10px] font-normal leading-tight text-[var(--muted)]">
                Prof. ≈ {modelDepthHintM}
              </span>
            )}
          </label>
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
            title="GARUVA LINHA 10 + inversão RES2DINV (Suavizada L2, ResIPy R2)"
          >
            GARUVA RES2DINV
          </button>
          <button
            type="button"
            onClick={() => {
              applyProxyOriginalPreset();
              setTab("modelo");
              setImportNotice(
                "Preset original: malha 22×12, suavizada L2 — inversão instantânea no browser.",
              );
            }}
            className="rounded-lg border border-emerald-600/50 bg-emerald-600/10 px-3 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-600/20 dark:text-emerald-100"
            title="Volta ao modelo gaussiano original (como no início)"
          >
            Inversão original
          </button>
          <button
            type="button"
            onClick={applyRes2dinvInversion}
            disabled={activeReadings.length < 4}
            className="rounded-lg border border-teal-600 bg-teal-600/10 px-3 py-2 text-sm font-semibold text-teal-900 hover:bg-teal-600/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-teal-100"
            title="Inversão física ResIPy R2 — Suavizada L2, malha 22×12, classes 10–8000 Ω·m"
          >
            Modelo RES2DINV
          </button>
          <button
            type="button"
            onClick={applyResipyResultsInversion}
            className="rounded-lg border border-indigo-600/50 bg-indigo-600/10 px-3 py-2 text-sm font-medium text-indigo-950 hover:bg-indigo-600/20 dark:text-indigo-100"
            title="Jet 0–7500 Ω·m, contour, crop corners, trapézio — igual ao ResIPy Results"
          >
            Estilo ResIPy (Results)
          </button>
          <button
            type="button"
            onClick={applyRes2dinvPreset}
            className="rounded-lg border border-teal-600/50 bg-teal-600/10 px-3 py-2 text-sm font-medium text-teal-900 hover:bg-teal-600/20 dark:text-teal-100"
            title="Só parâmetros e exibição, sem mudar de aba"
          >
            Preset ResIPy
          </button>
          <button
            type="button"
            onClick={applyHorizontalLayersInversion}
            className="rounded-lg border border-teal-600/50 bg-teal-600/10 px-3 py-2 text-sm font-medium text-teal-900 hover:bg-teal-600/20 dark:text-teal-100"
            title="Suavizada L2 + λ_z alto + interpolação horizontal (ResIPy R2)"
          >
            Camadas horizontais
          </button>
          <button
            type="button"
            onClick={() => setParams(precisionPreset)}
            className="rounded-lg border border-teal-600/40 px-3 py-2 text-sm font-medium text-teal-900 hover:bg-teal-50 dark:text-teal-200 dark:hover:bg-teal-950/40"
            title="Alta qualidade: malha 22×12, 12 it., contour + crop"
          >
            Malha .dat
          </button>
          <button
            type="button"
            onClick={() => setParams(compactMeshPreset)}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--muted)]/10"
            title="Malha ultra-compacta (14×7, 4 it.)"
          >
            Malha compacta
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
                ESP (m) — espaçamento dipolo
              </label>
              <input
                type="text"
                inputMode="decimal"
                className="mt-1 w-32 rounded border border-[var(--border)] bg-white px-2 py-2 text-sm dark:bg-gray-900"
                value={defaultA}
                onChange={(e) => setDefaultA(e.target.value)}
                onBlur={(e) => commitEspM(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitEspM(defaultA);
                  }
                }}
              />
              <p className="mt-1 text-[10px] text-[var(--muted)]">
                Enter ou Tab para aplicar a todas as linhas
                {modelDepthHintM ? ` · profundidade modelo ≈ ${modelDepthHintM}` : ""}
              </p>
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
                onChange={(e) => {
                  const input = e.currentTarget;
                  const file = input.files?.[0];
                  if (!file) return;
                  void importGeophysicsFile(file).finally(() => {
                    input.value = "";
                  });
                }}
              />
            </label>
            <label className="cursor-pointer rounded-lg border border-teal-600/40 bg-teal-600/10 px-3 py-2 text-sm font-medium text-teal-900 hover:bg-teal-600/20 dark:text-teal-200">
              Importar RES2DINV (.dat / .txt + topo)
              <input
                type="file"
                accept=".dat,.txt,.DAT,.TXT"
                className="hidden"
                onChange={(e) => {
                  const input = e.currentTarget;
                  const file = input.files?.[0];
                  if (!file) return;
                  void importGeophysicsFile(file).finally(() => {
                    input.value = "";
                  });
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
              {physicsBusy
                ? (physicsStage ?? "A calcular…")
                : "Inversão RES2DINV"}
            </button>
            <p className="min-w-[12rem] flex-1 text-xs text-[var(--muted)]">
              Engine ResIPy oficial (POST :8092/invert) · mesh + inversão R2 no
              Python · render no DataGeo. Requer motor (:8092) e npm run dev.
            </p>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-[var(--text)]">
              Motor de inversão
            </legend>
            <p className="text-sm">
              <strong>ResIPy R2</strong>
              <span className="block text-xs text-[var(--muted)]">
                Único motor disponível (porta :8092)
              </span>
            </p>
            {physicsEngineOnline === null && (
              <p className="mt-2 text-xs text-[var(--muted)]">
                A verificar motor ResIPy (:8092)…
              </p>
            )}
            {physicsEngineOnline === true && (
              <p className="mt-2 text-xs text-teal-800 dark:text-teal-200">
                Motor ResIPy online (:8092). Confirme{" "}
                <code className="text-[10px]">npm run dev</code> para calcular o
                modelo.
              </p>
            )}
            {physicsEngineOnline === false && !physicsBusy && !physicsResult && (
              <div className="mt-2 space-y-2 text-xs text-amber-800 dark:text-amber-200">
                <p>
                  <strong>Motor ResIPy offline</strong> na última verificação.
                  Terminais: motor (:8092) e <code>npm run dev</code>.
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
                <button
                  type="button"
                  onClick={recheckPhysicsEngine}
                  className="rounded-md border border-amber-600/50 bg-amber-500/10 px-3 py-1.5 font-medium hover:bg-amber-500/20"
                >
                  Verificar motor de novo
                </button>
              </div>
            )}
            {physicsError && (
              <p className="mt-2 text-xs text-red-700 dark:text-red-300">
                {physicsError}
              </p>
            )}
            {(physicsBusy ||
              invertResult?.progressLog?.length ||
              physicsError) && (
              <div
                className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--muted)]/5 px-3 py-2 text-xs"
                role="status"
                aria-live="polite"
              >
                <p className="font-medium text-[var(--text)]">
                  ResIPy R2 — progresso
                </p>
                {physicsBusy && physicsStage && (
                  <p className="mt-1 text-teal-800 dark:text-teal-200">
                    {physicsStage}
                  </p>
                )}
                {physicsBusy && (
                  <ul className="mt-2 space-y-0.5 text-[var(--muted)]">
                    {INVERT_PROGRESS_STAGES.map((step) => (
                      <li
                        key={step}
                        className={
                          step === physicsStage
                            ? "font-medium text-teal-800 dark:text-teal-200"
                            : ""
                        }
                      >
                        {step}
                      </li>
                    ))}
                  </ul>
                )}
                {!physicsBusy && invertResult?.progressLog?.length ? (
                  <ul className="mt-2 space-y-0.5 font-mono text-[10px] text-[var(--muted)]">
                    {invertResult.progressLog.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
                {physicsError && !physicsBusy && (
                  <p className="mt-2 text-red-700 dark:text-red-300">
                    <strong>Erro ResIPy:</strong> {physicsError}
                  </p>
                )}
              </div>
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-[var(--text)]">
              Método de inversão
            </legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {RESIPY_INVERT_METHODS.map((m) => (
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
                      {m.id === "blocky_l1"
                        ? "Blocky L1 (contraste / bordas)"
                        : m.id === "robust_l1"
                          ? "Robusta L1"
                          : m.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--muted)]">
                      {m.id === "occam" &&
                        "λ alto → reduz até ajuste alvo (estilo Occam)."}
                      {m.id === "gauss_newton" &&
                        "Passos iterativos Gauss-Newton (R2)."}
                      {m.id === "smoothness" &&
                        "L2 suavizada — tende a espalhar contraste; use L1 para contactos."}
                      {m.id === "blocky_l1" &&
                        "Máximo contraste geológico (recomendado)."}
                      {m.id === "robust_l1" &&
                        "L1 robusta nos dados — preserva contactos."}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {activeReadings.length < 4 && (
            <p className="text-sm text-[var(--muted)]">
              Precisa de pelo menos 4 leituras <strong>ativas</strong> (não
              excluídas) na aba Pseudoseção/Dados — tem{" "}
              <strong>{activeReadings.length}</strong> ativa(s).
            </p>
          )}
          {activeReadings.length >= 4 &&
            !invertResult &&
            !physicsBusy &&
            !physicsError &&
            physicsEngineOnline !== false && (
              <p className="text-sm text-[var(--muted)]">
                Aguardando inversão RES2DINV ({activeReadings.length} leituras
                ativas)…
              </p>
            )}

          {invertResult && (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <p className="max-w-prose text-xs text-[var(--muted)]">
                  {invertResult.methodLabel}
                  {invertResult.engine === "physics"
                    ? " — motor ResIPy R2 (inversão física)."
                    : invertResult.engine === "proxy"
                      ? " — preview gaussiano (browser)."
                      : " — inversão gaussiana (browser)."}
                  {invertResult.physicsMessage
                    ? ` ${invertResult.physicsMessage}`
                    : ""}
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
                        <option value="log_percentile">
                          Log P5–P95 (percentis do modelo)
                        </option>
                        <option value="res2dinv">RES2DINV (classes fixas)</option>
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
                      <strong>Inversão RES2DINV</strong> (L1, malha fina), ou
                      aumente Células X/Z na aba Parâmetros.
                    </span>
                  </div>
                )}
              <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-6">
                <div className="col-span-2 sm:col-span-6">
                  <dt className="text-[var(--muted)]">Método</dt>
                  <dd className="font-medium">
                    {invertResult.methodLabel}
                    <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                      (ResIPy R2)
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

              {invertResult.iterationHistory.length >= 2 && (
                <InvertConvergenceChart
                  history={invertResult.iterationHistory}
                  className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"
                />
              )}

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
        <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <ResipyWorkflowPanel
            params={params}
            activeStep={resipyWorkflowStep}
            onStepChange={setResipyWorkflowStep}
            onGoPseudo={() => setTab("pseudo")}
            onChange={(next) => {
              setParams(next);
              if (typeof next.contourSmoothPasses === "number") {
                setModelDisplaySmoothPasses(
                  Math.max(0, Math.min(6, Math.round(next.contourSmoothPasses))),
                );
              }
              if (next.cropCorners !== undefined) {
                setModelMaskMode(next.cropCorners ? "coverage" : "full");
              }
            }}
          />
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-[var(--text)]">
              Parâmetros avançados (λ, Huber, malha ResIPy)
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(
            [
              ["factorDepth", "Fator prof. pseudo z = f·n·a", 0.05, 0.8, 0.01],
              ["lambda", "λ_reg (global)", 0.02, 2, 0.01],
              ["lambdaX", "λ_x horizontal (D_x) — menor = mais contraste lateral", 0.01, 1, 0.01],
              ["lambdaZ", "λ_z vertical (D_z) — maior = camadas horizontais", 0.1, 2.5, 0.02],
              ["huberC", "Huber c (log₁₀ ρ)", 0.001, 0.2, 0.001],
              ["maxIter", "Iterações IRLS", 1, 40, 1],
              ["lambdaDecay", "Decaimento λ/iter", 0.5, 0.99, 0.01],
              ["lambdaMin", "λ mínimo", 0.05, 5, 0.05],
              ["minImprovement", "Ganho mínimo relativo", 0.0001, 0.02, 0.0001],
              ["nx", "Células X (malha inversão)", 12, 36, 1],
              ["nz", "Células Z (malha inversão)", 8, 20, 1],
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
          <p className="sm:col-span-2 text-xs text-[var(--muted)]">
            RES2DINV-like: m = log₁₀(ρ), λ_reg ≈ 0,15, λ_x &lt; λ_z favorece
            camadas horizontais. Motor <strong>ResIPy</strong> usa malha R2 +
            ρ min/max + filtros acima. Exibição: contour smooth e crop corners na
            secção Visual.
          </p>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
