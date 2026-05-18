import { evaluateAlertsStub } from "@/lib/geo-alerts-stub";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

/** Avaliação contra catálogo geotech.insar_displacements — monólito sem GEO usa stub (zeros). */
export async function POST(_req: Request, ctx: Ctx) {
  const { projectId } = await ctx.params;
  return NextResponse.json(evaluateAlertsStub(projectId));
}
