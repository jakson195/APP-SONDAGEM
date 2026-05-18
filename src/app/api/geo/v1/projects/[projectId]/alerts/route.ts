import { NextResponse } from "next/server";

import { emptyAlertList } from "@/lib/geo-alerts-stub";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

/** Lista alertas do projeto (ativos / filtrados). Sem geotech → vazio. */
export async function GET(_req: Request, ctx: Ctx) {
  await ctx.params;
  return NextResponse.json(emptyAlertList());
}
