import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { garantirModulosPadraoEmpresa } from "@/lib/seed-empresa-modulos";
import { ensureUniqueCompanySlug } from "@/lib/client-slug";

function deriveName(user: SupabaseAuthUser): string | null {
  const raw =
    user.user_metadata?.name ??
    user.user_metadata?.full_name ??
    user.email?.split("@")[0] ??
    null;
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value ? value.slice(0, 120) : null;
}

export async function syncUserFromSupabase(user: SupabaseAuthUser) {
  const email = user.email?.trim().toLowerCase();
  if (!email) {
    throw new Error("Utilizador Supabase sem email.");
  }

  const existingByAuth = await prisma.user.findFirst({
    where: { supabaseAuthId: user.id },
  });
  if (existingByAuth) {
    return prisma.user.update({
      where: { id: existingByAuth.id },
      data: {
        email,
        name: existingByAuth.name ?? deriveName(user),
      },
    });
  }

  const existingByEmail = await prisma.user.findUnique({
    where: { email },
  });
  if (existingByEmail) {
    return prisma.user.update({
      where: { id: existingByEmail.id },
      data: {
        supabaseAuthId: user.id,
        name: existingByEmail.name ?? deriveName(user),
      },
    });
  }

  return prisma.user.create({
    data: {
      email,
      supabaseAuthId: user.id,
      password: null,
      name: deriveName(user),
      systemRole: "USER",
    },
  });
}

export async function createClientSignupAccount(input: {
  authUser: SupabaseAuthUser;
  companyName: string;
  cnpj?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}) {
  const localUser = await syncUserFromSupabase(input.authUser);
  const slug = await ensureUniqueCompanySlug(input.companyName);

  const company = await prisma.company.create({
    data: {
      name: input.companyName,
      slug,
      userId: localUser.id,
      cnpj: input.cnpj ?? null,
      phone: input.phone ?? null,
      email: input.email ?? input.authUser.email ?? null,
      address: input.address ?? null,
      portalEnabled: true,
      shareReportsEnabled: true,
    },
  });

  await prisma.orgMembership.upsert({
    where: { userId_empresaId: { userId: localUser.id, empresaId: company.id } },
    create: {
      userId: localUser.id,
      empresaId: company.id,
      orgRole: "ADMIN",
    },
    update: {
      orgRole: "ADMIN",
    },
  });

  await garantirModulosPadraoEmpresa(company.id);

  return { localUser, company };
}
