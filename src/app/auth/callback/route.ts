import { NextResponse } from "next/server";
import { isSupabaseAuthConfigured } from "@/lib/supabase/config";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = url.searchParams.get("next") ?? "/dashboard";

  if (!isSupabaseAuthConfigured()) {
    return NextResponse.redirect(new URL(next, req.url));
  }

  const code = url.searchParams.get("code");
  const response = NextResponse.redirect(new URL(next, req.url));

  if (code) {
    try {
      const { supabase, applyCookies } = await createSupabaseRouteHandlerClient();
      await supabase.auth.exchangeCodeForSession(code);
      return applyCookies(response);
    } catch {
      // fallback to next redirect
    }
  }

  return response;
}
