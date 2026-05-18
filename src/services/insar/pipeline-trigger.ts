import { after } from "next/server";

import { runInsarPipelineJob } from "./pipeline";

function requestOrigin(req: Request): string {
  try {
    const url = new URL(req.url);
    const host =
      req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? url.host;
    const proto =
      req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
      url.protocol.replace(/:$/, "");
    return `${proto}://${host}`;
  } catch {
    return new URL(req.url).origin;
  }
}

async function runPipeline(jobId: number): Promise<void> {
  try {
    await runInsarPipelineJob(jobId);
  } catch (err) {
    console.error("[insar pipeline]", jobId, err);
  }
}

function kickInternalPipeline(req: Request, jobId: number, run: () => void): void {
  let origin: string;
  try {
    origin = requestOrigin(req);
  } catch {
    setImmediate(run);
    return;
  }
  const headers = new Headers();
  const secret = process.env.INSAR_INTERNAL_SECRET?.trim();
  if (secret) headers.set("Authorization", `Bearer ${secret}`);
  void fetch(`${origin}/api/internal/insar/pipeline/${jobId}`, {
    method: "POST",
    headers,
  }).catch((err) => {
    console.error("[insar pipeline kick]", jobId, err);
    setImmediate(run);
  });
}

/**
 * Agenda o worker InSAR após a resposta HTTP (`after`) + POST interno em dev/produção.
 */
export function scheduleInsarPipelineJob(jobId: number, req: Request): void {
  const run = () => runPipeline(jobId);

  if (process.env.NODE_ENV === "development") {
    kickInternalPipeline(req, jobId, run);
    return;
  }

  try {
    after(run);
  } catch {
    void run();
    return;
  }

  kickInternalPipeline(req, jobId, run);
}

/** @deprecated Use scheduleInsarPipelineJob */
export const kickInsarPipelineJob = scheduleInsarPipelineJob;
