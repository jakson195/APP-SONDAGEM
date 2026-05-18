import { prisma } from "@/lib/prisma";
import { obraIdFromGeoProjectId } from "@/lib/geo-project-map";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string; jobId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { projectId, jobId: jobIdStr } = await ctx.params;
  const obraId = obraIdFromGeoProjectId(projectId);
  const jobNum = Number(jobIdStr);
  if (obraId === null || !Number.isFinite(jobNum)) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }

  const job = await prisma.insarPipelineJob.findFirst({
    where: { id: jobNum, obraId },
    select: {
      id: true,
      status: true,
      properties: true,
      errorMessage: true,
      sceneCount: true,
      name: true,
      dateFrom: true,
      dateTo: true,
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Job não encontrado" }, { status: 404 });
  }

  const props =
    job.properties && typeof job.properties === "object"
      ? { ...(job.properties as Record<string, unknown>) }
      : {};
  const stagesRaw = props.stages as unknown[] | undefined;
  const stages = Array.isArray(stagesRaw) ? stagesRaw : [];
  props.stages = stages;

  const lastStage =
    stages.length > 0
      ? (stages[stages.length - 1] as { detail?: string; step?: string })
      : null;
  if (lastStage?.detail && typeof props.message !== "string") {
    props.message = lastStage.detail;
  } else if (lastStage?.step && typeof props.message !== "string") {
    props.message = lastStage.step;
  }

  return NextResponse.json({
    id: String(job.id),
    status: job.status,
    properties: props,
    stages,
    error_message: job.errorMessage,
    scene_count: job.sceneCount,
    name: job.name,
    date_from: job.dateFrom.toISOString(),
    date_to: job.dateTo.toISOString(),
  });
}
