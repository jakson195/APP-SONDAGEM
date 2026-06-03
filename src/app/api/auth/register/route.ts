import { NextResponse } from "next/server";
import {
  createClientSignupAccount,
  createJwtSignupAccount,
} from "@/lib/auth-user-sync";
import { clientIpFromRequest, checkRateLimit } from "@/lib/auth/rate-limit";
import { authCookieName, authCookieOptions, signAuthToken } from "@/lib/server-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAuthConfigured } from "@/lib/supabase/config";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = clientIpFromRequest(req);
  const limited = checkRateLimit(`register:${ip}`, 8, 60 * 60 * 1000);
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

  const companyName =
    typeof body.companyName === "string" ? body.companyName.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const plan = body.plan;

  if (!companyName || !name || !email || password.length < 8) {
    return NextResponse.json(
      {
        error:
          "Informe empresa, nome, email e uma senha com pelo menos 8 caracteres.",
      },
      { status: 400 },
    );
  }

  const common = {
    companyName,
    plan,
    cnpj: typeof body.cnpj === "string" ? body.cnpj.trim() || null : null,
    phone: typeof body.phone === "string" ? body.phone.trim() || null : null,
    address:
      typeof body.address === "string" ? body.address.trim() || null : null,
    companyEmail:
      typeof body.companyEmail === "string" ? body.companyEmail.trim() || null : null,
  };

  if (isSupabaseAuthConfigured()) {
    const admin = createSupabaseAdminClient();
    let createdAuthUserId: string | null = null;

    try {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      });
      if (error || !data.user) {
        return NextResponse.json(
          { error: error?.message ?? "Não foi possível criar a conta." },
          { status: 400 },
        );
      }
      createdAuthUserId = data.user.id;

      const { company, localUser } = await createClientSignupAccount({
        authUser: data.user,
        ...common,
        email: common.companyEmail,
      });

      const { supabase, applyCookies } = await createSupabaseRouteHandlerClient();
      const signIn = await supabase.auth.signInWithPassword({ email, password });
      if (signIn.error) {
        return NextResponse.json(
          { error: "Conta criada, mas o login automático falhou." },
          { status: 500 },
        );
      }

      const response = NextResponse.json({
        ok: true,
        authProvider: "supabase",
        company: { id: company.id, slug: company.slug, name: company.name, plan: company.plan },
        user: { id: localUser.id, email: localUser.email, name: localUser.name },
        checkoutRequired: plan === "pro",
      });
      return applyCookies(response);
    } catch (e) {
      if (createdAuthUserId) {
        try {
          await admin.auth.admin.deleteUser(createdAuthUserId);
        } catch {
          /* cleanup */
        }
      }
      console.error(e);
      return NextResponse.json(
        { error: "Falha ao criar cliente no sistema." },
        { status: 500 },
      );
    }
  }

  if (!process.env.JWT_SECRET) {
    return NextResponse.json(
      { error: "Configure JWT_SECRET ou Supabase Auth." },
      { status: 503 },
    );
  }

  try {
    const { company, localUser } = await createJwtSignupAccount({
      name,
      email,
      password,
      ...common,
    });

    const token = signAuthToken({
      userId: localUser.id,
      systemRole: localUser.systemRole,
    });

    const response = NextResponse.json({
      ok: true,
      authProvider: "legacy",
      company: { id: company.id, slug: company.slug, name: company.name, plan: company.plan },
      user: { id: localUser.id, email: localUser.email, name: localUser.name },
      checkoutRequired: plan === "pro",
    });
    response.cookies.set(authCookieName(), token, authCookieOptions());
    return response;
  } catch (e) {
    if (e instanceof Error && e.message === "EMAIL_IN_USE") {
      return NextResponse.json({ error: "Este email já está registado." }, { status: 409 });
    }
    console.error(e);
    return NextResponse.json({ error: "Falha ao criar conta." }, { status: 500 });
  }
}
