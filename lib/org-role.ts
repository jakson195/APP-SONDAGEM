import type { OrgRole } from "@prisma/client";

const ROLES: OrgRole[] = ["ADMIN", "MANAGER", "MEMBER", "VIEWER"];

export function parseOrgRole(v: unknown): OrgRole | null {
  if (typeof v !== "string") return null;
  return ROLES.includes(v as OrgRole) ? (v as OrgRole) : null;
}
