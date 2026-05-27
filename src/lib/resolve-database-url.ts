/**
 * URL PostgreSQL para Prisma.
 * No Windows, `DATABASE_URL` no ambiente do sistema (ex. placeholder `postgresql://x`)
 * tem prioridade sobre `.env.local` no Next.js — usamos fallbacks cloud (Neon/Supabase).
 */
function isUsablePostgresUrl(url: string | undefined): url is string {
  if (!url?.trim()) return false;
  const t = url.trim();
  if (t === "postgresql://x" || t === "postgres://x") return false;
  if (/@[x](:\d+)?(\/|$)/i.test(t)) return false;
  try {
    const u = new URL(t.replace(/^postgres(ql)?\+/, "postgresql+"));
    return Boolean(u.hostname && u.hostname !== "x" && u.hostname.length > 1);
  } catch {
    return t.startsWith("postgresql://") && t.length > 24;
  }
}

export function resolveDatabaseUrl(): string {
  const candidates = [
    process.env.DATABASE_URL,
    process.env.STORAGE_POSTGRES_PRISMA_URL,
    process.env.STORAGE_POSTGRES_URL,
    process.env.STORAGE_DATABASE_URL,
  ];
  for (const c of candidates) {
    if (isUsablePostgresUrl(c)) return c.trim();
  }
  return process.env.DATABASE_URL?.trim() ?? "";
}

export function resolveDirectDatabaseUrl(): string | undefined {
  const candidates = [
    process.env.DIRECT_URL,
    process.env.STORAGE_POSTGRES_URL_NON_POOLING,
    process.env.STORAGE_DATABASE_URL_UNPOOLED,
  ];
  for (const c of candidates) {
    if (isUsablePostgresUrl(c)) return c.trim();
  }
  const main = resolveDatabaseUrl();
  return isUsablePostgresUrl(main) ? main : undefined;
}
