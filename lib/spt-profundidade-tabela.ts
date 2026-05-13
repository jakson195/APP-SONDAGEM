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
 * Nº amostra: 0 em 0,00/0,05; 1 nas profundidades de 1 a 2 m; a partir de 3 m,
 * nº = metro inteiro − 1 (3↔2, 4↔3, …), alinhado ao modelo do relatório.
 */
export function numeroAmostraSpt(profM: number): number {
  const p = round2ProfSpt(profM);
  if (p <= 0.06) return 0;
  const whole = Math.floor(p + 1e-4);
  if (whole <= 2) return 1;
  return whole - 1;
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
