import { spawn } from "child_process";
import { mkdir, readdir, copyFile, stat, writeFile } from "fs/promises";
import { join } from "path";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createAuthedAxios,
  downloadSentinel1Safe,
  getCopernicusAccessToken,
  sentinel1RowToProduct,
} from "@/services/copernicus";
import { readGeoTiffStatsFromPath } from "./geotiff-stats";
import {
  countSentinel1ForInsarWindow,
  pickMasterSlaveFromCatalog,
} from "./scene-selection";
import { getObraPolygonGeoJson } from "@/lib/obra-area-postgis";
import { runSnapInsarGraph, snapInsarConfigured } from "./snap-runner";
import {
  insarJobWorkDir,
  insarProcessedAbsDir,
  insarProcessedRelDir,
  insarStorageRoot,
} from "./storage";
import {
  insarSyntheticFallbackEnabled,
  resolveAoiWktForInsarJob,
  syntheticSceneDates,
} from "./insar-aoi";
import {
  runSyntheticFallbackNode,
  type SyntheticJobContext,
} from "./insar-synthetic-node";

export type PipelineStageLog = {
  step: string;
  at: string;
  ok: boolean;
  detail?: string;
};

/** Primeira entrada em `properties.stages` ao criar job (feedback imediato no viewer). */
export function initialInsarJobQueuedProperties(): Prisma.InputJsonValue {
  return {
    stages: [
      {
        step: "queued",
        at: new Date().toISOString(),
        ok: true,
        detail:
          "Pedido aceite. O worker corre após a resposta HTTP (Next.js «after» — evita corte em serverless/Vercel).",
      },
    ],
  };
}

function unitForRasterKind(kind: string): string {
  if (kind === "velocity") return "mm/yr";
  if (kind === "coherence") return "1";
  if (kind.includes("phase")) return "rad";
  return "mm";
}

export function classifyInsarRasterKind(baseName: string): string {
  const n = baseName.toLowerCase().replace(/\.tif$/i, "");
  if (n.includes("interferogram") || n.startsWith("ifg_")) return "interferogram";
  if (n.includes("unwrap") || n.includes("unwrapped")) return "unwrapped_phase";
  if (n.includes("wrapped") && n.includes("phase")) return "wrapped_phase";
  if (n.startsWith("displacement")) return "displacement";
  if (n.startsWith("velocity")) return "velocity";
  if (n.startsWith("coherence")) return "coherence";
  return "other";
}

export function epochFromDisplacementFilename(baseName: string): Date | null {
  const stem = baseName.replace(/\.tif$/i, "");
  const m = /^displacement_(\d{4}-\d{2}-\d{2})/i.exec(stem);
  if (!m) return null;
  return new Date(`${m[1]}T12:00:00.000Z`);
}

async function appendStage(jobId: number, stage: PipelineStageLog): Promise<void> {
  const job = await prisma.insarPipelineJob.findUnique({ where: { id: jobId } });
  const prev = (job?.properties as { stages?: PipelineStageLog[] } | null) ?? {};
  const stages = [...(prev.stages ?? []), stage];
  await prisma.insarPipelineJob.update({
    where: { id: jobId },
    data: {
      properties: {
        ...prev,
        stages,
      },
    },
  });
}

async function updateJob(
  jobId: number,
  data: Prisma.InsarPipelineJobUpdateInput,
): Promise<void> {
  await prisma.insarPipelineJob.update({
    where: { id: jobId },
    data,
  });
}

