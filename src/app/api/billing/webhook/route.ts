import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, isStripeConfigured } from "@/lib/billing/stripe-config";
import { activatePaidSubscription } from "@/lib/saas/subscription-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Stripe v22+: `current_period_end` está nos items, não na Subscription. */
function subscriptionPeriodEnd(sub: Stripe.Subscription): Date | null {
  const ends = sub.items?.data
    ?.map((item) => item.current_period_end)
    .filter((t): t is number => typeof t === "number" && t > 0);
  if (!ends?.length) return null;
  return new Date(Math.max(...ends) * 1000);
}

export async function POST(req: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe off" }, { status: 503 });
  }

  const stripe = getStripe();
  const signature = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!signature || !secret) {
    return NextResponse.json({ error: "Webhook não configurado." }, { status: 400 });
  }

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch (e) {
    console.error("Stripe webhook signature", e);
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const companyId = Number(session.metadata?.companyId);
      const plan = session.metadata?.plan === "pro" ? "pro" : "pro";
      if (companyId > 0) {
        await activatePaidSubscription({
          companyId,
          plan,
          stripeCustomerId:
            typeof session.customer === "string" ? session.customer : null,
          stripeSubscriptionId:
            typeof session.subscription === "string" ? session.subscription : null,
        });
      }
    }

    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.created"
    ) {
      const sub = event.data.object as Stripe.Subscription;
      const companyId = Number(sub.metadata?.companyId);
      if (companyId > 0) {
        const periodEnd = subscriptionPeriodEnd(sub);
        const status =
          sub.status === "active" || sub.status === "trialing"
            ? "ACTIVE"
            : sub.status === "canceled"
              ? "CANCELLED"
              : "SUSPENDED";

        await prisma.subscription.upsert({
          where: { companyId },
          create: {
            companyId,
            plan: "pro",
            status,
            stripeSubscriptionId: sub.id,
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            billingProvider: "stripe",
          },
          update: {
            plan: "pro",
            status,
            stripeSubscriptionId: sub.id,
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
          },
        });
        await prisma.company.update({
          where: { id: companyId },
          data: { status, plan: "pro" },
        });
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const companyId = Number(sub.metadata?.companyId);
      if (companyId > 0) {
        await prisma.subscription.update({
          where: { companyId },
          data: { status: "CANCELLED", stripeSubscriptionId: null },
        });
        await prisma.company.update({
          where: { id: companyId },
          data: { status: "CANCELLED" },
        });
      }
    }
  } catch (e) {
    console.error("Stripe webhook handler", e);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
