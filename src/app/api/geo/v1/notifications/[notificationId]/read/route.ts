import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ notificationId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { notificationId } = await ctx.params;
  return NextResponse.json(
    { error: "Notificação não encontrada", id: notificationId },
    { status: 404 },
  );
}
