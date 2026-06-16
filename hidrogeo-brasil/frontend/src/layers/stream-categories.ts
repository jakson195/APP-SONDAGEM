/** Córregos por categoria (1ª–4ª ordem fluvial ≈ Strahler 1–4). */

export const STREAM_CATEGORY_IDS = [
  "stream_category_1",
  "stream_category_2",
  "stream_category_3",
  "stream_category_4",
] as const;

export type StreamCategoryId = (typeof STREAM_CATEGORY_IDS)[number];

export const STREAM_CATEGORY_META: Record<
  StreamCategoryId,
  { category: number; label: string; shortLabel: string; description: string }
> = {
  stream_category_1: {
    category: 1,
    label: "Córrego — 1ª categoria",
    shortLabel: "Cat. 1",
    description: "Micro-drenagem / fileira d'água (1ª ordem)",
  },
  stream_category_2: {
    category: 2,
    label: "Córrego — 2ª categoria",
    shortLabel: "Cat. 2",
    description: "Córrego perene ou intermitente (2ª ordem)",
  },
  stream_category_3: {
    category: 3,
    label: "Córrego — 3ª categoria",
    shortLabel: "Cat. 3",
    description: "Riacho / afluente menor (3ª ordem)",
  },
  stream_category_4: {
    category: 4,
    label: "Córrego — 4ª categoria",
    shortLabel: "Cat. 4",
    description: "Ribeirão / afluente de maior porte (4ª ordem)",
  },
};

export function streamCategoryFromLayerId(layerId: string): number | null {
  const m = layerId.match(/stream_category_(\d)/);
  return m ? Number(m[1]) : null;
}
