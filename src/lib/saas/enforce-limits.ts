import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS } from "@/lib/saas/plan-limits";
import {
  assertSubscriptionAllowsAccess,
  countCompanyObras,
} from "@/lib/saas/subscription-service";
import type { SaasPlanSlug } from "@prisma/client";

export async function assertCanCreateObra(companyId: number) {
  const access = await assertSubscriptionAllowsAccess(companyId);
  if (!access.ok) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: access.message, code: access.code },
        { status: 402 },
      ),
    };
  }

  const sub = await prisma.subscription.findUnique({ where: { companyId } });
  const maxObras = sub?.maxObras ?? PLAN_LIMITS.trial.maxObras;
  if (maxObras >= 999) return { ok: true as const };

  const count = await countCompanyObras(companyId);
  if (count >= maxObras) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error: `Limite de obras atingido (${count}/${maxObras}). Faça upgrade em Assinatura.`,
          code: "MAX_OBRAS",
          limit: maxObras,
          current: count,
        },
        { status: 403 },
      ),
    };
  }

  return { ok: true as const };
}

export async function assertGeophysicsModuleAllowed(companyId: number) {
  const sub = await prisma.subscription.findUnique({ where: { companyId } });
  const plan = (sub?.plan ?? "trial") as SaasPlanSlug;
  if (!PLAN_LIMITS[plan]?.geophysics) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Módulo geofísica não disponível no seu plano.", code: "MODULE_DENIED" },
        { status: 403 },
      ),
    };
  }
  return { ok: true as const };
}
