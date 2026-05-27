import { syncUserFromSupabase } from "@/lib/auth-user-sync";
import { prisma } from "@/lib/prisma";
import { isSupabaseAuthConfigured } from "@/lib/supabase/config";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { authCookieName, authCookieOptions, signAuthToken } from "@/lib/server-auth";
import bcrypt from "bcrypt";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email e senha são obrigatórios" },
      { status: 400 },
    );
  }

  if (isSupabaseAuthConfigured()) {
    try {
      const { supabase, applyCookies } = await createSupabaseRouteHandlerClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error || !data.user) {
        return NextResponse.json(
          { error: error?.message ?? "Credenciais inválidas." },
          { status: 401 },
        );
      }

      const user = await syncUserFromSupabase(data.user);
      const response = NextResponse.json({
        systemRole: user.systemRole,
        email: user.email,
        name: user.name,
        authProvider: "supabase",
      });
      return applyCookies(response);
    } catch (e) {
      console.error(e);
      return NextResponse.json(
        { error: "Falha ao autenticar com Supabase Auth." },
        { status: 500 },
      );
    }
  }

  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET não definido");
    return NextResponse.json(
      { error: "Configuração do servidor incompleta" },
      { status: 500 },
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.password) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.password);

  if (!valid) {
    return NextResponse.json({ error: "Senha inválida" }, { status: 401 });
  }

  const token = signAuthToken({
    userId: user.id,
    systemRole: user.systemRole,
  });

  const res = NextResponse.json({
    token,
    systemRole: user.systemRole,
    email: user.email,
    name: user.name,
    authProvider: "legacy",
  });
  res.cookies.set(authCookieName(), token, authCookieOptions());
  return res;
}
