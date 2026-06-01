"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { VolumeAiResult } from "@/lib/geofisica/ai/volume-interpret-ai";
import { invertDipolo2D } from "@/lib/geofisica/dipolo2d/invert-methods-2d";
import {
  parseDipoloImportFile,
  parseRes2dinvDatWithTopography,
} from "@/lib/geofisica/dipolo2d/parse-dipolo-import";
import { parsePrecalculatedInvertResult } from "@/lib/geofisica/dipolo2d/parse-invert-model-import";
import { res2dinvToSolodataLinha } from "@/lib/geofisica/dipolo2d/parse-res2dinv-dat";
import { res2dinvDataPreset } from "@/lib/geofisica/dipolo2d/smooth-invert-2d";
import {
  activeReadingsForInversion,
  solodataLinhaToReadings,
} from "@/lib/geofisica/dipolo2d/solodata-linha-readings";
import type { Dipolo2DInvertParams } from "@/lib/geofisica/dipolo2d/types";
import { buildVolume3D } from "@/lib/geofisica/volume3d/build-volume-pipeline";
import { countValidVolumeCells } from "@/lib/geofisica/volume3d/build-volume-3d";
import {
  exportBlockModelCsv,
  blockModelSummary,
  computeRhoBandVolumeStats,
} from "@/lib/geofisica/3d-engine/block-model";
import { downloadTextFile } from "@/lib/field-export-kml-gpx";
import {
  registerLineFromReadings,
  registerLineFromXyz,
  refreshLineAzimuth,
} from "@/lib/geofisica/volume3d/line-auto-register";
import {
  parseXyzFile,
  xyzToDipoloReadings,
  xyzToTopography,
} from "@/lib/geofisica/volume3d/parse-xyz";
import {
  defaultSurveyLineGeometry,
  defaultProjectOrigin,
  newLineId,
} from "@/lib/geofisica/volume3d/survey-line-factory";
import { computeSurveyAnchor } from "@/lib/geofisica/volume3d/geometry-coords";
import type {
  GeophysSurveyLine,
  ResistivityVolume3D,
  SectionPoint3D,
  VolumeBuildParams,
  VolumeEngine,
  VolumeInterpMethod,
} from "@/lib/geofisica/volume3d/volume3d-types";
import type { VolumeSamplePoint3D } from "@/lib/geofisica/volume3d/collect-section-samples";
import {
  DEFAULT_RHO_FILTER,
  filterFromVolumeStats,
  type VolumeRhoFilter,
} from "@/lib/geofisica/volume3d/volume-rho-filter";
import { xyzParseToVolumeSamples } from "@/lib/geofisica/volume3d/xyz-to-volume-samples";
import { ResistivityFilterPanel } from "./resistivity-filter-panel";
import { VolumeLineTopographyPanel } from "./volume-line-topography-panel";
import type { TopographyPoint } from "@/lib/geofisica/dipolo2d/topography-types";
import { LineGeorefEditor, LineGeorefInline } from "./line-georef-editor";
import {
  defaultUtmFusoBrasil,
  type CoordInputMode,
} from "@/lib/geofisica/volume3d/geophys-utm-coords";
import {
  applyTopographyToLineGeometry,
  fetchDemTopographyForLine,
  mergeDemWithStations,
  samplePointsAlongProfile,
  stationsForTopography,
} from "@/lib/geofisica/volume3d/line-elevation-profile";
import {
  attachTerrainSurfaceToVolume,
  attachTerrainSurfaceToVolumeAsync,
  countProfileTopographyLines,
  lineHasTerrainData,
  surveyHasProfileTopography,
} from "@/lib/geofisica/volume3d/volume-terrain-surface";
import { invertResultDepthM } from "@/lib/geofisica/geophys-project/invert-result-serialize";
import {
  mapClickToGeometryPoint,
  type MapDrawState,
} from "./volume-map-panel";
import { volumeLogRhoStats } from "@/lib/geofisica/volume3d/volume-slices";
import { VolumeLegend, volumeStatsToLegendBounds } from "./volume-legend";
import {
  buildSavedSectionFromSurveyLine,
  savedSectionsToSurveyLines,
} from "@/lib/geofisica/geophys-project/dipolo-to-saved-section";
import {
  consumePendingVolumeLoad,
  loadGeophysProject,
} from "@/lib/geofisica/geophys-project/geophys-project-storage";
import {
  kmlFeatureToSurveyGeometry,
  kmlFeatureToTopography,
  kmlPathLengthM,
  parseKmlKmzFiles,
  type ImportedKmlTrack,
} from "@/lib/geofisica/volume3d/parse-kml-kmz";
import {
  GeophysSectionsPanel,
  persistGeophysSection,
} from "../geophys-sections-panel";

const DynamicVolumeMap = dynamic(
  () => import("./volume-map-panel").then((m) => m.VolumeMapPanel),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[240px] items-center justify-center rounded-lg border border-[var(--border)] text-xs text-[var(--muted)]">
        A carregar mapa…
      </div>
    ),
  },
);

const ResistivityVolumeScene = dynamic(
  () =>
    import("./resistivity-volume-scene").then((m) => m.ResistivityVolumeScene),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[480px] items-center justify-center rounded-lg border border-[var(--border)] bg-slate-950 text-sm text-slate-400">
        A carregar visualizador 3D…
      </div>
    ),
  },
);

type TabId = "dados" | "volume" | "interpretacao";

const defaultInvertParams: Dipolo2DInvertParams = res2dinvDataPreset;

const defaultVolumeParams: VolumeBuildParams = {
  nx: 40,
  ny: 40,
  nz: 20,
  interpMethod: "idw",
  engine: "browser",
  idwPower: 2,
  maxInfluenceM: 120,
  zMaxM: 60,
  followTerrain: true,
  krigingVariogram: "spherical",
};

function emptyLine(index: number): GeophysSurveyLine {
  return {
    id: newLineId(),
    name: `Linha ${index + 1}`,
    readings: [],
    geometry: defaultSurveyLineGeometry(index),
    invertParams: { ...defaultInvertParams },
  };
}

