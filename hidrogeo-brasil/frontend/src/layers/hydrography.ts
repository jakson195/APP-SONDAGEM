/** Zoom mínimo para exibir curso conforme ordem Strahler (rede densa progressiva). */
export function minZoomForStreamOrder(order: number): number {
  const o = Math.max(1, order || 1);
  if (o >= 7) return 4;
  if (o >= 5) return 5;
  if (o >= 4) return 5;
  if (o >= 3) return 6;
  if (o >= 2) return 7;
  return 8;
}

/** Zoom mínimo de pedido de tiles MVT (sempre ≤ ordem de exibição). */
export function minTileZoomForStreamCategory(_category: number): number {
  return 4;
}

export function streamVisibleAtZoom(order: number, zoom: number): boolean {
  return zoom >= minZoomForStreamOrder(order);
}

export function applyStreamAlpha(
  color: [number, number, number, number],
  order: number,
  zoom: number,
): [number, number, number, number] {
  if (!streamVisibleAtZoom(order, zoom)) return [0, 0, 0, 0];
  const minZ = minZoomForStreamOrder(order);
  const fade = Math.min(1, (zoom - minZ + 1) / 2);
  return [color[0], color[1], color[2], Math.round(color[3] * fade)];
}

/** Cor por ordem de Strahler (gradiente azul). */
export function strahlerColor(order: number): [number, number, number, number] {
  const palette: Record<number, [number, number, number]> = {
    1: [147, 197, 253],
    2: [96, 165, 250],
    3: [59, 130, 246],
    4: [37, 99, 235],
    5: [29, 78, 216],
    6: [30, 58, 138],
  };
  const c = palette[Math.min(6, Math.max(1, order || 1))] ?? palette[3]!;
  return [c[0], c[1], c[2], 220];
}

export function strahlerWidth(order: number, zoom: number): number {
  const o = Math.max(1, order || 1);
  if (!streamVisibleAtZoom(o, zoom)) return 0;
  const zoomOutBoost = Math.pow(1.35, Math.max(0, 7 - zoom));
  const base = o <= 2 ? 2.8 : o <= 3 ? 2.4 : o * 1.2;
  return Math.max(1.5, base * Math.pow(1.14, Math.max(0, zoom - 4)) * zoomOutBoost);
}

/** Cor por índice de vazão 0 (seca) → 1 (cheia). */
export function flowColor(factor: number): [number, number, number, number] {
  const t = Math.max(0, Math.min(1, factor));
  const r = Math.round(147 + (30 - 147) * t);
  const g = Math.round(197 + (58 - 197) * t);
  const b = Math.round(253 + (138 - 253) * t);
  return [r, g, b, 230];
}

/** Cursos secundários — tons claros de ciano. */
export function secondaryStreamColor(order: number): [number, number, number, number] {
  const palette: Record<number, [number, number, number]> = {
    1: [165, 243, 252],
    2: [103, 232, 249],
    3: [34, 211, 238],
    4: [6, 182, 212],
  };
  const c = palette[Math.min(4, Math.max(1, order || 1))] ?? palette[2]!;
  return [c[0], c[1], c[2], 210];
}

export function secondaryStreamWidth(order: number, zoom: number): number {
  const o = Math.max(1, order || 1);
  if (!streamVisibleAtZoom(o, zoom)) return 0;
  const base = o === 1 ? 2 : o === 2 ? 2.4 : o === 3 ? 2.8 : 3.2;
  return Math.max(1.5, base * Math.pow(1.12, Math.max(0, zoom - 5)));
}

/** Nascentes — ponto verde-água. */
export function springColor(): [number, number, number, number] {
  return [52, 211, 153, 240];
}

/** Cor por categoria de córrego (1ª–4ª ordem). */
export function streamCategoryColor(category: number): [number, number, number, number] {
  const palette: Record<number, [number, number, number]> = {
    1: [186, 230, 253],
    2: [56, 189, 248],
    3: [2, 132, 199],
    4: [7, 89, 133],
  };
  const c = palette[Math.min(4, Math.max(1, category || 1))] ?? palette[2]!;
  return [c[0], c[1], c[2], 215];
}

export function streamCategoryWidth(category: number, zoom: number): number {
  const c = Math.max(1, category || 1);
  if (!streamVisibleAtZoom(c, zoom)) return 0;
  const base = c === 1 ? 1.8 : c === 2 ? 2.2 : c === 3 ? 2.6 : 3;
  return Math.max(1.4, base * Math.pow(1.1, Math.max(0, zoom - 5)));
}

export function streamCategoryLabel(category: number): string {
  const c = Math.max(1, Math.min(4, category || 1));
  const names: Record<number, string> = {
    1: "Córrego de 1ª categoria (micro-drenagem)",
    2: "Córrego de 2ª categoria",
    3: "Córrego de 3ª categoria (riacho)",
    4: "Córrego de 4ª categoria (ribeirão)",
  };
  return names[c] ?? names[1]!;
}

/** Classificação brasileira por ordem Strahler (rios ≥5). */
export function streamClassLabel(order: number): string {
  const o = Math.max(1, order || 1);
  if (o === 1) return streamCategoryLabel(1);
  if (o === 2) return streamCategoryLabel(2);
  if (o === 3) return streamCategoryLabel(3);
  if (o === 4) return streamCategoryLabel(4);
  if (o <= 6) return "Rio";
  return "Rio principal";
}
