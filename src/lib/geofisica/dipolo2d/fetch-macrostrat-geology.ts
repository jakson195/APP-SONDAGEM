import type { GeologicMapUnit } from "./interpret-types";

type MacrostratMapItem = {
  name?: string;
  strat_name?: string;
  lith?: string;
  descrip?: string;
  best_int_name?: string;
  t_int_name?: string;
  b_int_name?: string;
  b_age?: number;
  t_age?: number;
};

export type MacrostratGeologyResult = {
  units: GeologicMapUnit[];
  summaryLines: string[];
};

export async function fetchMacrostratGeology(
  lat: number,
  lng: number,
): Promise<MacrostratGeologyResult | null> {
  try {
    const url = `https://macrostrat.org/api/v2/geologic_units/map?lat=${lat}&lng=${lng}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as {
      success?: { data?: MacrostratMapItem[] };
    };
    const data = json.success?.data ?? [];
    if (!data.length) return null;

    const units: GeologicMapUnit[] = data.map((item, idx) => {
      const name = item.strat_name?.trim() || item.name?.trim() || `Unidade ${idx + 1}`;
      const lith = item.lith?.trim() || "";
      const age =
        item.best_int_name ||
        item.t_int_name ||
        (item.b_age != null ? `${item.b_age}–${item.t_age ?? 0} Ma` : "");
      return {
        name,
        sigla: item.strat_name?.trim() || undefined,
        lithology: lith || item.name,
        age: age || undefined,
        description: [item.descrip, item.lith].filter(Boolean).join(" — ") || undefined,
        source: "macrostrat" as const,
        layerName: "Macrostrat (mapa global)",
      };
    });

    const summaryLines = units.map(
      (u) =>
        `${u.name}${u.lithology ? ` (${u.lithology})` : ""}${u.age ? ` — ${u.age}` : ""}`,
    );

    return { units, summaryLines };
  } catch {
    return null;
  }
}
