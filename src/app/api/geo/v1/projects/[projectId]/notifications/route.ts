import { emptyNotifications } from "@/lib/geo-alerts-stub";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  await ctx.params;
  return NextResponse.json(emptyNotifications());
}
