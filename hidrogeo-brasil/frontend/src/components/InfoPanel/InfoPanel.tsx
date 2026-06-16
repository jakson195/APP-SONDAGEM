import type { FeatureInfo } from "../../types";

type Props = {
  feature: FeatureInfo | null;
  onClose: () => void;
};

export function InfoPanel({ feature, onClose }: Props) {
  if (!feature) return null;

  const title =
    feature.name ?? feature.unit_name ?? feature.code ?? "Elemento";

  return (
    <aside className="pointer-events-auto absolute right-3 top-3 z-10 max-h-[calc(100vh-6rem)] w-96 overflow-y-auto rounded-xl border border-white/10 bg-[#0c1220]/85 p-4 shadow-2xl backdrop-blur-md">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">
            {layerLabel(feature.layer)}
          </p>
          <h2 className="text-sm font-bold text-sky-200">{title}</h2>
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Fechar">
          ✕
        </button>
      </div>

      {feature.layer === "lithology" && <LithologyDetails feature={feature} />}
      {feature.layer === "rivers" && <RiverDetails feature={feature} />}
      {(feature.layer === "secondary_streams" || feature.layer.startsWith("stream_category_")) && (
        <StreamDetails feature={feature} />
      )}
      {feature.layer === "springs" && <SpringDetails feature={feature} />}
      {feature.layer === "water_bodies" && <WaterBodyDetails feature={feature} />}
      {feature.layer === "basins" && <BasinDetails feature={feature} />}
      {feature.layer === "states" && <StateDetails feature={feature} />}
      {feature.layer === "municipalities" && <MunicipalityDetails feature={feature} />}
      {(feature.layer === "mining_processes" ||
        feature.layer === "mining_leilao_areas" ||
        feature.layer === "source_protection" ||
        feature.layer === "mining_blocks" ||
        feature.layer === "placer_reserves" ||
        feature.layer === "mining_leases") && <MiningDetails feature={feature} />}
      {feature.layer === "seismicity" && <SeismicDetails feature={feature} />}
      {feature.layer === "risk" && <RiskDetails feature={feature} />}

      {feature.flow_index != null && (
        <p className="mt-2 rounded bg-sky-950/50 px-2 py-1 text-xs text-sky-200">
          Vazão relativa ({feature.flow_month}): {(feature.flow_index * 100).toFixed(0)}%
        </p>
      )}

      <p className="mt-3 text-[10px] text-slate-500">
        Fonte: {feature.source ?? "—"} · ID {feature.id}
      </p>
    </aside>
  );
}

function LithologyDetails({ feature }: { feature: FeatureInfo }) {
  const summary =
    feature.geology_summary ??
    buildFallbackSummary(feature);

  return (
    <div className="space-y-3">
      <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-50/90">
        {summary}
      </p>

      <dl className="space-y-1.5 text-xs text-slate-300">
        <Row label="Sigla CPRM" value={feature.sigla} />
        <Row label="Unidade" value={feature.unit_name} />
        <Row label="Litotipos" value={feature.litotipos ?? feature.rock_type} />
        <Row label="Idade" value={feature.age} />
        <Row label="Ambiente tectônico" value={feature.ambiente_tectonico} />
        <Row label="Carta / folha" value={feature.mapa_fonte} />
        <Row label="Escala" value={feature.escala} />
      </dl>

      {feature.description && feature.description !== summary && (
        <p className="border-t border-white/5 pt-2 text-[11px] leading-relaxed text-slate-400">
          {feature.description}
        </p>
      )}
    </div>
  );
}

function buildFallbackSummary(feature: FeatureInfo): string {
  const parts: string[] = [];
  if (feature.unit_name) {
    parts.push(`Unidade geológica: ${feature.unit_name}.`);
  }
  if (feature.rock_type) {
    parts.push(`Litologia: ${feature.rock_type}.`);
  }
  if (feature.age) {
    parts.push(`Idade: ${feature.age}.`);
  }
  return parts.join(" ") || "Geologia CPRM/SGB neste ponto.";
}

