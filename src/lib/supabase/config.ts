/** Re-exporta configuração a partir de @/lib/supabase (fonte única). */
export {
  assertSupabaseAuthConfigured,
  assertSupabaseServiceRoleConfigured,
  getSupabaseAnonKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
  isSupabaseAuthConfigured,
  missingSupabaseAuthEnv,
  supabaseAuthSetupMessage,
} from "@/lib/supabase";
