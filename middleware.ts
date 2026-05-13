import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AUTH_TOKEN_COOKIE } from "@/lib/auth-constants";

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/adm")) {
    if (!req.cookies.get(AUTH_TOKEN_COOKIE)?.value) {
      const next = encodeURIComponent(req.nextUrl.pathname);
      return NextResponse.redirect(new URL(`/login?next=${next}`, req.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/adm/:path*"],
};
