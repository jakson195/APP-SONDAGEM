import { kickInsarPipelineJob } from "@/services/insar/pipeline-trigger";
import { prisma } from "@/lib/prisma";
import { obraIdFromGeoProjectId } from "@/lib/geo-project-map";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string; jobId: string }> };

const RUNNING = [
  "resolving_scenes",
  "downloading_slc",
  "snap_processing",
  "exporting_geotiff",
] as const;

/** Reenfileira o pipeline (útil se ficou em `pending`). */
export async function POST(req: Request, ctx: Ctx) {
  const { projectId, jobId: jobIdStr } = await ctx.params;
  const obraId = obraIdFromGeoProjectId(projectId);
  const jobId = Number(jobIdStr);
  if (obraId === null || !Number.isFinite(jobId)) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }

  const job = await prisma.insarPipelineJob.findFirst({
    where: { id: jobId, obraId },
    select: { id: true, status: true },
  });
  if (!job) {
    return NextResponse.json({ error: "Job não encontrado" }, { status: 404 });
  }

  if (RUNNING.includes(job.status as (typeof RUNNING)[number])) {
    return NextResponse.json(
      { error: "Job já está em execução.", status: job.status },
      { status: 409 },
    );
  }

  await prisma.insarPipelineJob.update({
    where: { id: jobId },
    data: { status: "pending", errorMessage: null },
  });

  kickInsarPipelineJob(jobId, req);

  return NextResponse.json({ ok: true, jobId: String(jobId) });
}