function RiverDetails({ feature }: { feature: FeatureInfo }) {
  return <StreamDetails feature={feature} />;
}

function StreamDetails({ feature }: { feature: FeatureInfo }) {
  return (
    <dl className="space-y-1.5 text-xs text-slate-300">
      <Row label="Classificação" value={feature.stream_class} />
      {feature.stream_category != null && (
        <Row label="Categoria" value={`${feature.stream_category}ª ordem fluvial`} />
      )}
      <Row label="Ordem Strahler" value={feature.strahler_order} />
      <Row label="Bacia hidrográfica" value={feature.basin} />
      <Row label="Região hidrográfica" value={feature.hydro_region} />
      <Row
        label="Comprimento do trecho"
        value={feature.length_km ? `${feature.length_km.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km` : undefined}
      />
      <Row
        label="Área de drenagem (montante)"
        value={
          feature.upstream_area_km2
            ? `${feature.upstream_area_km2.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km²`
            : undefined
        }
      />
      <Row
        label="Distância à foz"
        value={
          feature.dist_sink_km
            ? `${feature.dist_sink_km.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`
            : undefined
        }
      />
      <Row label="ID HydroRIVERS" value={feature.hyriv_id} />
    </dl>
  );
}

function SpringDetails({ feature }: { feature: FeatureInfo }) {
  return (
    <dl className="space-y-1.5 text-xs text-slate-300">
      <Row label="Tipo" value="Nascente / cabeceira" />
      <Row label="Curso associado" value={feature.stream_name} />
      <Row label="Ordem Strahler" value={feature.strahler_order} />
      <Row label="Bacia" value={feature.basin} />
    </dl>
  );
}

function WaterBodyDetails({ feature }: { feature: FeatureInfo }) {
  return (
    <dl className="space-y-1.5 text-xs text-slate-300">
      <Row label="Tipo" value={feature.type} />
      <Row label="Área" value={feature.area_km2 ? `${feature.area_km2} km²` : undefined} />
    </dl>
  );
}

function BasinDetails({ feature }: { feature: FeatureInfo }) {
  return (
    <dl className="space-y-1.5 text-xs text-slate-300">
      <Row label="Tipo" value={feature.type} />
      <Row label="Código" value={feature.code} />
      <Row
        label="Área"
        value={
          feature.area_km2
            ? `${feature.area_km2.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} km²`
            : undefined
        }
      />
      {feature.description && (
        <p className="border-t border-white/5 pt-2 text-[11px] leading-relaxed text-slate-400">
          {feature.description}
        </p>
      )}
    </dl>
  );
}

function StateDetails({ feature }: { feature: FeatureInfo }) {
  return (
    <dl className="space-y-1.5 text-xs text-slate-300">
      <Row label="UF" value={feature.uf} />
      <Row label="Região" value={feature.region} />
      <Row label="Código IBGE" value={feature.code} />
    </dl>
  );
}

function MunicipalityDetails({ feature }: { feature: FeatureInfo }) {
  return (
    <dl className="space-y-1.5 text-xs text-slate-300">
      <Row label="UF" value={feature.uf} />
      <Row label="Estado" value={feature.state_name} />
      <Row label="Código IBGE" value={feature.code} />
    </dl>
  );
}

