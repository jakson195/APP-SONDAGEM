import bcrypt from "bcrypt";
import type { SystemRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncUserFromSupabase } from "@/lib/auth-user-sync";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  isSupabaseAuthConfigured,
  supabaseAuthSetupMessage,
} from "@/lib/supabase";

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
    if (isSupabaseAuthConfigured() && input.password && input.password.length >= 8) {
      const admin = createSupabaseAdminClient();
      const { error } = await admin.auth.admin.updateUserById(existing.supabaseAuthId, {
        password: input.password,
        ...(input.name?.trim() ? { user_metadata: { name: input.name.trim() } } : {}),
      });
      if (error) {
        throw new Error(error.message ?? "Falha ao atualizar palavra-passe no Supabase.");
      }
    }
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
    if (error) {
      const msg = error.message ?? "";
      const alreadyExists =
        msg.toLowerCase().includes("already") || msg.toLowerCase().includes("registered");
      if (alreadyExists) {
        const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
        const authUser = list?.users?.find((u) => u.email?.toLowerCase() === email);
        if (!authUser) {
          throw new Error(msg || "Utilizador já existe mas não foi encontrado no Supabase.");
        }
        const { error: updateErr } = await admin.auth.admin.updateUserById(authUser.id, {
          password,
          email_confirm: true,
          ...(input.name?.trim() ? { user_metadata: { name: input.name.trim() } } : {}),
        });
        if (updateErr) {
          throw new Error(updateErr.message ?? "Falha ao atualizar utilizador no Supabase.");
        }
        const local = await syncUserFromSupabase(authUser);
        if (input.systemRole && local.systemRole !== input.systemRole) {
          return prisma.user.update({
            where: { id: local.id },
            data: { systemRole: input.systemRole },
          });
        }
        return local;
      }
      throw new Error(msg || "Falha ao criar utilizador no Supabase Auth.");
    }
    if (!data.user) {
      throw new Error("Falha ao criar utilizador no Supabase Auth.");
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

  if (!isSupabaseAuthConfigured()) {
    throw new Error(supabaseAuthSetupMessage());
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
