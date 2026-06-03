import Stripe from "stripe";

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY não configurada.");
  return new Stripe(key);
}

export function stripePriceIdForPlan(plan: "pro"): string | null {
  if (plan === "pro") return process.env.STRIPE_PRICE_ID_PRO?.trim() || null;
  return null;
}

export function appBaseUrl(req: Request): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    new URL(req.url).origin
  );
}
