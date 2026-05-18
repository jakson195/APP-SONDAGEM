import { runInsarPipelineJob } from "@/services/insar";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Vercel Pro+: aumentar se SNAP demorar mais que o default (60s no Hobby). */
export const maxDuration = 900;

type Ctx = { params: Promise<{ jobId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const secret = process.env.INSAR_INTERNAL_SECRET?.trim();
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const jobIdStr = (await ctx.params).jobId;
  const jobId = Number(jobIdStr);
  if (!Number.isFinite(jobId) || jobId < 1) {
    return NextResponse.json({ error: "jobId inválido" }, { status: 400 });
  }

  await runInsarPipelineJob(jobId);
  return NextResponse.json({ ok: true });
}
