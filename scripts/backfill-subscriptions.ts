/**
 * Cria registo Subscription TRIAL para empresas sem assinatura.
 *   npx tsx scripts/backfill-subscriptions.ts
 */
import { prisma } from "../src/lib/prisma";
import { provisionSubscriptionForCompany } from "../src/lib/saas/subscription-service";

async function main() {
  const companies = await prisma.company.findMany({
    select: { id: true, plan: true, status: true },
  });
  let created = 0;
  for (const c of companies) {
    const existing = await prisma.subscription.findUnique({
      where: { companyId: c.id },
    });
    if (existing) continue;
    const plan =
      c.plan === "pro" || c.plan === "enterprise"
        ? (c.plan as "pro" | "enterprise")
        : "trial";
    await provisionSubscriptionForCompany(c.id, plan, {
      status: c.status,
    });
    created += 1;
  }
  console.log(`Backfill: ${created} assinatura(s) criada(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
