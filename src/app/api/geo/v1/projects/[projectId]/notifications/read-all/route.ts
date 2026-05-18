import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  await ctx.params;
  return NextResponse.json({ marked_read: 0 });
}
