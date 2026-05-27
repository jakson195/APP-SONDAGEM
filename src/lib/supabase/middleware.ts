import type { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { assertSupabaseAuthConfigured, isSupabaseAuthConfigured } from "@/lib/supabase/config";
import { enableLocalSupabaseTlsWorkaround } from "@/lib/supabase/server-runtime";

export async function updateSupabaseSession(req: NextRequest, res: NextResponse) {
  if (!isSupabaseAuthConfigured()) return { response: res, user: null };

  enableLocalSupabaseTlsWorkaround();
  const { url, anonKey } = assertSupabaseAuthConfigured();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          req.cookies.set(name, value);
          res.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  return { response: res, user: data.user ?? null };
}
