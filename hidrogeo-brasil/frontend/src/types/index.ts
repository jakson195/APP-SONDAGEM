import { normalizeMvtMiningProps } from "../lib/mining-feature";
import { streamCategoryLabel, streamClassLabel } from "../layers/hydrography";

export type LayerDef = {
  id: string;
  label: string;
  type: string;
  tileTemplate?: string;
  defaultVisible?: boolean;
  status?: string;
};

export type LayerGroup = {
  id: string;
  label: string;
  layers: LayerDef[];
};

export type FeatureInfo = {
  id: number;
  layer: string;
  name?: string;
  strahler_order?: number;
  basin?: string;
  hydro_region?: string;
  length_km?: number;
  source?: string;
  stream_name?: string;
  unit_name?: string;
  rock_type?: string;
  age?: string;
  description?: string;
  type?: string;
  area_km2?: number;
  area_ha?: number;
  code?: string;
  magnitude?: number;
  depth_km?: number;
  risk_grade?: string;
  factor_of_safety?: number;
  risk_class?: string;
  attrs?: Record<string, unknown>;
  geometry?: GeoJSON.Geometry;
  geology_summary?: string;
  sigla?: string;
  litotipos?: string;
  ambiente_tectonico?: string;
  mapa_fonte?: string;
  escala?: string;
  uf?: string;
  state_name?: string;
  region?: string;
  process_number?: string;
  phase?: string;
  holder?: string;
  substance?: string;
  use_type?: string;
  last_event?: string;
  mining_summary?: string;
  rodada?: number;
  rodada_prevista?: number;
  rodada_exibicao?: number;
  leilao_categoria?: string;
  data_leilao?: string;
  data_oferta_pub?: string;
  valor_minimo?: number;
  status_leilao?: string;
  flow_index?: number;
  flow_month?: string;
  stream_class?: string;
  stream_category?: number;
  hyriv_id?: string;
  upstream_area_km2?: number;
  dist_sink_km?: number;
};

function enrichStreamFields(raw: Record<string, unknown>, order: number): Partial<FeatureInfo> {
  const attrs = (raw.attrs as Record<string, unknown>) ?? {};
  const upArea = attrs.UP_AREA ?? attrs.up_area;
  const distSink = attrs.DIST_SINK ?? attrs.dist_sink;
  const hyrivId = attrs.HYRIV_ID ?? attrs.hyriv_id;
  return {
    stream_class: streamClassFromOrder(order),
    hyriv_id: hyrivId != null ? String(hyrivId) : undefined,
    upstream_area_km2: upArea != null && upArea !== "" ? Number(upArea) : undefined,
    dist_sink_km: distSink != null && distSink !== "" ? Number(distSink) : undefined,
  };
}

function streamClassFromOrder(order: number): string {
  if (order >= 1 && order <= 4) return streamCategoryLabel(order);
  return streamClassLabel(order);
}

function featureFromStreamLayer(
  layer: string,
  raw: Record<string, unknown>,
  order: number,
): FeatureInfo {
  const category = Number(raw.stream_category ?? order);
  return {
    id: Number(raw.id ?? 0),
    layer,
    name: String(raw.name ?? "Curso d'água"),
    strahler_order: order,
    stream_category: category,
    basin: raw.basin ? String(raw.basin) : undefined,
    hydro_region: raw.hydro_region ? String(raw.hydro_region) : undefined,
    length_km: raw.length_km ? Number(raw.length_km) : undefined,
    source: raw.source ? String(raw.source) : "HydroRIVERS",
    attrs: (raw.attrs as Record<string, unknown>) ?? undefined,
    geometry: raw.geometry as GeoJSON.Geometry | undefined,
    ...enrichStreamFields(raw, order),
  };
}

