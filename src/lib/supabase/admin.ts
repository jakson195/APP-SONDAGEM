import { createClient } from "@supabase/supabase-js";
import { assertSupabaseServiceRoleConfigured } from "@/lib/supabase/config";
import { enableLocalSupabaseTlsWorkaround } from "@/lib/supabase/server-runtime";

export function createSupabaseAdminClient() {
  enableLocalSupabaseTlsWorkaround();
  const { url, serviceRoleKey } = assertSupabaseServiceRoleConfigured();
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
