import { NextResponse } from "next/server";
import { createPasswordResetForEmail } from "@/lib/auth/password-reset";
import { clientIpFromRequest, checkRateLimit } from "@/lib/auth/rate-limit";
import { createSupabaseClient, isSupabaseAuthConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = clientIpFromRequest(req);
  const limited = checkRateLimit(`recover:${ip}`, 5, 15 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: `Muitas tentativas. Aguarde ${limited.retryAfterSec}s.` },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) {
    return NextResponse.json({ error: "Email é obrigatório." }, { status: 400 });
  }

  if (isSupabaseAuthConfigured()) {
    const supabase = createSupabaseClient();
    const redirectTo = new URL("/auth/callback?next=/redefinir-senha", req.url).toString();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, provider: "supabase" });
  }

  const reset = await createPasswordResetForEmail(email);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const devLink =
    reset && process.env.NODE_ENV !== "production"
      ? `${baseUrl}/redefinir-senha?token=${reset.token}`
      : undefined;

  return NextResponse.json({
    ok: true,
    provider: "legacy",
    message:
      "Se o email existir na plataforma, enviámos instruções de recuperação.",
    ...(devLink ? { devResetLink: devLink } : {}),
  });
}