export function Volume3DClient() {
  const [tab, setTab] = useState<TabId>("dados");
  const [lines, setLines] = useState<GeophysSurveyLine[]>(() => [
    emptyLine(0),
    emptyLine(1),
  ]);
  const [volumeParams, setVolumeParams] =
    useState<VolumeBuildParams>(defaultVolumeParams);
  const [volume, setVolume] = useState<ResistivityVolume3D | null>(null);
  const [depthM, setDepthM] = useState(15);
  const [verticalSliceAxis, setVerticalSliceAxis] = useState<"x" | "y">("x");
  const [verticalSlicePos, setVerticalSlicePos] = useState(0);
  const [showSections, setShowSections] = useState(true);
  const [showHorizontalSlice, setShowHorizontalSlice] = useState(true);
  const [showVerticalSlice, setShowVerticalSlice] = useState(false);
  const [showIsosurface, setShowIsosurface] = useState(false);
  const [showBlockModel, setShowBlockModel] = useState(true);
  const [blockOpacity, setBlockOpacity] = useState(0.88);
  const [blockDecimate, setBlockDecimate] = useState(1);
  const [isoLogRho, setIsoLogRho] = useState(2);
  const [sectionOpacity, setSectionOpacity] = useState(0.85);
  const [sliceOpacity, setSliceOpacity] = useState(0.75);
  const [isoOpacity, setIsoOpacity] = useState(0.5);
  const [clipEnabled, setClipEnabled] = useState(false);
  const [clipDepthM, setClipDepthM] = useState<number | null>(30);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [interpretation, setInterpretation] = useState<VolumeAiResult | null>(
    null,
  );
  const [interpBusy, setInterpBusy] = useState(false);
  const [projectOrigin, setProjectOrigin] =
    useState<SectionPoint3D>(defaultProjectOrigin);
  const [expandedGeorefId, setExpandedGeorefId] = useState<string | null>(null);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [pickTarget, setPickTarget] = useState<"start" | "end" | null>(null);
  const [mapDrawState, setMapDrawState] = useState<MapDrawState | null>(null);
  const [sectionsVersion, setSectionsVersion] = useState(0);
  const [coordInputMode, setCoordInputMode] =
    useState<CoordInputMode>("wgs84");
  const [utmFuso, setUtmFuso] = useState(defaultUtmFusoBrasil);
  const [demBusy, setDemBusy] = useState(false);
  const [terrainBusy, setTerrainBusy] = useState(false);
  const [xyzCloudSamples, setXyzCloudSamples] = useState<VolumeSamplePoint3D[]>(
    [],
  );
  const [rhoFilter, setRhoFilter] =
    useState<VolumeRhoFilter>(DEFAULT_RHO_FILTER);
  const [mapFitToken, setMapFitToken] = useState(0);
  const [kmlTracks, setKmlTracks] = useState<ImportedKmlTrack[]>([]);
  const [lineKmlAssignment, setLineKmlAssignment] = useState<
    Record<string, string>
  >({});
  const [highlightedKmlTrackId, setHighlightedKmlTrackId] = useState<
    string | null
  >(null);

  const surveyAnchor = useMemo(() => {
    try {
      return computeSurveyAnchor(lines);
    } catch {
      return { lat: projectOrigin.x, lng: projectOrigin.y };
    }
  }, [lines, projectOrigin]);

  useEffect(() => {
    if (!activeLineId && lines[0]) {
      setActiveLineId(lines[0].id);
    }
  }, [activeLineId, lines]);

  const invertedCount = useMemo(
    () => lines.filter((l) => l.invertResult).length,
    [lines],
  );

  const activeLine = useMemo(
    () => lines.find((l) => l.id === activeLineId) ?? null,
    [lines, activeLineId],
  );

  const handleLineTopographyChange = useCallback(
    (lineId: string, topography: TopographyPoint[]) => {
      setLines((prev) =>
        prev.map((l) => {
          if (l.id !== lineId) return l;
          if (topography.length < 2) {
            return {
              ...l,
              topography: topography.length > 0 ? topography : undefined,
            };
          }
          return applyTopographyToLineGeometry(l, topography);
        }),
      );
    },
    [],
  );

  const reapplyVolumeTerrain = useCallback(async () => {
    if (!volume) {
      setNotice("Gere o volume 3D antes de aplicar topografia.");
      return;
    }
    setTerrainBusy(true);
    try {
      const inverted = lines.filter((l) => l.invertResult);
      const source = inverted.length > 0 ? inverted : lines;
      const params = { ...volumeParams, followTerrain: true };
      const hasProfileTopo = surveyHasProfileTopography(source);
      const updated = hasProfileTopo
        ? attachTerrainSurfaceToVolume(volume, source, params)
        : await attachTerrainSurfaceToVolumeAsync(volume, source, params);
      setVolume(updated);
      setVolumeParams((p) => ({ ...p, followTerrain: true }));
      const topoLines = lines.filter((l) => lineHasTerrainData(l)).length;
      setNotice(
        topoLines > 0
          ? `Topografia aplicada (${topoLines} linha(s)) — blocos e perfis acompanham o terreno.`
          : "Terreno DEM aplicado à grelha do volume.",
      );
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "Falha ao aplicar topografia ao volume.",
      );
    } finally {
      setTerrainBusy(false);
    }
  }, [volume, lines, volumeParams]);

  const volumeStats = useMemo(
    () => (volume ? volumeLogRhoStats(volume) : null),
    [volume],
  );

  const updateLine = useCallback(
    (id: string, patch: Partial<GeophysSurveyLine>) => {
      setLines((prev) =>
        prev.map((l) => (l.id === id ? { ...l, ...patch } : l)),
      );
    },
    [],
  );

  const loadProjectSections = useCallback(
    (ids: string[] | "all") => {
      const project = loadGeophysProject();
      const selected =
        ids === "all"
          ? project.sections
          : project.sections.filter(
              (s) => ids.includes(s.id) || ids.includes(s.code),
            );
      if (selected.length === 0) {
        setNotice("Nenhuma secção guardada no projeto.");
        return;
      }

      const missingModel = selected.filter((s) => !s.invertResult);
      if (missingModel.length > 0) {
        setNotice(
          `${missingModel.length} secção(ões) sem modelo guardado — volte a guardar no Dipolo-Dipolo (com inversão calculada).`,
        );
      }

      let newLines = savedSectionsToSurveyLines(selected).map((line) =>
        line.topography && line.topography.length >= 2
          ? applyTopographyToLineGeometry(line, line.topography)
          : line,
      );
      const fromDipolo = newLines.filter((l) => l.invertResult).length;
      const withTopo = countProfileTopographyLines(newLines);

      setLines(newLines);
      setVolume(null);
      const inverted = newLines.filter((l) => l.invertResult).length;
      const dipoloNote =
        fromDipolo > 0
          ? ` · ${fromDipolo} com modelo já calculado`
          : "";
      const topoNote =
        withTopo > 0 ? ` · topografia de perfil (${withTopo} linha(s))` : "";
      setNotice(
        inverted > 0
          ? `${selected.length} secção(ões) importada(s); ${inverted} pronta(s) para interpolação (sem re-inversão)${topoNote}${dipoloNote}.`
          : `${selected.length} secção(ões) importada(s) — nenhuma com modelo invertido${topoNote}.`,
      );
    },
    [],
  );

  useEffect(() => {
    const pending = consumePendingVolumeLoad();
    if (pending) {
      loadProjectSections(pending);
    }
  }, [loadProjectSections]);

  const saveLineToProject = useCallback((lineId: string) => {
    const line = lines.find((l) => l.id === lineId);
    if (!line?.invertResult) {
      setNotice("Inverta a linha antes de guardar no projeto.");
      return;
    }
    const project = loadGeophysProject();
    const section = buildSavedSectionFromSurveyLine(line, project.sections, {
      lineIndex: project.sections.length,
    });
    if (!section) return;
    persistGeophysSection(section);
    setSectionsVersion((v) => v + 1);
    setNotice(`${section.code} guardada no projeto.`);
  }, [lines]);

  const addLine = useCallback(() => {
    const line = emptyLine(lines.length);
    setLines((prev) => [...prev, line]);
    setActiveLineId(line.id);
    setExpandedGeorefId(line.id);
    setMapDrawState(null);
    setPickTarget(null);
    setNotice("Nova linha — edite Lat/Lng de A e B nos campos abaixo.");
  }, [lines.length]);

  const addLineManual = useCallback(() => {
    const line = emptyLine(lines.length);
    setLines((prev) => [...prev, line]);
    setActiveLineId(line.id);
    setExpandedGeorefId(line.id);
    setPickTarget(null);
    setMapDrawState({ lineId: line.id, step: "start" });
    setNotice(
      "Linha manual: clique no mapa para o ponto A, depois para o ponto B.",
    );
  }, [lines.length]);

  const cancelMapDraw = useCallback(() => {
    setMapDrawState(null);
    setPickTarget(null);
    setNotice("Desenho no mapa cancelado.");
  }, []);

  const importKmlKmzFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArr = Array.from(files);
      if (fileArr.length === 0) return;

      const { tracks, warnings } = await parseKmlKmzFiles(
        fileArr,
        kmlTracks.length,
      );
      if (tracks.length === 0) {
        setNotice(
          warnings[0] ??
            "Nenhuma linha (LineString) ou par de pontos nos ficheiros KML/KMZ.",
        );
        return;
      }

      setMapDrawState(null);
      setPickTarget(null);
      setKmlTracks((prev) => [...prev, ...tracks]);
      setMapFitToken((t) => t + 1);

      const warnSuffix =
        warnings.length > 0 ? ` Avisos: ${warnings.slice(0, 3).join(" ")}` : "";
      setNotice(
        `${tracks.length} percurso(s) de ${fileArr.length} ficheiro(s) adicionado(s) ao mapa. Associe cada secção ao percurso desejado.${warnSuffix}`,
      );
    },
    [kmlTracks.length],
  );

  const applyTrackToLine = useCallback(
    (lineId: string, track: ImportedKmlTrack) => {
      const geometry = kmlFeatureToSurveyGeometry(track);
      const topo = kmlFeatureToTopography(track);
      const distM = kmlPathLengthM(track.coordinates);
      const line = lines.find((l) => l.id === lineId);

      updateLine(lineId, {
        geometry,
        topography: topo ?? line?.topography,
        name: track.name && track.name !== `Linha ${track.featureIndex + 1}`
          ? track.name
          : line?.name,
      });
      setLineKmlAssignment((prev) => ({ ...prev, [lineId]: track.id }));
      setVolume(null);
      setActiveLineId(lineId);
      setExpandedGeorefId(lineId);
      setHighlightedKmlTrackId(track.id);
      setMapFitToken((t) => t + 1);

      return {
        lineName: line?.name ?? "Secção",
        distM,
        hasTopo: Boolean(topo),
      };
    },
    [lines, updateLine],
  );

  const assignKmlTrackToLine = useCallback(
    (lineId: string, trackId: string | null) => {
      if (!trackId) {
        setLineKmlAssignment((prev) => {
          const next = { ...prev };
          delete next[lineId];
          return next;
        });
        setNotice("Associação KML removida.");
        return;
      }

      const track = kmlTracks.find((t) => t.id === trackId);
      if (!track) return;

      const { lineName, distM, hasTopo } = applyTrackToLine(lineId, track);
      setNotice(
        `«${lineName}» → ${track.fileName} · ${track.name} (${distM.toFixed(0)} m).` +
          (hasTopo ? " Topografia aplicada." : ""),
      );
    },
    [kmlTracks, applyTrackToLine],
  );

  const importKmlKmzForLine = useCallback(
    async (lineId: string, files: FileList | File[]) => {
      const fileArr = Array.from(files);
      if (fileArr.length === 0) return;

      const { tracks, warnings } = await parseKmlKmzFiles(
        fileArr,
        kmlTracks.length,
      );
      if (tracks.length === 0) {
        setNotice(
          warnings[0] ??
            "Nenhuma linha (LineString) ou par de pontos no KML/KMZ.",
        );
        return;
      }

      setMapDrawState(null);
      setPickTarget(null);
      setKmlTracks((prev) => [...prev, ...tracks]);

      const track = tracks[0]!;
      const { lineName, distM, hasTopo } = applyTrackToLine(lineId, track);

      const warnSuffix =
        warnings.length > 0 ? ` ${warnings.slice(0, 2).join(" ")}` : "";
      if (tracks.length > 1) {
        setNotice(
          `«${lineName}» ← ${track.fileName} · ${track.name} (${distM.toFixed(0)} m). ` +
            `Ficheiro com ${tracks.length} percursos — os restantes ficam no mapa para outras secções.${warnSuffix}`,
        );
      } else {
        setNotice(
          `«${lineName}» georreferenciada via «${track.fileName}» (${distM.toFixed(0)} m).` +
            (hasTopo ? " Topografia do percurso aplicada." : "") +
            warnSuffix,
        );
      }
    },
    [kmlTracks.length, applyTrackToLine],
  );

  const handleKmlTrackSelect = useCallback(
    (trackId: string) => {
      setHighlightedKmlTrackId(trackId);
      const track = kmlTracks.find((t) => t.id === trackId);
      if (!track) return;

      if (activeLineId) {
        assignKmlTrackToLine(activeLineId, trackId);
        return;
      }

      setNotice(
        `Percurso «${track.fileName} · ${track.name}» — seleccione uma secção e clique novamente ou use o menu.`,
      );
    },
    [activeLineId, assignKmlTrackToLine, kmlTracks],
  );

  const removeKmlTrack = useCallback((trackId: string) => {
    setKmlTracks((prev) => prev.filter((t) => t.id !== trackId));
    setLineKmlAssignment((prev) => {
      const next = { ...prev };
      for (const [lineId, tid] of Object.entries(next)) {
        if (tid === trackId) delete next[lineId];
      }
      return next;
    });
    if (highlightedKmlTrackId === trackId) setHighlightedKmlTrackId(null);
  }, [highlightedKmlTrackId]);

  const applyEndpoint = useCallback(
    (
      lineId: string,
      target: "start" | "end",
      lat: number,
      lng: number,
    ) => {
      const line = lines.find((l) => l.id === lineId);
      if (!line) return;
      const prevZ =
        target === "start" ? line.geometry.start.z : line.geometry.end.z;
      const point = mapClickToGeometryPoint(
        lat,
        lng,
        prevZ,
        line,
        projectOrigin,
      );
      const geometry = refreshLineAzimuth({
        ...line.geometry,
        projectOrigin:
          line.geometry.coordMode === "project"
            ? projectOrigin
            : line.geometry.projectOrigin,
        [target]: point,
      });
      updateLine(lineId, { geometry });
    },
    [lines, projectOrigin, updateLine],
  );

  const handleMapPick = (
    lineId: string,
    target: "start" | "end",
    lat: number,
    lng: number,
  ) => {
    applyEndpoint(lineId, target, lat, lng);
    setPickTarget(null);
    setNotice(`Ponto ${target === "start" ? "A" : "B"} actualizado no mapa.`);
  };

  const handleDrawPoint = (
    lineId: string,
    target: "start" | "end",
    lat: number,
    lng: number,
  ) => {
    applyEndpoint(lineId, target, lat, lng);
    if (target === "start") {
      setMapDrawState({
        lineId,
        step: "end",
        previewStart: { lat, lng },
      });
      setNotice("Ponto A definido. Clique no mapa para o ponto B (final).");
      return;
    }
    setMapDrawState(null);
    setNotice("Linha inserida manualmente no mapa.");
  };

  const handleEndpointDrag = (
    lineId: string,
    target: "start" | "end",
    lat: number,
    lng: number,
  ) => {
    applyEndpoint(lineId, target, lat, lng);
    setActiveLineId(lineId);
    setNotice(`Ponto ${target === "start" ? "A" : "B"} movido no mapa.`);
  };

  const applyDemTopography = useCallback(
    async (lineId: string | "all") => {
      const targets =
        lineId === "all"
          ? lines
          : lines.filter((l) => l.id === lineId);
      if (targets.length === 0) {
        setNotice("Nenhuma linha seleccionada.");
        return;
      }

      setDemBusy(true);
      let ok = 0;

      try {
        for (const line of targets) {
          try {
            const updated = await fetchDemTopographyForLine(line);
            updateLine(line.id, {
              topography: updated.topography,
              geometry: updated.geometry,
            });
            ok++;
          } catch (e) {
            setNotice(
              e instanceof Error
                ? `${line.name}: ${e.message}`
                : `${line.name}: falha ao obter cotas DEM.`,
            );
          }
        }

        if (ok > 0) {
          setNotice(
            `${ok} linha(s): topografia DEM aplicada — cotas A/B e perfil actualizados.`,
          );
        }
      } catch (e) {
        setNotice(
          e instanceof Error ? e.message : "Erro ao consultar base DEM.",
        );
      } finally {
        setDemBusy(false);
      }
    },
    [lines, updateLine],
  );

  const removeLine = (id: string) => {
    setLines((prev) => (prev.length <= 2 ? prev : prev.filter((l) => l.id !== id)));
    if (mapDrawState?.lineId === id) setMapDrawState(null);
  };

  const importFile = async (id: string, file: File, lineIndex: number) => {
    const text = await file.text();
    const lower = file.name.toLowerCase();
    try {
      if (lower.endsWith(".xyz")) {
        const parsed = parseXyzFile(text, file.name);
        if (!parsed) {
          setNotice("Ficheiro XYZ não reconhecido.");
          return;
        }
        const readings = xyzToDipoloReadings(parsed);
        const topography = xyzToTopography(parsed);
        const reg = registerLineFromXyz(parsed, lineIndex);
        const anchor = computeSurveyAnchor(lines);
        const cloud = xyzParseToVolumeSamples(
          parsed,
          anchor.lat,
          anchor.lng,
          id,
        );
        if (cloud.length > 0) {
          setXyzCloudSamples((prev) => [...prev, ...cloud]);
        }
        updateLine(id, {
          readings,
          topography,
          geometry: reg?.geometry ?? defaultSurveyLineGeometry(lineIndex),
          name: parsed.title ?? file.name.replace(/\.xyz$/i, ""),
        });
        setNotice(
          `XYZ: ${parsed.points.length} pontos 3D → ${readings.length} estações · ${cloud.length} amostras voxel.`,
        );
        return;
      }

      if (lower.endsWith(".dat") || lower.endsWith(".txt")) {
        const parsed = parseRes2dinvDatWithTopography(text);
        if (!parsed) {
          setNotice("Ficheiro RES2DINV (.dat/.txt) não reconhecido.");
          return;
        }
        const linha = res2dinvToSolodataLinha(parsed);
        const readings = activeReadingsForInversion(
          solodataLinhaToReadings(linha, parsed.unitSpacingM ?? 15),
        );
        const topo =
          parsed.topography.length >= 2 ? parsed.topography : undefined;
        const reg = registerLineFromReadings(
          readings,
          topo,
          lineIndex,
        );
        const invertResult =
          parsePrecalculatedInvertResult(text, readings, defaultInvertParams) ??
          undefined;
        updateLine(id, {
          readings,
          topography: topo,
          geometry: reg.geometry,
          name: parsed.title ?? file.name.replace(/\.(dat|txt)$/i, ""),
          invertResult,
        });
        const topoNote =
          topo && topo.length >= 2
            ? ` · topografia ${topo.length} pts (${topo[0]!.elevationM.toFixed(1)}–${topo[topo.length - 1]!.elevationM.toFixed(1)} m)`
            : " · sem topografia no ficheiro";
        const modelNote = invertResult
          ? ` · modelo ${invertResult.nx}×${invertResult.nz} (já calculado)`
          : "";
        setNotice(
          `RES2DINV: ${readings.length} leituras${topoNote}${modelNote} · az ${reg.azimuthDeg.toFixed(0)}° · a=${reg.spacingM} m.`,
        );
        return;
      }

      const bundle = parseDipoloImportFile(text, file.name);
      if (!bundle) {
        setNotice("Formato não reconhecido (CSV/TXT/DAT).");
        return;
      }
      const reg = registerLineFromReadings(
        bundle.readings,
        bundle.topography,
        lineIndex,
      );
      const lineTopography =
        bundle.topography.length >= 2 ? bundle.topography : undefined;
      const lineWithTopo = lineTopography
        ? applyTopographyToLineGeometry(
            {
              id,
              name: bundle.title ?? file.name.replace(/\.[^.]+$/, ""),
              readings: bundle.readings,
              topography: lineTopography,
              geometry: reg.geometry,
            },
            lineTopography,
          )
        : null;
      updateLine(id, {
        readings: bundle.readings,
        topography: lineTopography,
        geometry: lineWithTopo?.geometry ?? reg.geometry,
        invertResult: bundle.invertResult,
        name: bundle.title ?? file.name.replace(/\.[^.]+$/, ""),
      });
      const topoNote =
        bundle.topography.length >= 2
          ? ` · topografia ${bundle.topography.length} pts`
          : "";
      const modelNote = bundle.invertResult
        ? ` · modelo ${bundle.invertResult.nx}×${bundle.invertResult.nz} (já calculado)`
        : "";
      setNotice(
        `Importado: ${bundle.readings.length} leituras${topoNote}${modelNote} · ${reg.lineLengthM.toFixed(0)} m · az ${reg.azimuthDeg.toFixed(0)}°.`,
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Erro na importação.");
    }
  };

  const importMultiple = async (files: FileList) => {
    const arr = [...files];
    for (let i = 0; i < arr.length; i++) {
      const file = arr[i]!;
      let targetId = lines[i]?.id;
      if (!targetId) {
        const nl = emptyLine(lines.length + i);
        setLines((prev) => [...prev, nl]);
        targetId = nl.id;
      }
      await importFile(targetId, file, i);
    }
  };

  const invertLine = (id: string) => {
    const line = lines.find((l) => l.id === id);
    if (!line || line.readings.length === 0) {
      setNotice("Linha sem leituras.");
      return;
    }
    const params = line.invertParams ?? defaultInvertParams;
    const active = line.readings.filter((r) => !r.excluded);
    if (active.length < 4) {
      setNotice("Mínimo 4 leituras activas para inversão.");
      return;
    }
    try {
      const result = invertDipolo2D(active, params, "smoothness");
      if (!result) {
        setNotice(`${line.name}: inversão falhou (dados insuficientes).`);
        return;
      }
      updateLine(id, { invertResult: result });
      setNotice(`${line.name}: RMS log₁₀ = ${result.rmsLog10.toFixed(4)}`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Erro na inversão.");
    }
  };

  const invertAll = () => {
    setBusy(true);
    let ok = 0;
    setLines((prev) =>
      prev.map((line) => {
        if (line.readings.length === 0) return line;
        const params = line.invertParams ?? defaultInvertParams;
        const active = line.readings.filter((r) => !r.excluded);
        if (active.length < 4) return line;
        try {
          const result = invertDipolo2D(active, params, "smoothness");
          if (!result) return line;
          ok++;
          return { ...line, invertResult: result };
        } catch {
          return line;
        }
      }),
    );
    setBusy(false);
    setNotice(
      ok >= 2
        ? `Inversão concluída: ${ok} linha(s) pronta(s) para o volume 3D.`
        : ok === 1
          ? "Só 1 linha invertida — são necessárias pelo menos 2."
          : "Nenhuma linha invertida. Verifique leituras (mín. 4 activas por linha).",
    );
  };

  const buildVolume = async () => {
    const inverted = lines.filter((l) => l.invertResult);
    if (inverted.length < 2) {
      const withReadings = lines.filter((l) => l.readings.length >= 4).length;
      setNotice(
        withReadings >= 2
          ? "Importe secções com modelo já calculado (Dipolo-Dipolo) ou ficheiros com modelo invertido. Só falta inversão local se importou apenas leituras ρa."
          : "Importe ≥2 secções com modelo invertido (Dipolo-Dipolo) ou ficheiros RES2DINV/DataGeo completos.",
      );
      return;
    }
    setBusy(true);
    try {
      let buildLines = [...lines];

      const profileTopoCount = countProfileTopographyLines(inverted);
      const useProfileTerrain =
        volumeParams.followTerrain !== false && profileTopoCount > 0;

      if (volumeParams.followTerrain !== false && profileTopoCount === 0) {
        setNotice("A obter cotas DEM do mapa (linhas sem topografia de perfil)…");
        let demLinesOk = 0;
        let demLinesFail = 0;
        for (const line of inverted) {
          if (lineHasTerrainData(line)) continue;
          try {
            const updated = await fetchDemTopographyForLine(line);
            if (updated) {
              buildLines = buildLines.map((l) =>
                l.id === line.id ? updated : l,
              );
              updateLine(line.id, {
                topography: updated.topography,
                geometry: updated.geometry,
              });
              demLinesOk++;
            }
          } catch {
            demLinesFail++;
          }
        }
        if (demLinesFail > 0 && demLinesOk === 0) {
          setNotice(
            `${demLinesFail} linha(s): DEM indisponível nos perfis — a tentar grelha do volume…`,
          );
        }
      } else if (useProfileTerrain) {
        buildLines = buildLines.map((line) =>
          line.topography && line.topography.length >= 2
            ? applyTopographyToLineGeometry(line, line.topography)
            : line,
        );
        setNotice(
          `A interpolar volume 3D com topografia de perfil (${profileTopoCount} linha(s))…`,
        );
      }

      if (!useProfileTerrain) {
        setNotice("A interpolar volume 3D e aplicar terreno (DEM)…");
      }

      const buildParams = { ...volumeParams };
      const sectionMaxDepth = Math.max(
        0,
        ...buildLines
          .filter((l) => l.invertResult)
          .map((l) => invertResultDepthM(l.invertResult!)),
      );
      if (sectionMaxDepth > 0 && sectionMaxDepth > buildParams.zMaxM * 0.98) {
        buildParams.zMaxM = Math.max(
          buildParams.zMaxM,
          Math.ceil(sectionMaxDepth / 5) * 5,
        );
      }

      const vol = await buildVolume3D(buildLines, buildParams, xyzCloudSamples);
      if (!vol) {
        setNotice("Falha ao gerar volume (verifique geometria das linhas no mapa).");
        return;
      }
      const valid = countValidVolumeCells(vol);
      if (valid === 0) {
        setNotice(
          "Volume vazio: aumente «Influência IDW» (m) ou afaste/paralelize as linhas no mapa (mín. ~20 m entre perfis).",
        );
        return;
      }
      setVolume(vol);
      setDepthM(volumeParams.zMaxM / 4);
      setVerticalSlicePos((vol.boundsM.minX + vol.boundsM.maxX) / 2);
      const stats = volumeLogRhoStats(vol);
      if (stats) {
        setIsoLogRho((stats.min + stats.max) / 2);
        setRhoFilter(filterFromVolumeStats(stats.min, stats.max));
      }
      setTab("volume");
      setShowBlockModel(true);
      setShowSections(true);
      setShowHorizontalSlice(true);
      const terrainNote = vol.followTerrain
        ? surveyHasProfileTopography(buildLines)
          ? ` · topografia de perfil (ref. ${vol.surfaceRefM?.toFixed(1)} m ASL)`
          : ` · terreno DEM (ref. ${vol.surfaceRefM?.toFixed(1)} m ASL)`
        : buildParams.followTerrain !== false
          ? " · aviso: terreno não aplicado (verifique topografia ou posição no mapa)"
          : "";
      setNotice(
        `Modelo 3D: ${vol.nx}×${vol.ny}×${vol.nz} células · ${valid.toLocaleString()} blocos válidos (${volumeParams.interpMethod})${terrainNote}.`,
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Erro ao gerar volume.");
    } finally {
      setBusy(false);
    }
  };

  const exportBlocks = () => {
    if (!volume || !volumeStats) return;
    const csv = exportBlockModelCsv(volume, {
      logLo: volumeStats.min,
      logHi: volumeStats.max,
      decimate: blockDecimate,
      clipDepthM: clipEnabled ? clipDepthM : null,
    });
    downloadTextFile("modelo-blocos-ert.csv", csv, "text/csv;charset=utf-8");
    setNotice("Modelo de blocos exportado (CSV).");
  };

  const blockSummary = useMemo(
    () => (volume ? blockModelSummary(volume) : null),
    [volume],
  );

  const rhoBandStats = useMemo(() => {
    if (!volume) return null;
    return computeRhoBandVolumeStats(
      volume,
      rhoFilter,
      clipEnabled ? clipDepthM : null,
    );
  }, [volume, rhoFilter, clipEnabled, clipDepthM]);

  const runInterpretation = async () => {
    if (!volume || !volumeStats) return;
    setInterpBusy(true);
    try {
      const res = await fetch("/api/geofisica/volume/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: volume.anchorLat,
          lng: volume.anchorLng,
          lineCount: invertedCount,
          logRhoMin: volumeStats.min,
          logRhoMax: volumeStats.max,
          logRhoMean: volumeStats.mean,
          depthMaxM: volume.boundsM.maxZ,
          method: volumeParams.interpMethod,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        interpretation?: VolumeAiResult;
        error?: string;
      };
      if (data.ok && data.interpretation) {
        setInterpretation(data.interpretation);
        setTab("interpretacao");
      } else {
        setNotice(data.error ?? "Interpretação falhou.");
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Erro IA.");
    } finally {
      setInterpBusy(false);
    }
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: "dados", label: "Dados" },
    { id: "volume", label: "Volume 3D" },
    { id: "interpretacao", label: "IA" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-10">
      <div>
        <Link
          href="/geofisica"
          className="text-sm text-teal-700 hover:underline dark:text-teal-400"
        >
          ← Geofísica
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-[var(--text)]">
          Modelo 3D — Geofísica multi-secção
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
          Múltiplas secções invertidas (Dipolo-Dipolo) ou nuvem XYZ → grade
          voxel 3D com IDW / Kriging / RBF (Python + NumPy/SciPy/GSTools) →
          visualização React Three Fiber: blocos, fatias, iso-superfícies,
          clipping e filtro por faixa de resistividade.
        </p>
      </div>

      {notice && (
        <div className="rounded-lg border border-teal-600/30 bg-teal-50 px-4 py-2 text-sm text-teal-900 dark:bg-teal-950/40 dark:text-teal-100">
          {notice}
        </div>
      )}

      <div className="flex gap-1 border-b border-[var(--border)]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium ${
              tab === t.id
                ? "border-b-2 border-teal-600 text-teal-700 dark:text-teal-400"
                : "text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dados" && (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Linhas geofísicas</h2>
            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--bg)]">
                Upload múltiplo
                <input
                  type="file"
                  accept=".dat,.csv,.txt,.tsv,.xyz"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const fs = e.target.files;
                    if (fs?.length) void importMultiple(fs);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => loadProjectSections("all")}
                className="rounded-lg border border-teal-600/40 px-3 py-1.5 text-sm text-teal-800 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-950/30"
              >
                Importar secções do Dipolo-Dipolo
              </button>
              <button
                type="button"
                onClick={addLineManual}
                className="rounded-lg border border-teal-600/50 bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-900 hover:bg-teal-100 dark:bg-teal-950/30 dark:text-teal-100"
              >
                + Linha manual (mapa)
              </button>
              <label className="cursor-pointer rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--bg)]">
                Importar KML/KMZ (mapa)
                <input
                  type="file"
                  accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const fs = e.target.files;
                    if (fs?.length) void importKmlKmzFiles(fs);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                type="button"
                onClick={addLine}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
              >
                + Linha por coordenadas
              </button>
              {lines.some((l) => !l.invertResult && l.readings.length >= 4) && (
                <button
                  type="button"
                  onClick={invertAll}
                  disabled={busy}
                  className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                >
                  Inverter leituras (sem modelo)
                </button>
              )}
              <button
                type="button"
                onClick={() => void buildVolume()}
                disabled={busy || invertedCount < 2}
                className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Interpolar → modelo de blocos
              </button>
            </div>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-[var(--muted)]">
              Interpolação
              <select
                value={volumeParams.interpMethod}
                onChange={(e) =>
                  setVolumeParams((p) => ({
                    ...p,
                    interpMethod: e.target.value as VolumeInterpMethod,
                    engine:
                      e.target.value === "kriging" || e.target.value === "rbf"
                        ? "python"
                        : p.engine,
                  }))
                }
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
              >
                <option value="idw">IDW</option>
                <option value="kriging">Kriging (Python)</option>
                <option value="rbf">RBF (Python)</option>
                <option value="nearest">Nearest</option>
              </select>
            </label>
            <label className="text-xs text-[var(--muted)]">
              Motor
              <select
                value={volumeParams.engine}
                onChange={(e) =>
                  setVolumeParams((p) => ({
                    ...p,
                    engine: e.target.value as VolumeEngine,
                  }))
                }
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
              >
                <option value="browser">Browser (TS)</option>
                <option value="python">Python FastAPI</option>
              </select>
            </label>
            <label className="text-xs text-[var(--muted)]">
              Malha NX×NY×NZ
              <div className="mt-1 flex gap-1">
                {(["nx", "ny", "nz"] as const).map((key) => (
                  <input
                    key={key}
                    type="number"
                    min={8}
                    max={80}
                    value={volumeParams[key]}
                    onChange={(e) =>
                      setVolumeParams((p) => ({
                        ...p,
                        [key]: Number(e.target.value) || p[key],
                      }))
                    }
                    className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-1 py-1 text-sm"
                  />
                ))}
              </div>
            </label>
            <label className="text-xs text-[var(--muted)]">
              Z max (m): {volumeParams.zMaxM}
              <input
                type="range"
                min={20}
                max={120}
                value={volumeParams.zMaxM}
                onChange={(e) =>
                  setVolumeParams((p) => ({
                    ...p,
                    zMaxM: Number(e.target.value),
                  }))
                }
                className="mt-1 w-full"
              />
            </label>
            <label className="text-xs text-[var(--muted)]">
              Influência IDW (m): {volumeParams.maxInfluenceM}
              <input
                type="range"
                min={40}
                max={300}
                step={10}
                value={volumeParams.maxInfluenceM}
                onChange={(e) =>
                  setVolumeParams((p) => ({
                    ...p,
                    maxInfluenceM: Number(e.target.value),
                  }))
                }
                className="mt-1 w-full"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <input
                type="checkbox"
                checked={volumeParams.followTerrain !== false}
                onChange={(e) =>
                  setVolumeParams((p) => ({
                    ...p,
                    followTerrain: e.target.checked,
                  }))
                }
                className="rounded"
              />
              Modelo de blocos com topografia (perfil / DEM)
            </label>
            {(volumeParams.interpMethod === "kriging" ||
              volumeParams.engine === "python") && (
              <label className="text-xs text-[var(--muted)]">
                Variograma Kriging
                <select
                  value={volumeParams.krigingVariogram ?? "spherical"}
                  onChange={(e) =>
                    setVolumeParams((p) => ({
                      ...p,
                      krigingVariogram: e.target.value as
                        | "spherical"
                        | "exponential"
                        | "gaussian",
                    }))
                  }
                  className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm"
                >
                  <option value="spherical">Esferico</option>
                  <option value="exponential">Exponencial</option>
                  <option value="gaussian">Gaussiano</option>
                </select>
              </label>
            )}
            {volumeParams.interpMethod === "rbf" && (
              <label className="text-xs text-[var(--muted)]">
                RBF ε (auto se vazio)
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  placeholder="auto"
                  value={volumeParams.rbfEpsilon ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    setVolumeParams((p) => ({
                      ...p,
                      rbfEpsilon: v ? Number(v) : null,
                    }));
                  }}
                  className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm"
                />
              </label>
            )}
          </div>

          {xyzCloudSamples.length > 0 && (
            <p className="mb-2 text-xs text-teal-800 dark:text-teal-300">
              Nuvem XYZ: {xyzCloudSamples.length.toLocaleString()} amostras 3D
              acumuladas para interpolação.
            </p>
          )}

          <div className="mb-3 flex flex-wrap items-end gap-2">
            <label className="text-xs text-[var(--muted)]">
              Entrada coordenadas
              <select
                value={coordInputMode}
                onChange={(e) =>
                  setCoordInputMode(e.target.value as CoordInputMode)
                }
                className="mt-1 block rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm"
              >
                <option value="wgs84">WGS84 (Lat / Lng)</option>
                <option value="utm">UTM (E / N)</option>
              </select>
            </label>
            {coordInputMode === "utm" && (
              <label className="text-xs text-[var(--muted)]">
                Fuso UTM
                <input
                  type="text"
                  value={utmFuso}
                  onChange={(e) => setUtmFuso(e.target.value.toUpperCase())}
                  placeholder="22S"
                  className="mt-1 w-24 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm uppercase"
                />
              </label>
            )}
            <span className="text-xs text-[var(--muted)]">
              Mapa — linha activa:{" "}
              <strong className="text-[var(--text)]">
                {lines.find((l) => l.id === activeLineId)?.name ?? "nenhuma"}
              </strong>
            </span>
            <button
              type="button"
              disabled={!activeLineId}
              onClick={() => {
                setMapDrawState(null);
                setPickTarget("start");
                setNotice("Clique no mapa ou arraste o marcador verde (A).");
              }}
              className="rounded border border-[var(--border)] px-2 py-0.5 text-xs disabled:opacity-40"
            >
              Definir A
            </button>
            <button
              type="button"
              disabled={!activeLineId}
              onClick={() => {
                setMapDrawState(null);
                setPickTarget("end");
                setNotice("Clique no mapa ou arraste o marcador vermelho (B).");
              }}
              className="rounded border border-[var(--border)] px-2 py-0.5 text-xs disabled:opacity-40"
            >
              Definir B
            </button>
            {(mapDrawState || pickTarget) && (
              <button
                type="button"
                onClick={cancelMapDraw}
                className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-700 dark:text-red-400"
              >
                Cancelar
              </button>
            )}
            <button
              type="button"
              disabled={!activeLineId || demBusy}
              onClick={() => activeLineId && void applyDemTopography(activeLineId)}
              className="rounded border border-emerald-600/40 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-40 dark:bg-emerald-950/30 dark:text-emerald-100"
              title="Consulta SRTM/ASTER (OpenTopoData) ao longo do perfil"
            >
              {demBusy ? "DEM…" : "Cotas do mapa (DEM)"}
            </button>
            <button
              type="button"
              disabled={demBusy || lines.length === 0}
              onClick={() => void applyDemTopography("all")}
              className="rounded border border-emerald-600/30 px-2 py-0.5 text-xs text-emerald-800 disabled:opacity-40 dark:text-emerald-300"
            >
              DEM todas
            </button>
            <label className="cursor-pointer rounded border border-teal-600/40 bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-900 hover:bg-teal-100 dark:bg-teal-950/30 dark:text-teal-100">
              + KML/KMZ
              <input
                type="file"
                accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz"
                multiple
                className="hidden"
                onChange={(e) => {
                  const fs = e.target.files;
                  if (fs?.length) void importKmlKmzFiles(fs);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <p className="mb-2 text-[10px] text-[var(--muted)]">
            Importe um ou vários KML/KMZ — os percursos ficam no mapa (cores
            distintas). Associe cada secção ao percurso no menu da linha ou
            clique no percurso com a secção activa.
          </p>
          <p className="mb-2 text-[10px] text-[var(--muted)]">
            Cotas do perfil via modelo digital de terreno (SRTM 30 m / ASTER) —
            alinhado às estações das leituras ou amostragem regular ao longo de
            A→B. Actualiza Z de A/B e a topografia da linha.
          </p>

          <DynamicVolumeMap
            lines={lines}
            anchorLat={surveyAnchor.lat}
            anchorLng={surveyAnchor.lng}
            projectOrigin={projectOrigin}
            activeLineId={activeLineId}
            pickTarget={pickTarget}
            drawState={mapDrawState}
            enableDrag
            kmlTracks={kmlTracks}
            highlightedKmlTrackId={highlightedKmlTrackId}
            lineKmlAssignment={lineKmlAssignment}
            onKmlTrackSelect={handleKmlTrackSelect}
            onMapPick={handleMapPick}
            onDrawPoint={handleDrawPoint}
            onEndpointDrag={handleEndpointDrag}
            onLineSelect={(id) => {
              setActiveLineId(id);
              setExpandedGeorefId(id);
              const tid = lineKmlAssignment[id];
              if (tid) setHighlightedKmlTrackId(tid);
            }}
            fitToken={mapFitToken}
            className="mb-4"
          />

          {kmlTracks.length > 0 && (
            <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
              <p className="mb-2 text-xs font-medium">
                Percursos KML/KMZ no mapa ({kmlTracks.length})
              </p>
              <ul className="max-h-28 space-y-1 overflow-y-auto text-[10px]">
                {kmlTracks.map((t) => {
                  const assigned = Object.entries(lineKmlAssignment).find(
                    ([, tid]) => tid === t.id,
                  );
                  const lineName = assigned
                    ? lines.find((l) => l.id === assigned[0])?.name
                    : null;
                  return (
                    <li
                      key={t.id}
                      className={`flex items-center justify-between gap-2 rounded px-2 py-1 ${
                        highlightedKmlTrackId === t.id
                          ? "bg-teal-50 dark:bg-teal-950/30"
                          : ""
                      }`}
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        onClick={() => handleKmlTrackSelect(t.id)}
                      >
                        <span
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: t.color }}
                        />
                        <span className="truncate">
                          {t.fileName} — {t.name}
                          {lineName ? ` → ${lineName}` : ""}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="shrink-0 text-red-600"
                        onClick={() => removeKmlTrack(t.id)}
                        title="Remover do mapa"
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <GeophysSectionsPanel
            className="mb-4"
            onNotice={setNotice}
            refreshKey={sectionsVersion}
          />

          <div className="space-y-3">
            {lines.map((line, idx) => (
              <div
                key={line.id}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  if (
                    (e.target as HTMLElement).closest(
                      "button, input, label, select, a",
                    )
                  ) {
                    return;
                  }
                  setActiveLineId(line.id);
                  setExpandedGeorefId(line.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setActiveLineId(line.id);
                    setExpandedGeorefId(line.id);
                  }
                }}
                className={`rounded-lg border p-3 transition-shadow ${
                  activeLineId === line.id
                    ? "border-teal-500 ring-2 ring-teal-500/30"
                    : "border-[var(--border)]"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={line.name}
                    onChange={(e) =>
                      updateLine(line.id, { name: e.target.value })
                    }
                    className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm font-medium"
                  />
                  <span className="text-xs text-[var(--muted)]">
                    {line.readings.length} leit.
                    {line.topography && line.topography.length >= 2 &&
                      ` · topo ${line.topography.length} pts`}
                    {line.geometry.azimuthDeg != null &&
                      ` · az ${line.geometry.azimuthDeg.toFixed(0)}°`}
                    {line.geometry.spacingM != null &&
                      ` · a=${line.geometry.spacingM}m`}
                    {line.invertResult &&
                      ` · RMS ${line.invertResult.rmsLog10.toFixed(3)}`}
                    {lineKmlAssignment[line.id] && (() => {
                      const t = kmlTracks.find(
                        (k) => k.id === lineKmlAssignment[line.id],
                      );
                      return t ? ` · KML: ${t.fileName}` : "";
                    })()}
                  </span>
                  {kmlTracks.length > 0 && (
                    <label className="text-xs text-[var(--muted)]">
                      KML no mapa
                      <select
                        value={lineKmlAssignment[line.id] ?? ""}
                        onChange={(e) =>
                          assignKmlTrackToLine(
                            line.id,
                            e.target.value || null,
                          )
                        }
                        className="ml-1 rounded border border-[var(--border)] bg-[var(--bg)] px-1 py-0.5 text-xs"
                      >
                        <option value="">— seleccionar percurso —</option>
                        {kmlTracks.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.fileName} · {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label
                    className="cursor-pointer rounded border border-teal-600/50 bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-900 hover:bg-teal-100 dark:bg-teal-950/30 dark:text-teal-100"
                    title="Georreferir esta secção (A→B) a partir de KML/KMZ"
                  >
                    KML/KMZ
                    <input
                      type="file"
                      accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void importKmlKmzForLine(line.id, [f]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <label className="cursor-pointer rounded border px-2 py-0.5 text-xs">
                    CSV/DAT/XYZ
                    <input
                      type="file"
                      accept=".dat,.csv,.txt,.tsv,.xyz"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void importFile(line.id, f, idx);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {!line.invertResult && line.readings.length >= 4 && (
                    <button
                      type="button"
                      onClick={() => invertLine(line.id)}
                      className="rounded bg-slate-600 px-2 py-0.5 text-xs text-white"
                    >
                      Inverter
                    </button>
                  )}
                  {line.invertResult && (
                    <button
                      type="button"
                      onClick={() => saveLineToProject(line.id)}
                      className="rounded border border-teal-600/40 px-2 py-0.5 text-xs text-teal-800 dark:text-teal-300"
                    >
                      Guardar GEO
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={demBusy}
                    onClick={() => void applyDemTopography(line.id)}
                    className="rounded border border-emerald-600/40 px-2 py-0.5 text-xs text-emerald-800 dark:text-emerald-300"
                    title="Topografia do DEM (mapa)"
                  >
                    DEM → cota
                  </button>
                  {lines.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      className="text-xs text-red-600"
                    >
                      ×
                    </button>
                  )}
                </div>
                <LineGeorefInline
                  geometry={line.geometry}
                  projectOrigin={projectOrigin}
                  onChange={(geometry) => updateLine(line.id, { geometry })}
                  coordInputMode={coordInputMode}
                  utmFuso={utmFuso}
                  onPickStart={() => {
                    setActiveLineId(line.id);
                    setMapDrawState(null);
                    setPickTarget("start");
                  }}
                  onPickEnd={() => {
                    setActiveLineId(line.id);
                    setMapDrawState(null);
                    setPickTarget("end");
                  }}
                  pickTarget={
                    activeLineId === line.id ? pickTarget : null
                  }
                />
                <LineGeorefEditor
                  geometry={line.geometry}
                  projectOrigin={projectOrigin}
                  coordInputMode={coordInputMode}
                  utmFuso={utmFuso}
                  onUtmFusoChange={setUtmFuso}
                  onCoordInputModeChange={setCoordInputMode}
                  assignedKmlLabel={
                    lineKmlAssignment[line.id]
                      ? (() => {
                          const t = kmlTracks.find(
                            (k) => k.id === lineKmlAssignment[line.id],
                          );
                          return t ? `${t.fileName} · ${t.name}` : null;
                        })()
                      : null
                  }
                  onImportKml={(files) =>
                    void importKmlKmzForLine(line.id, files)
                  }
                  expanded={expandedGeorefId === line.id}
                  onToggle={() => {
                    setExpandedGeorefId((cur) =>
                      cur === line.id ? null : line.id,
                    );
                    setActiveLineId(line.id);
                  }}
                  onChange={(geometry) => updateLine(line.id, { geometry })}
                  onProjectOriginChange={(origin) => {
                    setProjectOrigin(origin);
                    setLines((prev) =>
                      prev.map((l) =>
                        l.geometry.coordMode === "project"
                          ? {
                              ...l,
                              geometry: { ...l.geometry, projectOrigin: origin },
                            }
                          : l,
                      ),
                    );
                  }}
                  pickTarget={
                    activeLineId === line.id ? pickTarget : null
                  }
                  onPickTarget={(t) => {
                    setActiveLineId(line.id);
                    setPickTarget(t);
                  }}
                />
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-[var(--muted)]">
            Prontas para volume: {invertedCount}/{lines.length} (modelo já
            calculado). Inversão local só é necessária para ficheiros com
            leituras ρa sem modelo.
          </p>
        </section>
      )}

            {tab === "volume" && (
        <div className="grid gap-4 lg:grid-cols-4">
          <div className="space-y-3 lg:col-span-1">
            {volume && (
              <DynamicVolumeMap
                lines={lines.filter((l) => l.invertResult)}
                anchorLat={volume.anchorLat}
                anchorLng={volume.anchorLng}
                projectOrigin={projectOrigin}
                activeLineId={activeLineId}
                pickTarget={pickTarget}
                onMapPick={handleMapPick}
                fitToken={mapFitToken}
              />
            )}
            {volumeStats && (
              <VolumeLegend
                {...volumeStatsToLegendBounds(volumeStats)}
              />
            )}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <VolumeLineTopographyPanel
                line={activeLine}
                onTopographyChange={handleLineTopographyChange}
                onReapplyTerrain={() => void reapplyVolumeTerrain()}
                terrainBusy={terrainBusy || demBusy}
                volumeReady={volume != null}
              />
            </div>
            {volumeStats && (
              <ResistivityFilterPanel
                filter={rhoFilter}
                onChange={setRhoFilter}
                volumeRhoMin={10 ** volumeStats.min}
                volumeRhoMax={10 ** volumeStats.max}
                bandStats={rhoBandStats}
              />
            )}
            <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
              <p className="font-medium">Visualização</p>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={showBlockModel}
                  onChange={(e) => setShowBlockModel(e.target.checked)}
                />
                Modelo de blocos (voxel)
              </label>
              {showBlockModel && volume && blockSummary && (
                <p className="text-[10px] text-[var(--muted)]">
                  {blockSummary.validCells.toLocaleString()} blocos ·{" "}
                  {blockSummary.blockSizeM.x.toFixed(1)}×
                  {blockSummary.blockSizeM.y.toFixed(1)}×
                  {blockSummary.blockSizeM.z.toFixed(1)} m
                </p>
              )}
              {showBlockModel && (
                <>
                  <label className="block text-xs text-[var(--muted)]">
                    Opacidade blocos: {Math.round(blockOpacity * 100)}%
                    <input
                      type="range"
                      min={0.3}
                      max={1}
                      step={0.05}
                      value={blockOpacity}
                      onChange={(e) => setBlockOpacity(Number(e.target.value))}
                      className="w-full"
                    />
                  </label>
                  <label className="block text-xs text-[var(--muted)]">
                    Resolução (decimação)
                    <select
                      value={blockDecimate}
                      onChange={(e) =>
                        setBlockDecimate(Number(e.target.value))
                      }
                      className="mt-1 w-full rounded border px-2 py-1 text-xs"
                    >
                      <option value={1}>Completa (todos os blocos)</option>
                      <option value={2}>Média (1/8 blocos)</option>
                      <option value={3}>Rápida (1/27 blocos)</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={exportBlocks}
                    disabled={!volume}
                    className="w-full rounded border border-[var(--border)] py-1.5 text-xs hover:bg-[var(--bg)]"
                  >
                    Exportar blocos (CSV)
                  </button>
                </>
              )}
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={showSections}
                  onChange={(e) => setShowSections(e.target.checked)}
                />
                Secções 2D
              </label>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={showHorizontalSlice}
                  onChange={(e) => setShowHorizontalSlice(e.target.checked)}
                />
                Fatia horizontal
              </label>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={showVerticalSlice}
                  onChange={(e) => setShowVerticalSlice(e.target.checked)}
                />
                Fatia vertical
              </label>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={showIsosurface}
                  onChange={(e) => setShowIsosurface(e.target.checked)}
                />
                Iso-superfície
              </label>
              {volume && showHorizontalSlice && (
                <label className="block text-xs text-[var(--muted)]">
                  Profundidade (m): {depthM.toFixed(1)}
                  <input
                    type="range"
                    min={0}
                    max={volume.boundsM.maxZ}
                    step={volume.cellSizeM.z}
                    value={depthM}
                    onChange={(e) => setDepthM(Number(e.target.value))}
                    className="w-full"
                  />
                </label>
              )}
              {volume && showVerticalSlice && (
                <>
                  <select
                    value={verticalSliceAxis}
                    onChange={(e) =>
                      setVerticalSliceAxis(e.target.value as "x" | "y")
                    }
                    className="w-full rounded border px-2 py-1 text-xs"
                  >
                    <option value="x">Corte em X</option>
                    <option value="y">Corte em Y</option>
                  </select>
                  <label className="block text-xs text-[var(--muted)]">
                    Posição (m): {verticalSlicePos.toFixed(0)}
                    <input
                      type="range"
                      min={
                        verticalSliceAxis === "x"
                          ? volume.boundsM.minX
                          : volume.boundsM.minY
                      }
                      max={
                        verticalSliceAxis === "x"
                          ? volume.boundsM.maxX
                          : volume.boundsM.maxY
                      }
                      value={verticalSlicePos}
                      onChange={(e) =>
                        setVerticalSlicePos(Number(e.target.value))
                      }
                      className="w-full"
                    />
                  </label>
                </>
              )}
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={clipEnabled}
                  onChange={(e) => setClipEnabled(e.target.checked)}
                />
                Clipping vertical
              </label>
              {clipEnabled && volume && (
                <label className="block text-xs text-[var(--muted)]">
                  Clip prof. (m): {clipDepthM ?? 0}
                  <input
                    type="range"
                    min={0}
                    max={volume.boundsM.maxZ}
                    value={clipDepthM ?? 0}
                    onChange={(e) => setClipDepthM(Number(e.target.value))}
                    className="w-full"
                  />
                </label>
              )}
              {showIsosurface && volumeStats && (
                <label className="block text-xs text-[var(--muted)]">
                  Iso log₁₀(ρ): {isoLogRho.toFixed(2)}
                  <input
                    type="range"
                    min={volumeStats.min}
                    max={volumeStats.max}
                    step={0.05}
                    value={isoLogRho}
                    onChange={(e) => setIsoLogRho(Number(e.target.value))}
                    className="w-full"
                  />
                </label>
              )}
              <label className="block text-xs text-[var(--muted)]">
                Opacidade secções: {Math.round(sectionOpacity * 100)}%
                <input
                  type="range"
                  min={0.2}
                  max={1}
                  step={0.05}
                  value={sectionOpacity}
                  onChange={(e) => setSectionOpacity(Number(e.target.value))}
                  className="w-full"
                />
              </label>
              <button
                type="button"
                onClick={() => void runInterpretation()}
                disabled={!volume || interpBusy}
                className="mt-2 w-full rounded-lg bg-violet-700 py-2 text-xs text-white disabled:opacity-50"
              >
                Interpretar com IA
              </button>
            </div>
          </div>
          <div className="lg:col-span-3">
            {volume ? (
              <ResistivityVolumeScene
                volume={volume}
                lines={lines.filter((l) => l.invertResult)}
                depthM={depthM}
                verticalSliceAxis={verticalSliceAxis}
                verticalSlicePos={verticalSlicePos}
                showSections={showSections}
                showHorizontalSlice={showHorizontalSlice}
                showVerticalSlice={showVerticalSlice}
                showIsosurface={showIsosurface}
                showBlockModel={showBlockModel}
                blockOpacity={blockOpacity}
                blockDecimate={blockDecimate}
                logLo={volumeStats?.min ?? 0}
                logHi={volumeStats?.max ?? 3}
                isoLogRho={isoLogRho}
                sectionOpacity={sectionOpacity}
                sliceOpacity={sliceOpacity}
                isoOpacity={isoOpacity}
                clipDepthM={clipDepthM}
                clipEnabled={clipEnabled}
                rhoFilter={rhoFilter}
              />
            ) : (
              <div className="flex min-h-[480px] items-center justify-center rounded-lg border border-dashed p-8 text-center text-sm text-[var(--muted)]">
                Gere o volume na aba Dados primeiro.
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "interpretacao" && (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          {!interpretation ? (
            <div className="text-center text-sm text-[var(--muted)]">
              <p>Gere o volume e clique em &quot;Interpretar com IA&quot;.</p>
              <button
                type="button"
                onClick={() => void runInterpretation()}
                disabled={!volume || interpBusy}
                className="mt-4 rounded-lg bg-violet-700 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {interpBusy ? "A analisar…" : "Executar interpretação IA"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-[var(--text)]">{interpretation.summary}</p>
              <ul className="space-y-3">
                {interpretation.findings.map((f) => (
                  <li
                    key={f.id}
                    className="rounded-lg border border-[var(--border)] p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[var(--text)]">
                        {f.label}
                      </span>
                      <span className="text-xs text-[var(--muted)]">
                        {(f.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {f.description}
                    </p>
                    {f.depthMinM != null && (
                      <p className="mt-1 text-xs text-teal-700">
                        Profundidade: {f.depthMinM}–{f.depthMaxM ?? "?"} m
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              <div>
                <p className="mb-2 text-sm font-medium">Recomendações</p>
                <ul className="list-inside list-disc text-sm text-[var(--muted)]">
                  {interpretation.recommendations.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
