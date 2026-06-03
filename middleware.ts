import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AUTH_TOKEN_COOKIE } from "@/lib/auth-constants";
import { isPublicPath, isAppRoute } from "@/lib/auth/public-routes";
import { isLocalAuthBypassEnabled } from "@/lib/auth-bypass";
import { isSupabaseAuthConfigured } from "@/lib/supabase/config";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

const ADMIN_PREFIXES = ["/adm", "/admin"] as const;

function isAdminRoute(pathname: string) {
  return ADMIN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function hasLegacySession(req: NextRequest) {
  return Boolean(req.cookies.get(AUTH_TOKEN_COOKIE)?.value);
}

async function isAuthenticated(req: NextRequest): Promise<boolean> {
  if (isSupabaseAuthConfigured()) {
    const result = await updateSupabaseSession(req, NextResponse.next());
    return Boolean(result.user);
  }
  return hasLegacySession(req);
}

export async function middleware(req: NextRequest) {
  if (isLocalAuthBypassEnabled()) {
    return NextResponse.next();
  }

  const pathname = req.nextUrl.pathname;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const needsAuth = isAppRoute(pathname) || isAdminRoute(pathname);
  if (!needsAuth) {
    return NextResponse.next();
  }

  const authed = await isAuthenticated(req);
  if (!authed) {
    const next = encodeURIComponent(`${pathname}${req.nextUrl.search || ""}`);
    return NextResponse.redirect(new URL(`/login?next=${next}`, req.url));
  }

  if (isSupabaseAuthConfigured()) {
    const result = await updateSupabaseSession(req, NextResponse.next());
    return result.response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$).*)",
  ],
};
