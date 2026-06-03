import type { SaasPlanSlug } from "@prisma/client";

export type PlanLimits = {
  maxObras: number;
  maxUsers: number;
  geophysics: boolean;
  portal: boolean;
  label: string;
};

export const PLAN_LIMITS: Record<SaasPlanSlug, PlanLimits> = {
  trial: {
    maxObras: 2,
    maxUsers: 3,
    geophysics: true,
    portal: true,
    label: "Trial",
  },
  pro: {
    maxObras: 999,
    maxUsers: 25,
    geophysics: true,
    portal: true,
    label: "Pro",
  },
  enterprise: {
    maxObras: 9999,
    maxUsers: 999,
    geophysics: true,
    portal: true,
    label: "Enterprise",
  },
};

export function parseSignupPlan(value: unknown): SaasPlanSlug {
  if (value === "pro" || value === "enterprise") return value;
  return "trial";
}
