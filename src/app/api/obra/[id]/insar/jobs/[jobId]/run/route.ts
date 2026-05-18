import { prisma } from "@/lib/prisma";
import { kickInsarPipelineJob } from "@/services/insar";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; jobId: string }> };

function parseIdPair(idStr: string, jobIdStr: string) {
  const obraId = Number(idStr);
  const jobId = Number(jobIdStr);
  return {
    ok: Number.isFinite(obraId) && Number.isFinite(jobId),
    obraId,
    jobId,
  };
}

const BLOCKED_INSAR_RUN_STATUSES = [
  "resolving_scenes",
  "downloading_slc",
  "snap_processing",
  "exporting_geotiff",
] as const;

export async function POST(req: Request, ctx: Ctx) {
  const { id: idStr, jobId: jobIdStr } = await ctx.params;
  const { ok, obraId, jobId } = parseIdPair(idStr, jobIdStr);
  if (!ok) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }

  const job = await prisma.insarPipelineJob.findFirst({
    where: { id: jobId, obraId },
    select: { id: true, status: true },
  });

  if (!job) {
    return NextResponse.json({ error: "Job não encontrado" }, { status: 404 });
  }

  if (
    BLOCKED_INSAR_RUN_STATUSES.includes(
      job.status as (typeof BLOCKED_INSAR_RUN_STATUSES)[number],
    )
  ) {
    return NextResponse.json(
      {
        error: "Job já está em execução.",
      },
      { status: 409 },
    );
  }

  await prisma.insarPipelineJob.update({
    where: { id: jobId },
    data: {
      status: "pending",
      errorMessage: null,
    },
  });

  kickInsarPipelineJob(jobId, req);

  return NextResponse.json({ ok: true, jobId });
}