async function ingestGeoTiffsFromWorkDir(options: {
  jobId: number;
  obraId: number;
  workDir: string;
}): Promise<number> {
  const { jobId, obraId, workDir } = options;
  await prisma.insarGeoRaster.deleteMany({ where: { jobId } });

  const names = (await readdir(workDir)).filter((f) => /\.tif$/i.test(f));
  const absOut = insarProcessedAbsDir(obraId, jobId);
  await mkdir(absOut, { recursive: true });
  const relPrefix = insarProcessedRelDir(obraId, jobId).replace(/\\/g, "/");

  let count = 0;
  for (const name of names) {
    const src = join(workDir, name);
    const dest = join(absOut, name);
    await copyFile(src, dest);
    const st = await stat(dest);
    const g = await readGeoTiffStatsFromPath(dest);
    const kind = classifyInsarRasterKind(name);
    const epoch = epochFromDisplacementFilename(name);
    const relativePath = `${relPrefix}/${name}`.replace(/\\/g, "/");

    await prisma.insarGeoRaster.create({
      data: {
        jobId,
        rasterKind: kind,
        epochDate: epoch,
        relativePath,
        fileSizeBytes: BigInt(st.size),
        crsEpsg: g.crsEpsg,
        width: g.width,
        height: g.height,
        minValue: g.minValue,
        maxValue: g.maxValue,
        meanValue: g.meanValue,
        nodataValue: g.nodata ?? undefined,
        units: unitForRasterKind(kind),
        footprintGeoJson: g.footprint as unknown as Prisma.InputJsonValue,
      },
    });
    count++;
  }
  return count;
}

function spawnPythonSynthetic(workDir: string): Promise<void> {
  const custom = process.env.INSAR_PYTHON_PATH?.trim();
  const script = join(process.cwd(), "scripts", "insar-synthetic-fallback.py");
  const usePyLauncher = process.platform === "win32" && !custom;
  const cmd = usePyLauncher ? "py" : custom || "python";
  const args = usePyLauncher ? ["-3", script, workDir] : [script, workDir];

  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let err = "";
    child.stderr?.on("data", (d: Buffer) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `Python (${cmd}): código ${code}. ${err.slice(-1200)} — ou use fallback Node (automático).`,
          ),
        );
    });
  });
}

async function runSyntheticFallbackPython(workDir: string): Promise<void> {
  await spawnPythonSynthetic(workDir);
}

async function runSyntheticGeotiffs(
  jobId: number,
  workDir: string,
  ctx: SyntheticJobContext,
): Promise<void> {
  try {
    await runSyntheticFallbackPython(workDir);
    await appendStage(jobId, {
      step: "synthetic_fallback",
      at: new Date().toISOString(),
      ok: true,
      detail: "GeoTIFF gerados via Python (rasterio)",
    });
  } catch (pyErr) {
    const msg = pyErr instanceof Error ? pyErr.message : String(pyErr);
    await appendStage(jobId, {
      step: "synthetic_fallback_python",
      at: new Date().toISOString(),
      ok: false,
      detail: msg.slice(0, 500),
    });
    await runSyntheticFallbackNode(workDir, ctx);
    await appendStage(jobId, {
      step: "synthetic_fallback",
      at: new Date().toISOString(),
      ok: true,
      detail: "GeoTIFF gerados via Node (geotiff) — demo sem Python",
    });
  }
}

async function finalizeInsarJobFromWorkDir(options: {
  jobId: number;
  obraId: number;
  workDir: string;
}): Promise<number> {
  const { jobId, obraId, workDir } = options;
  await updateJob(jobId, { status: "exporting_geotiff" });

  const n = await ingestGeoTiffsFromWorkDir({ jobId, obraId, workDir });
  if (n === 0) {
    throw new Error(
      "Nenhum GeoTIFF na pasta de trabalho — verifique SNAP ou fallback Python (rasterio).",
    );
  }

  await appendStage(jobId, {
    step: "ingest_geotiff",
    at: new Date().toISOString(),
    ok: true,
    detail: `${n} ficheiros`,
  });

  await updateJob(jobId, { status: "completed", errorMessage: null });
  await appendStage(jobId, {
    step: "completed",
    at: new Date().toISOString(),
    ok: true,
  });
  await appendStage(jobId, {
    step: "cesium_integration",
    at: new Date().toISOString(),
    ok: true,
    detail:
      "GeoTIFF via GET …/insar/rasters/{id}/download · viewer: addInsarGeotiff + heatmap",
  });
  return n;
}

