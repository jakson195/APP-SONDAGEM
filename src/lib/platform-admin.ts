import type { SystemRole } from "@prisma/client";

/** Administrador de plataforma (SUPER_ADMIN ou legado MASTER_ADMIN). */
export function isPlatformSuperAdmin(role: SystemRole): boolean {
  return role === "SUPER_ADMIN" || role === "MASTER_ADMIN";
}
