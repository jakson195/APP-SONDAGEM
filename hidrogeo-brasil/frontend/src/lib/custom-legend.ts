import type { MapLegendItem } from "../layers/active-layer-legend";

const DEFAULT_COLOR = "#333333";

/** Uma linha: "Rótulo", "Rótulo;#ff0000" ou "Rótulo;#ff0000;line|fill|point" */
export function parseCustomLegendText(text: string): MapLegendItem[] {
  const items: MapLegendItem[] = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!.trim();
    if (!raw || raw.startsWith("#")) continue;

    const parts = raw.split(";").map((p) => p.trim());
    const label = parts[0];
    if (!label) continue;

    const color = parts[1]?.startsWith("#") ? parts[1] : DEFAULT_COLOR;
    const kindRaw = (parts[2] ?? "line").toLowerCase();
    const kind =
      kindRaw === "fill" || kindRaw === "point" || kindRaw === "line" || kindRaw === "raster"
        ? kindRaw
        : "line";

    items.push({
      id: `custom-${i}-${label.slice(0, 12)}`,
      label,
      color,
      kind,
    });
  }

  return items;
}
