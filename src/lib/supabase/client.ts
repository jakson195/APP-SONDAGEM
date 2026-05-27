"use client";

import { createBrowserClient } from "@supabase/ssr";
import { assertSupabaseAuthConfigured } from "@/lib/supabase/config";

export function createSupabaseBrowserClient() {
  const { url, anonKey } = assertSupabaseAuthConfigured();
  return createBrowserClient(url, anonKey);
}
