import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { assertSupabaseAuthConfigured } from "@/lib/supabase/config";
import { enableLocalSupabaseTlsWorkaround } from "@/lib/supabase/server-runtime";

export async function createSupabaseServerClient() {
  enableLocalSupabaseTlsWorkaround();
  const { url, anonKey } = assertSupabaseAuthConfigured();
  const store = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            store.set(name, value, options);
          });
        } catch {
          // In some Server Component contexts, cookie mutation is unavailable.
        }
      },
    },
  });
}
