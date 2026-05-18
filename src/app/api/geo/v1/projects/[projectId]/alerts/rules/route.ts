import {
  getAlertRules,
  updateAlertRules,
} from "@/lib/geo-alerts-stub";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { projectId } = await ctx.params;
  return NextResponse.json(getAlertRules(projectId));
}

export async function PUT(req: Request, ctx: Ctx) {
  const { projectId } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const patch: Parameters<typeof updateAlertRules>[1] = {};
  if (typeof body.displacement_mm === "number") patch.displacement_mm = body.displacement_mm;
  if (typeof body.velocity_mm_yr === "number") patch.velocity_mm_yr = body.velocity_mm_yr;
  if (typeof body.coherence_min === "number") patch.coherence_min = body.coherence_min;
  if (typeof body.critical_displacement_mm === "number")
    patch.critical_displacement_mm = body.critical_displacement_mm;
  if (typeof body.critical_velocity_mm_yr === "number")
    patch.critical_velocity_mm_yr = body.critical_velocity_mm_yr;
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;

  return NextResponse.json(updateAlertRules(projectId, patch));
}
