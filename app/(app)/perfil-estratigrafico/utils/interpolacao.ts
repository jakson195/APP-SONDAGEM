export type Ponto2D = { x: number; y: number };

/** Traço SVG suavizado (M + curvas Q entre pontos). */
export function gerarLinhaInterpolada(pontos: Ponto2D[]): string {
  if (pontos.length === 0) return "";
  if (pontos.length === 1) {
    const p = pontos[0];
    return `M ${p.x} ${p.y}`;
  }
  return pontos
    .map((p, i) => {
      if (i === 0) return `M ${p.x} ${p.y}`;
      const prev = pontos[i - 1];
      const cx = (prev.x + p.x) / 2;
      return `Q ${prev.x} ${prev.y}, ${cx} ${(prev.y + p.y) / 2}`;
    })
    .join(" ");
}
