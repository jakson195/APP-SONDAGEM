export function parseSerie(texto: string): number[] {
  return texto
    .split(/[\s,;]+/)
    .map((s) => s.trim().replace(",", "."))
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
}
