let applied = false;

/**
 * Local Windows dev environment is failing TLS verification against Supabase.
 * Keep the workaround explicit and development-only.
 */
export function enableLocalSupabaseTlsWorkaround() {
  if (applied) return;
  if (typeof window !== "undefined") return;
  if (process.env.NODE_ENV === "production") return;
  if (process.env.SUPABASE_LOCAL_INSECURE_TLS !== "1") return;

  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  applied = true;
}
