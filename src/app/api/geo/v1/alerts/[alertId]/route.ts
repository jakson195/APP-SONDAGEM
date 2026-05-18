import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ alertId: string }> };

export async function PATCH(_req: Request, ctx: Ctx) {
  const { alertId } = await ctx.params;
  return NextResponse.json(
    { error: "Alerta não encontrado", id: alertId },
    { status: 404 },
  );
}
