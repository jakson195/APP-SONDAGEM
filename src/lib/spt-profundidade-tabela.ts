/**
 * Profundidades de registro SPT alinhadas à tabela usual: 0,00; 0,05; depois
 * para cada metro n≥1: n,00 e n,45 (amostragem típica em 45 cm).
 */

export function round2ProfSpt(m: number): number {
  return Math.round(m * 100) / 100;
}

/**
 * Par (profundidade A, profundidade B) para o n-ésimo clique em "Adicionar metro".
 * Clique 1 → 0,00 e 0,05. Clique 2 → 1,00 e 1,45. Clique 3 → 2,00 e 2,45, …
 */
export function parProfundidadesSptParaClique(numeroClique: number): [number, number] {
  if (numeroClique < 1) return [0, 0.05];
  if (numeroClique === 1) return [0, 0.05];
  const m = numeroClique - 1;
  return [m, round2ProfSpt(m + 0.45)];
}

/** Quantos cliques de "adicionar par" já estão refletidos em N linhas (pares). */
export function inferNumeroCliquesSptDeContagemLinhas(
  quantidadeLinhas: number,
): number {
  if (quantidadeLinhas <= 0) return 0;
  return Math.ceil(quantidadeLinhas / 2);
}

/** Formato visual pt-BR (vírgula decimal). */
export function formatarProfSptPt(m: number): string {
  return round2ProfSpt(m).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Avanço padrão por profundidade (modelo de campo / relatório):
 * 0,00 e 0,05 → TD; n,00 com n≥1 → LV (lavo); n,45 → BT (bato / SPT).
 */
export function avancoPadraoParaProfSpt(profM: number): string {
  const p = round2ProfSpt(profM);
  if (p <= 0.001 || Math.abs(p - 0.05) < 0.02) return "TD";
  const whole = Math.floor(p + 1e-4);
  const frac = round2ProfSpt(p - whole);
  if (whole >= 1 && frac < 0.1) return "LV";
  if (whole >= 1 && frac > 0.4 && frac < 0.49) return "BT";
  return "";
}

/**
 * Nº da amostra por faixa de 1 m de profundidade:
 * de 0 m até antes de 1 m → 0 (ex.: 0,00 e 0,05);
 * de 1 m até antes de 2 m → 1 (ex.: 1,00 e 1,45);
 * de 2 m até antes de 3 m → 2; e assim por metro.
 */
export function numeroAmostraSpt(profM: number): number {
  const p = round2ProfSpt(profM);
  if (p < 1) return 0;
  return Math.floor(p + 1e-4);
}

/** Parte inteira (m) e complemento (m), ex.: 1,45 → metro 1 + 0,45. */
export function profParaMetroESuplemento(profM: number): {
  metro: number;
  suplemento: number;
} {
  const p = round2ProfSpt(profM);
  const metro = Math.floor(p + 1e-4);
  const suplemento = round2ProfSpt(p - metro);
  return { metro, suplemento };
}

export function profDesdeMetroESuplemento(
  metro: number,
  suplemento: number,
): number {
  const m = Math.max(0, Math.round(metro));
  const s = Math.max(0, round2ProfSpt(suplemento));
  return round2ProfSpt(m + s);
}

/** Golpes SPT como inteiro (evita concatenação de strings na soma). */
export function golpesSptNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.max(0, Math.round(v));
  }
  const t = String(v ?? "").trim().replace(",", ".");
  if (t === "") return 0;
  const n = parseFloat(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

export function somasGolpes30cm(
  g1: unknown,
  g2: unknown,
  g3: unknown,
): { s12: number; s23: number } {
  const a = golpesSptNum(g1);
  const b = golpesSptNum(g2);
  const c = golpesSptNum(g3);
  return { s12: a + b, s23: b + c };
}

export type LinhaGolpesSpt = {
  prof: number;
  g1: unknown;
  g2: unknown;
  g3: unknown;
  avanco?: string;
};

export function avancoEfetivoSptLinha(l: {
  prof: number;
  avanco?: string;
}): string {
  return (l.avanco ?? "").trim() || avancoPadraoParaProfSpt(l.prof);
}

function totalGolpesLinhaSpt(l: LinhaGolpesSpt): number {
  return golpesSptNum(l.g1) + golpesSptNum(l.g2) + golpesSptNum(l.g3);
}

/**
 * Golpes usados nas somas 30 cm: na linha BT usa os próprios; na LV/TD, se vazia,
 * usa os golpes da linha BT do mesmo metro (onde o SPT costuma ser registado).
 */
export function golpesParaSomas30cmNaLinha(
  linhas: LinhaGolpesSpt[],
  indice: number,
): { g1: unknown; g2: unknown; g3: unknown } {
  const l = linhas[indice];
  if (!l) return { g1: 0, g2: 0, g3: 0 };

  const profs = linhas.map((x) => x.prof);
  const span = rowSpanGrupoAmostraSpt(indice, profs);
  const av = avancoEfetivoSptLinha(l);

  if (av === "BT" || totalGolpesLinhaSpt(l) > 0) {
    return { g1: l.g1, g2: l.g2, g3: l.g3 };
  }

  for (let j = indice; j < indice + span.span && j < linhas.length; j++) {
    const lj = linhas[j];
    if (avancoEfetivoSptLinha(lj) === "BT" && totalGolpesLinhaSpt(lj) > 0) {
      return { g1: lj.g1, g2: lj.g2, g3: lj.g3 };
    }
  }
  return { g1: l.g1, g2: l.g2, g3: l.g3 };
}

export function somasGolpes30cmNaLinha(
  linhas: LinhaGolpesSpt[],
  indice: number,
): { s12: number; s23: number } {
  const g = golpesParaSomas30cmNaLinha(linhas, indice);
  return somasGolpes30cm(g.g1, g.g2, g.g3);
}

export function temGolpesParaColuna30cm(
  g1: unknown,
  g2: unknown,
  g3: unknown,
  coluna: "s12" | "s23",
): boolean {
  if (coluna === "s12") {
    return golpesSptNum(g1) > 0 || golpesSptNum(g2) > 0;
  }
  return golpesSptNum(g2) > 0 || golpesSptNum(g3) > 0;
}

/** Texto para células 1º+2º / 2º+3º na grelha (modelo Excel). */
export function exibirSomaGolpes30cm(
  soma: number,
  avanco: string,
  coluna: "s12" | "s23",
  modo: "campo" | "pdf" = "campo",
  temEntrada = true,
): string | number {
  void coluna;
  const av = (avanco ?? "").trim();
  if (modo === "pdf" && av === "BT") return "";
  if (!temEntrada) return "";
  return soma;
}

/** rowspan para Nº da Amostra (par LV+BT com o mesmo nº). */
export function rowSpanGrupoAmostraSpt(
  indice: number,
  profundidades: number[],
): { exibir: boolean; span: number } {
  const atual = numeroAmostraSpt(profundidades[indice] ?? 0);
  if (
    indice > 0 &&
    numeroAmostraSpt(profundidades[indice - 1] ?? 0) === atual
  ) {
    return { exibir: false, span: 1 };
  }
  let span = 1;
  for (let j = indice + 1; j < profundidades.length; j++) {
    if (numeroAmostraSpt(profundidades[j] ?? 0) === atual) span++;
    else break;
  }
  return { exibir: true, span };
}

export function chaveCamadaSpt(solo: string, soloDetalhe: string): string {
  return `${solo}|${soloDetalhe}`;
}

/** rowspan para descrição do solo (célula fundida por camada). */
export function rowSpanCamadaSpt(
  indice: number,
  linhas: { solo: string; soloDetalhe: string }[],
): { exibir: boolean; span: number } {
  const k = chaveCamadaSpt(
    linhas[indice]?.solo ?? "",
    linhas[indice]?.soloDetalhe ?? "",
  );
  if (
    indice > 0 &&
    chaveCamadaSpt(
      linhas[indice - 1]?.solo ?? "",
      linhas[indice - 1]?.soloDetalhe ?? "",
    ) === k
  ) {
    return { exibir: false, span: 1 };
  }
  let span = 1;
  for (let j = indice + 1; j < linhas.length; j++) {
    if (
      chaveCamadaSpt(linhas[j]?.solo ?? "", linhas[j]?.soloDetalhe ?? "") === k
    ) {
      span++;
    } else break;
  }
  return { exibir: true, span };
}
