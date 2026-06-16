import { LITHOLOGY_LEGEND } from "./lithology";
import { STREAM_CATEGORY_META, STREAM_CATEGORY_IDS } from "./stream-categories";
import { streamCategoryColor } from "./hydrography";
import { MAGNETOMETRY_TERNARY_LEGEND, MAGNETOMETRY_ANOMALY_LEGEND } from "./magnetometry-legend";
import {
  miningBlockColor,
  miningPhaseColor,
  placerReserveColor,
  sourceProtectionColor,
} from "./mining";

export type MapLegendItem = {
  id: string;
  label: string;
  color: string;
  kind: "line" | "fill" | "point" | "raster";
};

const LAYER_LABELS: Record<string, string> = {
  rivers: "Rios principais (ord. ≥5)",
  springs: "Nascentes",
  water_bodies: "Corpos hídricos",
  basins: "Bacias hidrográficas",
  hydro_regions: "Regiões hidrográficas",
  lithology: "Litologia CPRM/SGB",
  states: "Estados (UF)",
  municipalities: "Municípios",
  mining_processes: "Processos minerários ANM",
  source_protection: "Proteção de fonte",
  mining_blocks: "Áreas de bloqueio",
  placer_reserves: "Reservas garimpeiras",
  mining_leases: "Arrendamentos",
  magnetometry_ternary: "Magnetometria — ternário",
  magnetometry_anomaly: "Magnetometria — anomalia",
};

function rgba([r, g, b, a = 255]: [number, number, number, number?]): string {
  return `rgba(${r}, ${g}, ${b}, ${(a ?? 255) / 255})`;
}

/** Itens de legenda para camadas activas no mapa / mapa de localização. */
export function buildActiveLegendItems(
  visible: Record<string, boolean>,
  extra?: MapLegendItem[],
): MapLegendItem[] {
  const items: MapLegendItem[] = [];

  for (const id of STREAM_CATEGORY_IDS) {
    if (!visible[id]) continue;
    const meta = STREAM_CATEGORY_META[id];
    const [r, g, b] = streamCategoryColor(meta.category);
    items.push({ id, label: meta.label, color: rgba([r, g, b, 230]), kind: "line" });
  }

  if (visible.rivers) {
    items.push({ id: "rivers", label: LAYER_LABELS.rivers!, color: "rgb(37, 99, 235)", kind: "line" });
  }
  if (visible.springs) {
    items.push({ id: "springs", label: LAYER_LABELS.springs!, color: "rgb(52, 211, 153)", kind: "point" });
  }
  if (visible.water_bodies) {
    items.push({ id: "water_bodies", label: LAYER_LABELS.water_bodies!, color: "rgba(59, 130, 246, 0.7)", kind: "fill" });
  }
  if (visible.basins) {
    items.push({ id: "basins", label: LAYER_LABELS.basins!, color: "rgba(14, 165, 233, 0.45)", kind: "fill" });
  }
  if (visible.hydro_regions) {
    items.push({ id: "hydro_regions", label: LAYER_LABELS.hydro_regions!, color: "rgba(34, 211, 238, 0.35)", kind: "fill" });
  }
  if (visible.lithology) {
    items.push({ id: "lithology", label: LAYER_LABELS.lithology!, color: LITHOLOGY_LEGEND[0]?.color ?? "rgb(198,134,66)", kind: "fill" });
    for (const entry of LITHOLOGY_LEGEND.slice(0, 5)) {
      items.push({ id: `lithology-${entry.label}`, label: entry.label, color: entry.color, kind: "fill" });
    }
  }
  if (visible.states) {
    items.push({ id: "states", label: LAYER_LABELS.states!, color: "rgba(226, 232, 240, 0.85)", kind: "line" });
  }
  if (visible.municipalities) {
    items.push({ id: "municipalities", label: LAYER_LABELS.municipalities!, color: "rgba(148, 163, 184, 0.75)", kind: "line" });
  }
  if (visible.mining_processes) {
    const [r, g, b] = miningPhaseColor("");
    items.push({ id: "mining_processes", label: LAYER_LABELS.mining_processes!, color: rgba([r, g, b, 200]), kind: "fill" });
  }
  if (visible.source_protection) {
    const [r, g, b] = sourceProtectionColor();
    items.push({ id: "source_protection", label: LAYER_LABELS.source_protection!, color: rgba([r, g, b, 200]), kind: "fill" });
  }
  if (visible.mining_blocks) {
    const [r, g, b] = miningBlockColor();
    items.push({ id: "mining_blocks", label: LAYER_LABELS.mining_blocks!, color: rgba([r, g, b, 200]), kind: "fill" });
  }
  if (visible.placer_reserves) {
    const [r, g, b] = placerReserveColor();
    items.push({ id: "placer_reserves", label: LAYER_LABELS.placer_reserves!, color: rgba([r, g, b, 200]), kind: "fill" });
  }
  if (visible.mining_leases) {
    items.push({ id: "mining_leases", label: LAYER_LABELS.mining_leases!, color: "rgba(168, 162, 158, 0.7)", kind: "fill" });
  }
  if (visible.magnetometry_ternary) {
    items.push({
      id: "magnetometry_ternary",
      label: LAYER_LABELS.magnetometry_ternary!,
      color: MAGNETOMETRY_TERNARY_LEGEND.items?.[0]?.color ?? "#8b5cf6",
      kind: "raster",
    });
  }
  if (visible.magnetometry_anomaly) {
    items.push({
      id: "magnetometry_anomaly",
      label: LAYER_LABELS.magnetometry_anomaly!,
      color: MAGNETOMETRY_ANOMALY_LEGEND.gradient?.from ?? "#312e81",
      kind: "raster",
    });
  }

  if (extra) items.push(...extra);

  return items;
}

export function labelForLayerId(id: string): string {
  if (id.startsWith("stream_category_")) {
    return STREAM_CATEGORY_META[id as keyof typeof STREAM_CATEGORY_META]?.label ?? id;
  }
  return LAYER_LABELS[id] ?? id;
}
