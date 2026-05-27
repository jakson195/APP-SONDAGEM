import type { SystemRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type AuthUser = {
  id: number;
  email: string;
  name: string | null;
  systemRole: SystemRole;
};

export function isLocalAuthBypassEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.AUTH_BYPASS_LOCAL === "1";
}

export async function getLocalBypassAuthUser(): Promise<AuthUser | null> {
  if (!isLocalAuthBypassEnabled()) return null;

  const admin = await prisma.user.findFirst({
    where: {
      systemRole: {
        in: ["MASTER_ADMIN", "SUPER_ADMIN"],
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
      systemRole: true,
    },
    orderBy: { id: "asc" },
  });
  if (admin) return admin;

  const firstUser = await prisma.user.findFirst({
    select: {
      id: true,
      email: true,
      name: true,
      systemRole: true,
    },
    orderBy: { id: "asc" },
  });
  if (firstUser) {
    return {
      ...firstUser,
      systemRole: "MASTER_ADMIN",
    };
  }

  return prisma.user.create({
    data: {
      email: "local-auth-bypass@datageodigital.local",
      name: "Local Auth Bypass",
      password: null,
      systemRole: "MASTER_ADMIN",
    },
    select: {
      id: true,
      email: true,
      name: true,
      systemRole: true,
    },
  });
}
