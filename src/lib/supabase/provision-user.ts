import bcrypt from "bcrypt";
import type { SystemRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncUserFromSupabase } from "@/lib/auth-user-sync";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAuthConfigured } from "@/lib/supabase/config";

type Input = {
  email: string;
  name?: string | null;
  password?: string | null;
  systemRole?: SystemRole;
};

export async function provisionPlatformUser(input: Input) {
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error("Email é obrigatório.");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing?.supabaseAuthId) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        name: input.name?.trim() || existing.name,
        ...(input.systemRole ? { systemRole: input.systemRole } : {}),
      },
    });
  }

  if (isSupabaseAuthConfigured()) {
    const password = input.password ?? "";
    if (password.length < 8) {
      throw new Error("Defina uma palavra-passe com pelo menos 8 caracteres.");
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: input.name?.trim() ? { name: input.name.trim() } : undefined,
    });
    if (error || !data.user) {
      throw new Error(error?.message ?? "Falha ao criar utilizador no Supabase Auth.");
    }

    const local = await syncUserFromSupabase(data.user);
    if (input.systemRole && local.systemRole !== input.systemRole) {
      return prisma.user.update({
        where: { id: local.id },
        data: { systemRole: input.systemRole },
      });
    }
    return local;
  }

  if (!input.password || input.password.length < 8) {
    throw new Error("Defina uma palavra-passe com pelo menos 8 caracteres.");
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        password: passwordHash,
        name: input.name?.trim() || existing.name,
        ...(input.systemRole ? { systemRole: input.systemRole } : {}),
      },
    });
  }

  return prisma.user.create({
    data: {
      email,
      password: passwordHash,
      name: input.name?.trim() || null,
      systemRole: input.systemRole ?? "USER",
    },
  });
}