export function featureFromApi(layer: string, raw: Record<string, unknown>): FeatureInfo {
  const base: FeatureInfo = {
    id: Number(raw.id ?? 0),
    layer,
    attrs: (raw.attrs as Record<string, unknown>) ?? undefined,
    geometry: raw.geometry as GeoJSON.Geometry | undefined,
  };
  if (layer === "rivers") {
    const order = Number(raw.strahler_order ?? 0);
    return {
      ...base,
      name: String(raw.name ?? "Rio"),
      strahler_order: order,
      basin: raw.basin ? String(raw.basin) : undefined,
      hydro_region: raw.hydro_region ? String(raw.hydro_region) : undefined,
      length_km: raw.length_km ? Number(raw.length_km) : undefined,
      source: raw.source ? String(raw.source) : "HydroRIVERS",
      ...enrichStreamFields(raw, order),
    };
  }
  if (layer === "secondary_streams") {
    const order = Number(raw.strahler_order ?? 0);
    return featureFromStreamLayer("secondary_streams", raw, order);
  }
  if (layer.startsWith("stream_category_")) {
    const order = Number(raw.strahler_order ?? layer.split("_").pop() ?? 0);
    return featureFromStreamLayer(layer, raw, order);
  }
  if (layer === "springs") {
    return {
      ...base,
      layer: "springs",
      name: String(raw.name ?? "Nascente"),
      stream_name: raw.stream_name ? String(raw.stream_name) : undefined,
      strahler_order: Number(raw.strahler_order ?? 1),
      basin: raw.basin ? String(raw.basin) : undefined,
      source: raw.source ? String(raw.source) : "HydroRIVERS",
    };
  }
  if (layer === "lithology") {
    const attrs = (raw.attrs as Record<string, unknown>) ?? {};
    const sigla = String(attrs.sigla ?? raw.sigla ?? "").trim();
    const unitName = String(raw.unit_name ?? attrs.nome ?? "Unidade geológica");
    return {
      ...base,
      name: unitName,
      unit_name: unitName,
      sigla: sigla || undefined,
      rock_type: raw.rock_type ? String(raw.rock_type) : String(attrs.litotipos ?? "") || undefined,
      litotipos: attrs.litotipos ? String(attrs.litotipos) : undefined,
      age: raw.age ? String(raw.age) : undefined,
      description: raw.description ? String(raw.description) : String(attrs.legenda ?? "") || undefined,
      ambiente_tectonico: attrs.ambiente_tectonico ? String(attrs.ambiente_tectonico) : undefined,
      mapa_fonte: attrs.mapa ? String(attrs.mapa) : undefined,
      escala: attrs.escala ? String(attrs.escala) : undefined,
      geology_summary: raw.geology_summary ? String(raw.geology_summary) : undefined,
      source: raw.source ? String(raw.source) : "CPRM/SGB — GeoSGB",
    };
  }
  if (layer === "states") {
    return {
      ...base,
      name: String(raw.name ?? raw.uf ?? "Estado"),
      code: raw.code ? String(raw.code) : undefined,
      uf: raw.uf ? String(raw.uf) : undefined,
      region: raw.region ? String(raw.region) : undefined,
      source: "IBGE — malha 2022",
    };
  }
  if (layer === "municipalities") {
    return {
      ...base,
      name: String(raw.name ?? "Município"),
      code: raw.code ? String(raw.code) : undefined,
      uf: raw.uf ? String(raw.uf) : undefined,
      state_name: raw.state_name ? String(raw.state_name) : undefined,
      source: "IBGE — malha 2022",
    };
  }
  if (layer === "mining_leilao_areas" || layer === "mining_processes") {
    return {
      ...base,
      name: String(raw.process_number ?? "Processo minerário"),
      process_number: raw.process_number ? String(raw.process_number) : undefined,
      phase: raw.phase ? String(raw.phase) : undefined,
      holder: raw.holder ? String(raw.holder) : undefined,
      substance: raw.substance ? String(raw.substance) : undefined,
      use_type: raw.use_type ? String(raw.use_type) : undefined,
      area_ha: raw.area_ha ? Number(raw.area_ha) : undefined,
      uf: raw.uf ? String(raw.uf) : undefined,
      last_event: raw.last_event ? String(raw.last_event) : undefined,
      rodada: raw.rodada != null ? Number(raw.rodada) : undefined,
      rodada_prevista: raw.rodada_prevista != null ? Number(raw.rodada_prevista) : undefined,
      rodada_exibicao: raw.rodada_exibicao != null ? Number(raw.rodada_exibicao) : undefined,
      leilao_categoria: raw.leilao_categoria ? String(raw.leilao_categoria) : undefined,
      data_leilao: raw.data_leilao ? String(raw.data_leilao) : undefined,
      data_oferta_pub: raw.data_oferta_pub ? String(raw.data_oferta_pub) : undefined,
      valor_minimo: raw.valor_minimo != null ? Number(raw.valor_minimo) : undefined,
      status_leilao: raw.status_leilao ? String(raw.status_leilao) : undefined,
      mining_summary: raw.mining_summary ? String(raw.mining_summary) : undefined,
      source: layer === "mining_leilao_areas" ? "ANM — Leilão SOPLE" : "ANM — SIGMINE",
    };
  }
  if (layer === "source_protection" || layer === "mining_blocks" || layer === "placer_reserves" || layer === "mining_leases") {
    return {
      ...base,
      name: String(raw.name ?? raw.process_number ?? raw.code ?? "Área ANM"),
      code: raw.code ? String(raw.code) : undefined,
      process_number: raw.process_number ? String(raw.process_number) : undefined,
      area_ha: raw.area_ha ? Number(raw.area_ha) : undefined,
      uf: raw.uf ? String(raw.uf) : undefined,
      mining_summary: raw.mining_summary ? String(raw.mining_summary) : undefined,
      source: "ANM — SIGMINE",
    };
  }
  return { ...base, name: String(raw.name ?? raw.unit_name ?? layer) };
}

export function featureFromPick(layerId: string, props: Record<string, unknown>): FeatureInfo {
  if (layerId.includes("lithology")) {
    return featureFromApi("lithology", props);
  }
  if (layerId.includes("municipalities")) {
    return featureFromApi("municipalities", props);
  }
  if (layerId.includes("states")) {
    return featureFromApi("states", props);
  }
  if (layerId.includes("mining-leilao")) {
    return featureFromApi("mining_leilao_areas", normalizeMvtMiningProps(props));
  }
  if (layerId.includes("mining-processes")) {
    return featureFromApi("mining_processes", normalizeMvtMiningProps(props));
  }
  if (layerId.includes("source-protection")) {
    return featureFromApi("source_protection", normalizeMvtMiningProps(props));
  }
  if (layerId.includes("mining-blocks")) {
    return featureFromApi("mining_blocks", normalizeMvtMiningProps(props));
  }
  if (layerId.includes("placer-reserves")) {
    return featureFromApi("placer_reserves", normalizeMvtMiningProps(props));
  }
  if (layerId.includes("mining-leases")) {
    return featureFromApi("mining_leases", normalizeMvtMiningProps(props));
  }
  if (layerId.includes("secondary-streams")) {
    return featureFromApi("secondary_streams", props);
  }
  const streamCatMatch = layerId.match(/stream-category-(\d)/);
  if (streamCatMatch) {
    return featureFromApi(`stream_category_${streamCatMatch[1]}`, props);
  }
  if (layerId.includes("springs")) {
    return featureFromApi("springs", props);
  }
  if (layerId.includes("rivers")) {
    return featureFromApi("rivers", props);
  }
  return featureFromApi("rivers", props);
}
