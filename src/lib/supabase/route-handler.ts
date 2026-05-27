import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { assertSupabaseAuthConfigured } from "@/lib/supabase/config";
import { enableLocalSupabaseTlsWorkaround } from "@/lib/supabase/server-runtime";

type PendingCookie = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

export async function createSupabaseRouteHandlerClient() {
  enableLocalSupabaseTlsWorkaround();
  const { url, anonKey } = assertSupabaseAuthConfigured();
  const store = await cookies();
  const pendingCookies: PendingCookie[] = [];

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          pendingCookies.push({
            name: cookie.name,
            value: cookie.value,
            options: cookie.options as Record<string, unknown> | undefined,
          });
        }
      },
    },
  });

  function applyCookies<T extends NextResponse>(response: T): T {
    for (const { name, value, options } of pendingCookies) {
      response.cookies.set({
        name,
        value,
        ...(options ?? {}),
      });
    }
    return response;
  }

  return { supabase, applyCookies };
}
