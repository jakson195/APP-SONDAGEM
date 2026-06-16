/** Paleta por rodada SOPLE (RGBA). */
export const RODADA_COLORS: Record<number, [number, number, number, number]> = {
  1: [255, 100, 50, 170],
  2: [50, 200, 100, 170],
  3: [50, 150, 255, 170],
  4: [200, 100, 255, 170],
  5: [245, 158, 11, 170],
  6: [236, 72, 153, 170],
  7: [14, 165, 233, 170],
  8: [250, 204, 21, 175],
  9: [168, 85, 247, 180],
};

export type LeilaoCategoria = "confirmada" | "prevista" | "candidata" | "historica" | "outra";

export type LeilaoCategoriaToggleKey = "confirmada" | "prevista" | "candidata" | "historica";

export const LEILAO_CATEGORIA_LABELS: Record<LeilaoCategoria, string> = {
  confirmada: "Confirmada (edital)",
  prevista: "Prevista — próxima rodada",
  candidata: "Candidata (DISPONIB.)",
  historica: "Rodada histórica",
  outra: "Outra",
};

export type LeilaoCategoriaToggles = {
  confirmada: boolean;
  prevista: boolean;
  candidata: boolean;
  historica: boolean;
};

export const DEFAULT_LEILAO_CATEGORIAS: LeilaoCategoriaToggles = {
  confirmada: true,
  prevista: true,
  candidata: true,
  historica: false,
};

export function rodadaColor(rodada: number | null | undefined): [number, number, number, number] {
  if (rodada == null || Number.isNaN(rodada)) {
    return [180, 180, 180, 120];
  }
  return RODADA_COLORS[rodada] ?? [245, 158, 11, 150];
}

function blendRgb(
  a: [number, number, number, number],
  b: [number, number, number, number],
  t: number,
): [number, number, number, number] {
  return [
    Math.round(a[0] * (1 - t) + b[0] * t),
    Math.round(a[1] * (1 - t) + b[1] * t),
    Math.round(a[2] * (1 - t) + b[2] * t),
    Math.round(a[3] * (1 - t) + b[3] * t),
  ];
}

/** Cor de preenchimento MVT leilão — categoria + filtros UF/rodada. */
export function leilaoAreaFillColor(
  props: Record<string, unknown> | undefined,
  opts: {
    layerOpacity?: number;
    rodadaFilter?: number[];
    ufFilter?: string[];
    categorias?: LeilaoCategoriaToggles;
  },
): [number, number, number, number] {
  const opacity = opts.layerOpacity ?? 0.72;
  const uf = String(props?.uf ?? "").toUpperCase();
  const ufFilter = opts.ufFilter ?? [];
  if (ufFilter.length > 0 && !ufFilter.includes(uf)) {
    return [0, 0, 0, 0];
  }

  const categoria = String(props?.leilao_categoria ?? "candidata") as LeilaoCategoria;
  const toggles = opts.categorias ?? DEFAULT_LEILAO_CATEGORIAS;
  const toggleKey = (
    categoria === "outra" ? "candidata" : categoria
  ) as LeilaoCategoriaToggleKey;
  if (!toggles[toggleKey]) {
    return [0, 0, 0, 0];
  }

  const rodadaExib = Number(props?.rodada_exibicao ?? props?.rodada ?? props?.rodada_prevista);
  const filter = opts.rodadaFilter ?? [];
  if (filter.length > 0 && Number.isFinite(rodadaExib) && !filter.includes(rodadaExib)) {
    return [0, 0, 0, 0];
  }

  const base = rodadaColor(Number.isFinite(rodadaExib) ? rodadaExib : null);

  if (categoria === "prevista") {
    const purple: [number, number, number, number] = [168, 85, 247, 200];
    const [r, g, b, a] = blendRgb(base, purple, 0.45);
    return [r, g, b, Math.round(a * opacity)];
  }
  if (categoria === "candidata") {
    return [140, 145, 160, Math.round(95 * opacity)];
  }
  if (categoria === "historica") {
    const [r, g, b, a] = base;
    return [r, g, b, Math.round(a * 0.35 * opacity)];
  }

  const [r, g, b, a] = base;
  return [r, g, b, Math.round(a * opacity)];
}

export function leilaoAreaLineColor(
  props: Record<string, unknown> | undefined,
  layerOpacity: number,
): [number, number, number, number] {
  const categoria = String(props?.leilao_categoria ?? "");
  if (categoria === "prevista") {
    return [196, 132, 252, Math.round(200 * layerOpacity)];
  }
  if (categoria === "candidata") {
    return [203, 213, 225, Math.round(100 * layerOpacity)];
  }
  return [255, 255, 255, Math.round(120 * layerOpacity)];
}

export function rodadaLabel(rodada: number | null | undefined): string {
  if (rodada == null) return "Sem rodada";
  return `${rodada}ª Rodada SOPLE`;
}

/** Formata data ISO (YYYY-MM-DD) para dd/mm/aaaa. */
export function formatLeilaoDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return iso;
  return `${day}/${m}/${y}`;
}
