import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { prisma } from "@/lib/prisma";
import {
  assertSubscriptionAllowsAccess,
  countCompanyObras,
  countCompanyUsers,
  getOrProvisionSubscription,
} from "@/lib/saas/subscription-service";
import { isStripeConfigured } from "@/lib/billing/stripe-config";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { company, response } = await requireAuth(req);
  if (response) return response;
  if (!company) {
    return NextResponse.json({ error: "Empresa activa não definida." }, { status: 400 });
  }

  const sub = await getOrProvisionSubscription(company.companyId);
  const access = await assertSubscriptionAllowsAccess(company.companyId);
  const obrasCount = await countCompanyObras(company.companyId);
  const usersCount = await countCompanyUsers(company.companyId);

  return NextResponse.json({
    company: {
      id: company.companyId,
      name: company.companyName,
      slug: company.companySlug,
    },
    subscription: sub,
    usage: { obras: obrasCount, users: usersCount },
    access,
    billing: { stripeEnabled: isStripeConfigured() },
  });
}
