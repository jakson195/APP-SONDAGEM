import type { SaasPlanSlug } from "@prisma/client";
import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { garantirModulosPadraoEmpresa } from "@/lib/seed-empresa-modulos";
import { ensureUniqueCompanySlug } from "@/lib/client-slug";
import { parseSignupPlan } from "@/lib/saas/plan-limits";
import { provisionSubscriptionForCompany } from "@/lib/saas/subscription-service";

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

async function provisionCompanyForUser(input: {
  userId: number;
  companyName: string;
  plan: SaasPlanSlug;
  ownerEmail: string | null;
  cnpj?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}) {
  const slug = await ensureUniqueCompanySlug(input.companyName);
  const plan = input.plan;

  const company = await prisma.company.create({
    data: {
      name: input.companyName,
      slug,
      userId: input.userId,
      plan,
      status: plan === "trial" ? "TRIAL" : "ACTIVE",
      cnpj: input.cnpj ?? null,
      phone: input.phone ?? null,
      email: input.email ?? input.ownerEmail,
      address: input.address ?? null,
      portalEnabled: true,
      shareReportsEnabled: true,
    },
  });

  await prisma.orgMembership.upsert({
    where: { userId_empresaId: { userId: input.userId, empresaId: company.id } },
    create: {
      userId: input.userId,
      empresaId: company.id,
      orgRole: "ADMIN",
    },
    update: { orgRole: "ADMIN" },
  });

  await garantirModulosPadraoEmpresa(company.id);
  await provisionSubscriptionForCompany(company.id, plan);

  return company;
}

export async function createClientSignupAccount(input: {
  authUser: SupabaseAuthUser;
  companyName: string;
  plan?: unknown;
  cnpj?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}) {
  const localUser = await syncUserFromSupabase(input.authUser);
  const company = await provisionCompanyForUser({
    userId: localUser.id,
    companyName: input.companyName,
    plan: parseSignupPlan(input.plan),
    ownerEmail: input.authUser.email ?? null,
    cnpj: input.cnpj,
    phone: input.phone,
    email: input.email,
    address: input.address,
  });

  return { localUser, company };
}

/** Cadastro com JWT + bcrypt (sem Supabase). */
export async function createJwtSignupAccount(input: {
  name: string;
  email: string;
  password: string;
  companyName: string;
  plan?: unknown;
  cnpj?: string | null;
  phone?: string | null;
  companyEmail?: string | null;
  address?: string | null;
}) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error("EMAIL_IN_USE");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const localUser = await prisma.user.create({
    data: {
      email,
      password: passwordHash,
      name: input.name,
      systemRole: "USER",
    },
  });

  const company = await provisionCompanyForUser({
    userId: localUser.id,
    companyName: input.companyName,
    plan: parseSignupPlan(input.plan),
    ownerEmail: email,
    cnpj: input.cnpj,
    phone: input.phone,
    email: input.companyEmail,
    address: input.address,
  });

  return { localUser, company };
}
