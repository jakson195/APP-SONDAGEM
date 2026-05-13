import { authCookieName, authCookieOptions } from "@/lib/server-auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(authCookieName(), "", { ...authCookieOptions(), maxAge: 0 });
  return res;
}