function MiningDetails({ feature }: { feature: FeatureInfo }) {
  const summary =
    feature.mining_summary ??
    buildMiningFallbackSummary(feature);

  return (
    <div className="space-y-3">
      <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-50/90">
        {summary}
      </p>
      <dl className="space-y-1.5 text-xs text-slate-300">
        <Row label="Processo" value={feature.process_number ?? feature.code} />
        <Row label="Fase" value={feature.phase} />
        <Row label="Titular" value={feature.holder} />
        <Row label="Substância" value={feature.substance} />
        <Row label="Uso" value={feature.use_type} />
        <Row label="UF" value={feature.uf} />
        <Row
          label="Área"
          value={feature.area_ha ? `${feature.area_ha.toLocaleString("pt-BR")} ha` : undefined}
        />
        <Row label="Último evento" value={feature.last_event} />
        {feature.rodada_exibicao != null && (
          <Row
            label="Rodada SOPLE"
            value={`${feature.rodada_exibicao}ª${feature.rodada_prevista != null && feature.rodada == null ? " (prevista)" : ""}`}
          />
        )}
        {feature.leilao_categoria && (
          <Row label="Categoria leilão" value={feature.leilao_categoria} />
        )}
        <Row label="Data leilão" value={feature.data_leilao as string | undefined} />
        <Row label="Publicação oferta" value={feature.data_oferta_pub as string | undefined} />
        <Row
          label="Valor mínimo"
          value={
            feature.valor_minimo != null
              ? `R$ ${Number(feature.valor_minimo).toLocaleString("pt-BR")}`
              : undefined
          }
        />
        <Row label="Status leilão" value={feature.status_leilao as string | undefined} />
      </dl>
      <div className="flex flex-wrap gap-2 pt-1">
        <a
          href="https://geo.anm.gov.br/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-amber-400 underline"
        >
          SIGMINE
        </a>
        <a
          href="https://sople.anm.gov.br/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-amber-400 underline"
        >
          SOPLE
        </a>
        <a
          href="https://sistemas.anm.gov.br/SCM/Extra/site/consulta/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-amber-400 underline"
        >
          Cadastro Mineiro
        </a>
      </div>
    </div>
  );
}

function buildMiningFallbackSummary(feature: FeatureInfo): string {
  const parts: string[] = [];
  if (feature.process_number || feature.code) {
    parts.push(`Processo ANM ${feature.process_number ?? feature.code}.`);
  }
  if (feature.phase) parts.push(`Fase: ${feature.phase}.`);
  if (feature.substance) parts.push(`Substância: ${feature.substance}.`);
  if (feature.holder) parts.push(`Titular: ${feature.holder}.`);
  return parts.join(" ") || "Dado mineral ANM/SIGMINE neste ponto.";
}

function SeismicDetails({ feature }: { feature: FeatureInfo }) {
  return (
    <dl className="space-y-1.5 text-xs text-slate-300">
      <Row label="Magnitude" value={feature.magnitude} />
      <Row label="Profundidade" value={feature.depth_km ? `${feature.depth_km} km` : undefined} />
    </dl>
  );
}

function RiskDetails({ feature }: { feature: FeatureInfo }) {
  return (
    <dl className="space-y-1.5 text-xs text-slate-300">
      <Row label="Processo" value={feature.type} />
      <Row label="Grau de risco" value={feature.risk_grade} />
    </dl>
  );
}

function layerLabel(layer: string) {
  const map: Record<string, string> = {
    rivers: "Hidrografia · Rio principal",
    secondary_streams: "Hidrografia · Córrego",
    stream_category_1: "Hidrografia · Córrego 1ª categoria",
    stream_category_2: "Hidrografia · Córrego 2ª categoria",
    stream_category_3: "Hidrografia · Córrego 3ª categoria",
    stream_category_4: "Hidrografia · Córrego 4ª categoria",
    springs: "Hidrografia · Nascente",
    lithology: "Geologia · Litologia CPRM/SGB",
    water_bodies: "Corpo hídrico",
    basins: "Hidrografia · Bacia por exutório",
    hydro_regions: "Hidrografia · Região hidrográfica",
    states: "Limites · Estado (UF)",
    municipalities: "Limites · Município",
    mining_leilao_areas: "ANM · Leilão SOPLE",
    mining_processes: "Mineração · Processo ANM",
    source_protection: "Mineração · Proteção de fonte",
    mining_blocks: "Mineração · Bloqueio",
    placer_reserves: "Mineração · Reserva garimpeira",
    mining_leases: "Mineração · Arrendamento",
    seismicity: "Sismicidade",
    risk: "Risco geológico",
    imported: "Camada importada",
  };
  return map[layer] ?? layer;
}

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between gap-2 border-b border-white/5 py-1">
      <dt className="text-slate-500">{label}</dt>
      <dd className="max-w-[58%] text-right font-medium text-slate-200">{value}</dd>
    </div>
  );
}
