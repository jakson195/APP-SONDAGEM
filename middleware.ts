import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AUTH_TOKEN_COOKIE } from "@/lib/auth-constants";
import { isLocalAuthBypassEnabled } from "@/lib/auth-bypass";
import { isSupabaseAuthConfigured } from "@/lib/supabase/config";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = new Set([
  "/login",
  "/cadastro",
  "/recuperar-senha",
  "/redefinir-senha",
  "/auth/callback",
]);

function isProtectedPath(pathname: string) {
  return (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/adm") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/cliente/") ||
    pathname.startsWith("/empresa/") ||
    pathname.startsWith("/gestao-empresa") ||
    pathname.startsWith("/obra") ||
    pathname.startsWith("/obras") ||
    pathname.startsWith("/hidrologia")
  );
}

export async function middleware(req: NextRequest) {
  if (isLocalAuthBypassEnabled()) {
    return NextResponse.next();
  }

  const pathname = req.nextUrl.pathname;
  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  const next = encodeURIComponent(`${pathname}${req.nextUrl.search || ""}`);

  if (isSupabaseAuthConfigured()) {
    const result = await updateSupabaseSession(req, NextResponse.next());
    if (!result.user) {
      return NextResponse.redirect(new URL(`/login?next=${next}`, req.url));
    }
    return result.response;
  }

  if (!req.cookies.get(AUTH_TOKEN_COOKIE)?.value) {
    return NextResponse.redirect(new URL(`/login?next=${next}`, req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/adm/:path*",
    "/admin/:path*",
    "/cliente/:path*",
    "/empresa/:path*",
    "/gestao-empresa/:path*",
    "/obra/:path*",
    "/obras/:path*",
    "/hidrologia/:path*",
  ],
};
