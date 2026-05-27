import { NextResponse } from "next/server";
import { createClientSignupAccount } from "@/lib/auth-user-sync";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAuthConfigured } from "@/lib/supabase/config";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json(
      { error: "Supabase Auth não configurado." },
      { status: 503 },
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

  if (!companyName || !name || !email || password.length < 8) {
    return NextResponse.json(
      {
        error:
          "Informe empresa, nome, email e uma senha com pelo menos 8 caracteres.",
      },
      { status: 400 },
    );
  }

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
      companyName,
      cnpj: typeof body.cnpj === "string" ? body.cnpj.trim() || null : null,
      phone: typeof body.phone === "string" ? body.phone.trim() || null : null,
      email: typeof body.companyEmail === "string" ? body.companyEmail.trim() || null : null,
      address:
        typeof body.address === "string" ? body.address.trim() || null : null,
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
      company: { id: company.id, slug: company.slug, name: company.name },
      user: { id: localUser.id, email: localUser.email, name: localUser.name },
    });
    return applyCookies(response);
  } catch (e) {
    if (createdAuthUserId) {
      try {
        await admin.auth.admin.deleteUser(createdAuthUserId);
      } catch {
        // best effort cleanup
      }
    }
    console.error(e);
    return NextResponse.json(
      { error: "Falha ao criar cliente no sistema." },
      { status: 500 },
    );
  }
}
