import type { FeatureInfo } from "../types";

export function buildMiningSummary(feature: Partial<FeatureInfo>): string {
  const parts: string[] = [];
  const process = feature.process_number ?? feature.code ?? feature.name;
  if (process) parts.push(`Processo minerário ANM ${process}.`);
  if (feature.phase) parts.push(`Fase: ${feature.phase}.`);
  if (feature.holder) parts.push(`Titular: ${feature.holder}.`);
  if (feature.substance) parts.push(`Substância: ${feature.substance}.`);
  if (feature.use_type) parts.push(`Uso: ${feature.use_type}.`);
  if (feature.area_ha != null) parts.push(`Área: ${feature.area_ha.toLocaleString("pt-BR")} ha.`);
  if (feature.uf) parts.push(`UF: ${feature.uf}.`);
  return parts.join(" ") || "Dado mineral ANM/SIGMINE neste ponto.";
}

export function normalizeMvtMiningProps(props: Record<string, unknown>): Record<string, unknown> {
  const attrs = (props.attrs as Record<string, unknown> | undefined) ?? {};
  return {
    ...props,
    id: props.id,
    process_number:
      props.process_number ?? props.PROCESSO ?? attrs.PROCESSO ?? attrs.process_number,
    phase: props.phase ?? props.FASE ?? attrs.FASE,
    holder: props.holder ?? props.NOME ?? attrs.NOME,
    substance: props.substance ?? props.SUBS ?? attrs.SUBS,
    use_type: props.use_type ?? props.USO ?? attrs.USO,
    area_ha: props.area_ha ?? props.AREA_HA ?? attrs.AREA_HA,
    uf: props.uf ?? props.UF ?? attrs.UF,
    last_event: props.last_event ?? props.ULT_EVENTO ?? attrs.ULT_EVENTO,
    rodada: props.rodada ?? attrs.rodada,
    data_leilao: props.data_leilao ?? attrs.data_leilao,
    valor_minimo: props.valor_minimo ?? attrs.valor_minimo,
    status_leilao: props.status_leilao ?? attrs.status_leilao,
    name: props.name ?? props.process_number ?? props.NOME ?? attrs.NOME,
  };
}

export function layerIdFromDeckLayer(deckLayerId: string): string | null {
  if (deckLayerId.includes("mining-leilao")) return "mining_leilao_areas";
  if (deckLayerId.includes("mining-processes")) return "mining_processes";
  if (deckLayerId.includes("source-protection")) return "source_protection";
  if (deckLayerId.includes("mining-blocks")) return "mining_blocks";
  if (deckLayerId.includes("placer-reserves")) return "placer_reserves";
  if (deckLayerId.includes("mining-leases")) return "mining_leases";
  if (deckLayerId.includes("lithology")) return "lithology";
  if (deckLayerId.includes("municipalities")) return "municipalities";
  if (deckLayerId.includes("states")) return "states";
  if (deckLayerId.includes("rivers")) return "rivers";
  return null;
}

export const MINING_DECK_LAYER_PREFIXES = [
  "mining-processes",
  "source-protection",
  "mining-blocks",
  "placer-reserves",
  "mining-leases",
];
