import { digitalTwinNavItems } from "@/lib/digital-twin-nav";

export function digitalTwinSection(slug: string) {
  const item = digitalTwinNavItems.find((i) => i.href.endsWith(`/${slug}`));
  if (!item) throw new Error(`Digital Twin section not found: ${slug}`);
  return item;
}