type InsarJobRow = NonNullable<
  Awaited<ReturnType<typeof prisma.insarPipelineJob.findUnique>>
>;

/** Demo / dev: GeoTIFF sintético sem par SLC nem SNAP. */
async function runSyntheticOnlyPath(
  jobId: number,
  job: InsarJobRow,
  workDir: string,
): Promise<void> {
  await updateJob(jobId, { status: "snap_processing" });

  const { wkt, source } = await resolveAoiWktForInsarJob(job);
  await appendStage(jobId, {
    step: "aoi_processing",
    at: new Date().toISOString(),
    ok: true,
    detail: `fonte=${source} (modo sintético, sem SLC)`,
  });

  const { masterDate, slaveDate } = syntheticSceneDates(job);
  const ctx = {
    aoi_wkt: wkt,
    reference_date: job.referenceDate?.toISOString() ?? null,
    scenes: [
      { scene_id: "SYNTH-MASTER", acquisition_date: masterDate },
      { scene_id: "SYNTH-SLAVE", acquisition_date: slaveDate },
    ],
  };
  await writeFile(join(workDir, "job_context.json"), JSON.stringify(ctx), "utf8");

  await appendStage(jobId, {
    step: "synthetic_fallback_start",
    at: new Date().toISOString(),
    ok: true,
    detail: "A gerar heatmap demo — sem Sentinel-1 real",
  });

  await runSyntheticGeotiffs(jobId, workDir, ctx);
  await finalizeInsarJobFromWorkDir({ jobId, obraId: job.obraId, workDir });
}

/**
 * Fluxo: resolver par SLC → descarregar `.SAFE` → SNAP (coregistro→IFG→unwrap→deslocamento→GeoTIFF)
 * ou fallback sintético (`INSAR_ALLOW_SYNTHETIC_FALLBACK=1`) → copiar GeoTIFF → registos na BD.
 */
const activePipelineJobs = new Set<number>();

