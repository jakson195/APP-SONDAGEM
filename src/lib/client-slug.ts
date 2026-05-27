import { prisma } from "@/lib/prisma";

function asciiSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function slugifyClientName(value: string): string {
  const slug = asciiSlug(value);
  return slug || "cliente";
}

export function normalizeClientSlugInput(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const slug = asciiSlug(value);
  return slug || null;
}

export function normalizePrimaryColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const color = value.trim();
  if (!color) return null;
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toUpperCase() : null;
}

export async function ensureUniqueCompanySlug(
  nameOrSlug: string,
  excludeCompanyId?: number,
): Promise<string> {
  const base = slugifyClientName(nameOrSlug);
  let candidate = base;
  let attempt = 2;
  while (true) {
    const existing = await prisma.company.findFirst({
      where: {
        slug: candidate,
        ...(excludeCompanyId ? { id: { not: excludeCompanyId } } : {}),
      },
      select: { id: true },
    });
    if (!existing) return candidate;
    candidate = `${base}-${attempt}`;
    attempt += 1;
  }
}

export async function ensureUniqueReportShareSlug(
  title: string,
  excludeShareId?: number,
): Promise<string> {
  const base = slugifyClientName(title || "relatorio");
  let candidate = base;
  let attempt = 2;
  while (true) {
    const existing = await prisma.clientReportShare.findFirst({
      where: {
        slug: candidate,
        ...(excludeShareId ? { id: { not: excludeShareId } } : {}),
      },
      select: { id: true },
    });
    if (!existing) return candidate;
    candidate = `${base}-${attempt}`;
    attempt += 1;
  }
}
