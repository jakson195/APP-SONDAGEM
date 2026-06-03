/** Mercado Pago — preparação Etapa 4 (checkout completo na Etapa 5). */

export function isMercadoPagoConfigured(): boolean {
  return Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN?.trim());
}

export function getBillingProvider(): "stripe" | "mercadopago" | "none" {
  const raw = process.env.BILLING_PROVIDER?.trim().toLowerCase();
  if (raw === "mercadopago" && isMercadoPagoConfigured()) return "mercadopago";
  if (raw === "stripe" || process.env.STRIPE_SECRET_KEY) return "stripe";
  return "none";
}
