import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Webhook Mercado Pago (stub).
 * Configure `MERCADOPAGO_ACCESS_TOKEN` e implemente validação HMAC na próxima iteração.
 */
export async function POST(req: Request) {
  if (!process.env.MERCADOPAGO_ACCESS_TOKEN?.trim()) {
    return NextResponse.json({ error: "Mercado Pago não configurado." }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  console.info("[MP webhook]", JSON.stringify(body).slice(0, 500));

  return NextResponse.json({ received: true, status: "pending_implementation" });
}