export async function runInsarPipelineJob(jobId: number): Promise<void> {
  if (activePipelineJobs.has(jobId)) {
    console.warn("[insar] job já em execução, ignorar duplicado:", jobId);
    return;
  }
  activePipelineJobs.add(jobId);

  const job = await prisma.insarPipelineJob.findUnique({
    where: { id: jobId },
  });
  if (!job) {
    activePipelineJobs.delete(jobId);
    return;
  }

  const workDir = insarJobWorkDir(job.obraId, jobId);

  try {
    await mkdir(insarStorageRoot(), { recursive: true });
    await mkdir(workDir, { recursive: true });

    await updateJob(jobId, { status: "resolving_scenes", errorMessage: null });

    const obraCtx = await prisma.obra.findUnique({
      where: { id: job.obraId },
      select: { id: true, nome: true },
    });
    const obraAoi = await getObraPolygonGeoJson(prisma, job.obraId);
    await appendStage(jobId, {
      step: "obra_context",
      at: new Date().toISOString(),
      ok: true,
      detail: `obra_id=${job.obraId} nome=${obraCtx?.nome ?? "?"} job_aoi_wkt=${Boolean(job.aoiWkt)} obra_aoi_geojson=${obraAoi != null}`,
    });

    const inventory = await countSentinel1ForInsarWindow({
      obraId: job.obraId,
      dateFrom: job.dateFrom,
      dateTo: job.dateTo,
      orbitDirection: job.orbitDirection,
    });
    await appendStage(jobId, {
      step: "catalog_inventory",
      at: new Date().toISOString(),
      ok: inventory.readySlc >= 2,
      detail: `catálogo obra=${job.obraId} total=${inventory.total} slc_pronta_local=${inventory.readySlc} órbita=${job.orbitDirection ?? "qualquer"}`,
    });

    let masterId = job.masterCopernicusId ?? undefined;
    let slaveId = job.slaveCopernicusId ?? undefined;

    if (!masterId || !slaveId) {
      const pair = await pickMasterSlaveFromCatalog({
        obraId: job.obraId,
        dateFrom: job.dateFrom,
        dateTo: job.dateTo,
        orbitDirection: job.orbitDirection,
      });
      if (!pair) {
        if (insarSyntheticFallbackEnabled()) {
          await appendStage(jobId, {
            step: "resolve_pair",
            at: new Date().toISOString(),
            ok: true,
            detail: `Sem SLC local — modo sintético (total=${inventory.total} ready=${inventory.readySlc})`,
          });
          await runSyntheticOnlyPath(jobId, job, workDir);
          return;
        }
        await appendStage(jobId, {
          step: "resolve_pair",
          at: new Date().toISOString(),
          ok: false,
          detail: `Sem par master/slave (≥2 SLC com download local integrity_ok). total=${inventory.total} ready=${inventory.readySlc}`,
        });
        throw new Error(
          "Não há pelo menos duas cenas SLC prontas no período (descarregue com o downloader Sentinel-1).",
        );
      }
      masterId = pair.master.copernicusId;
      slaveId = pair.slave.copernicusId;
      await updateJob(jobId, {
        masterCopernicusId: masterId,
        slaveCopernicusId: slaveId,
        sceneCount: 2,
      });
    }

    await appendStage(jobId, {
      step: "resolve_pair",
      at: new Date().toISOString(),
      ok: true,
      detail: `master=${masterId} slave=${slaveId}`,
    });

    const masterRow = await prisma.sentinel1CatalogEntry.findUnique({
      where: { copernicusId: masterId },
    });
    const slaveRow = await prisma.sentinel1CatalogEntry.findUnique({
      where: { copernicusId: slaveId },
    });
    if (!masterRow || !slaveRow) {
      throw new Error("Metadados master/slave em falta na BD.");
    }

    let aoiWkt = job.aoiWkt ?? masterRow.footprintWkt ?? slaveRow.footprintWkt;
    const aoiSource = job.aoiWkt
      ? "job.aoiWkt"
      : masterRow.footprintWkt
        ? "master.footprint"
        : "slave.footprint";
    if (!aoiWkt) {
      throw new Error(
        "âmbito (aoiWkt) em falta: defina no job ou associe cenas com footprint.",
      );
    }

    const aoiPreview =
      aoiWkt.length > 200 ? `${aoiWkt.slice(0, 200)}…` : aoiWkt;
    await appendStage(jobId, {
      step: "aoi_processing",
      at: new Date().toISOString(),
      ok: true,
      detail: `fonte=${aoiSource} wkt_preview=${aoiPreview}`,
    });

    await updateJob(jobId, { status: "downloading_slc" });

    const { accessToken, expiresInSec } = await getCopernicusAccessToken();
    await appendStage(jobId, {
      step: "copernicus_auth",
      at: new Date().toISOString(),
      ok: true,
      detail: `OAuth2 CDSE OK · expires_in≈${expiresInSec}s`,
    });
    const http = createAuthedAxios(accessToken);

    await appendStage(jobId, {
      step: "download_slc_start",
      at: new Date().toISOString(),
      ok: true,
      detail: `produtos=${masterId}; ${slaveId}`,
    });

    for (const row of [masterRow, slaveRow]) {
      await appendStage(jobId, {
        step: "download_slc_item",
        at: new Date().toISOString(),
        ok: true,
        detail: `a descarregar ${row.copernicusId}`,
      });
      const res = await downloadSentinel1Safe(http, sentinel1RowToProduct(row));
      if (res.status === "failed") {
        await appendStage(jobId, {
          step: "download_slc_item",
          at: new Date().toISOString(),
          ok: false,
          detail: `${row.copernicusId}: ${res.error}`,
        });
        throw new Error(`Download SLC: ${res.error}`);
      }
      await appendStage(jobId, {
        step: "download_slc_item_done",
        at: new Date().toISOString(),
        ok: true,
        detail: `${row.copernicusId} (${res.status})`,
      });
    }

    await appendStage(jobId, {
      step: "download_slc",
      at: new Date().toISOString(),
      ok: true,
      detail: "SAFE disponível localmente (master+slave)",
    });

    const masterFresh = await prisma.sentinel1CatalogEntry.findUnique({
      where: { copernicusId: masterId },
    });
    const slaveFresh = await prisma.sentinel1CatalogEntry.findUnique({
      where: { copernicusId: slaveId },
    });
    const masterSafe = masterFresh?.localPath;
    const slaveSafe = slaveFresh?.localPath;
    if (!masterSafe || !slaveSafe) {
      throw new Error("Caminhos .SAFE locais indisponíveis após download.");
    }

    await updateJob(jobId, { status: "snap_processing" });

    let processedOk = false;

    await appendStage(jobId, {
      step: "snap_env",
      at: new Date().toISOString(),
      ok: snapInsarConfigured(),
      detail: snapInsarConfigured()
        ? "SNAP_GPT_PATH + SNAP_INSAR_GRAPH_PATH definidos"
        : "SNAP não configurado — definir SNAP_* ou INSAR_ALLOW_SYNTHETIC_FALLBACK=1",
    });

    if (snapInsarConfigured()) {
      try {
        await appendStage(jobId, {
          step: "snap_gpt_start",
          at: new Date().toISOString(),
          ok: true,
          detail: `master_SAFE=${masterSafe} slave_SAFE=${slaveSafe}`,
        });
        const snapOut = await runSnapInsarGraph({
          masterSafePath: masterSafe,
          slaveSafePath: slaveSafe,
          targetFolder: workDir,
        });
        processedOk = true;
        const tail = snapOut.stderr.trim().slice(-900);
        await appendStage(jobId, {
          step: "snap_gpt_done",
          at: new Date().toISOString(),
          ok: true,
          detail: tail || "(gpt sem stderr)",
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await appendStage(jobId, {
          step: "snap_gpt",
          at: new Date().toISOString(),
          ok: false,
          detail: msg,
        });
      }
    }

    if (!processedOk && insarSyntheticFallbackEnabled()) {
      const ctx: SyntheticJobContext = {
        aoi_wkt: aoiWkt,
        reference_date: job.referenceDate?.toISOString() ?? null,
        scenes: [
          {
            scene_id: masterId,
            acquisition_date: masterFresh!.acquisitionAt.toISOString().slice(0, 10),
          },
          {
            scene_id: slaveId,
            acquisition_date: slaveFresh!.acquisitionAt.toISOString().slice(0, 10),
          },
        ],
      };
      await writeFile(
        join(workDir, "job_context.json"),
        JSON.stringify(ctx),
        "utf8",
      );
      await runSyntheticGeotiffs(jobId, workDir, ctx);
      processedOk = true;
    }

    if (!processedOk) {
      throw new Error(
        "Processamento InSAR não executado: configure SNAP_GPT_PATH + SNAP_INSAR_GRAPH_PATH ou INSAR_ALLOW_SYNTHETIC_FALLBACK=1 (Python: numpy, rasterio, shapely).",
      );
    }

    await finalizeInsarJobFromWorkDir({ jobId, obraId: job.obraId, workDir });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await updateJob(jobId, {
      status: "failed",
      errorMessage: msg,
    });
    await appendStage(jobId, {
      step: "failed",
      at: new Date().toISOString(),
      ok: false,
      detail: msg,
    });
  } finally {
    activePipelineJobs.delete(jobId);
  }
}
