import type { LucideIcon } from "lucide-react";
import {
  DIGITAL_TWIN_BASE,
  CESIUM_ROUTE_PREFIXES,
  digitalTwinGroupIcon,
  platformModules,
} from "@/modules/registry";

export type DigitalTwinNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  description?: string;
};

export { DIGITAL_TWIN_BASE, CESIUM_ROUTE_PREFIXES, digitalTwinGroupIcon };

export function isCesiumRoute(pathname: string): boolean {
  return CESIUM_ROUTE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

const dt = platformModules.find((m) => m.id === "digital-twin");

export const digitalTwinNavItems: DigitalTwinNavItem[] =
  dt?.nav
    .filter((n) => n.parent === "digital-twin" && n.icon)
    .map((n) => ({
      href: n.href,
      label: n.label,
      icon: n.icon!,
      description: n.description,
    })) ?? [];

export function isDigitalTwinPath(pathname: string): boolean {
  return pathname === DIGITAL_TWIN_BASE || pathname.startsWith(`${DIGITAL_TWIN_BASE}/`);
}
