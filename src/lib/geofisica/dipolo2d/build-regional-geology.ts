import { inferRegionalGeology } from "./regional-geology";
import { fetchCprmGeology } from "./fetch-cprm-geology";
import { fetchMacrostratGeology } from "./fetch-macrostrat-geology";
import { findLocalGeologyAnchor } from "./local-geology-anchors";
import { materialsFromGeologicTexts } from "./lithology-resistivity-br";
import { inferResistivityNormProfile } from "./resistivity-norms-br";
import type {
  GeologicMapUnit,
  RegionalGeologyProfile,
} from "./interpret-types";

function uniqueUnits(units: GeologicMapUnit[]): GeologicMapUnit[] {
  const seen = new Set<string>();
  const out: GeologicMapUnit[] = [];
  for (const u of units) {
    const key = `${u.source}|${u.sigla ?? ""}|${u.name}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

function textsFromUnits(units: GeologicMapUnit[]): string[] {
  const texts: string[] = [];
  for (const u of units) {
    if (u.name) texts.push(u.name);
    if (u.sigla) texts.push(u.sigla);
    if (u.lithology) texts.push(u.lithology);
    if (u.description) texts.push(u.description);
  }
  return texts;
}

/**
 * Caracterização regional: GeoSGB/CPRM (verdade geológica) + Macrostrat + regras locais.
 */
export async function buildRegionalGeology(
  lat: number,
  lng: number,
): Promise<RegionalGeologyProfile> {
  const fallback = inferRegionalGeology(lat, lng);
  const localAnchor = findLocalGeologyAnchor(lat, lng);

  const [cprm, macro] = await Promise.all([
    fetchCprmGeology(lat, lng, 6),
    fetchMacrostratGeology(lat, lng),
  ]);

  const mapUnits = uniqueUnits([
    ...(localAnchor?.mapUnits ?? []),
    ...(cprm?.units ?? []),
    ...(macro?.units ?? []).map((u) => ({ ...u, source: "macrostrat" as const })),
  ]);

  const dataSources: string[] = [];
  if (localAnchor) dataSources.push(`Carta local — ${localAnchor.name}`);
  if (cprm) dataSources.push(`GeoSGB/CPRM — ${cprm.serviceUsed}`);
  if (macro) dataSources.push("Macrostrat (mapa global 1:10M)");

  const regionalMaterials =
    localAnchor?.materials ?? fallback.materials;

  const resistivityNorm = inferResistivityNormProfile(lat, lng);

  if (!mapUnits.length && !localAnchor) {
    return {
      ...fallback,
      mapUnits: [],
      dataSources: ["Regras regionais (GeoSGB/CPRM indisponível no ponto)"],
      source: "rules",
      anchorLat: lat,
      anchorLng: lng,
      resistivityNorm,
    };
  }

  const materials = materialsFromGeologicTexts(
    textsFromUnits(mapUnits),
    regionalMaterials,
    5,
  );
  const formations = mapUnits.map((u) => {
    const parts = [u.sigla, u.name].filter(Boolean);
    const head = parts.join(" — ") || u.name;
    return u.age ? `${head} (${u.age})` : head;
  });

  const cprmLines = (cprm?.units ?? [])
    .slice(0, 6)
    .map((u) => `CPRM: ${u.sigla ? `${u.sigla} — ` : ""}${u.name}${u.lithology ? ` [${u.lithology}]` : ""}`);
  const macroLines = macro?.summaryLines.slice(0, 4) ?? [];

  const localLines =
    localAnchor && !cprm
      ? localAnchor.mapUnits
          .slice(0, 5)
          .map(
            (u) =>
              `${u.sigla ? `${u.sigla} — ` : ""}${u.name}${u.lithology ? ` [${u.lithology}]` : ""}`,
          )
      : [];

  const summary = [
    `Coordenadas ${lat.toFixed(5)}°, ${lng.toFixed(5)}°.`,
    localAnchor && !cprm ? localAnchor.summary : "",
    dataSources.length ? `Fontes: ${dataSources.join("; ")}.` : "",
    cprmLines.length
      ? `Unidades GeoSGB/CPRM: ${cprmLines.join("; ")}.`
      : localLines.length
        ? `Unidades cartográficas locais: ${localLines.join("; ")}.`
        : "",
    macroLines.length
      ? `Contexto estratigráfico (Macrostrat): ${macroLines.join("; ")}.`
      : "",
    `${mapUnits.length} unidade(s) no ponto; classificação ERT por litologia cartográfica e faixas de ρ.`,
  ]
    .filter(Boolean)
    .join(" ");

  const regionName =
    cprm?.units[0]?.name ??
    localAnchor?.name ??
    macro?.units[0]?.name ??
    fallback.regionName;

  const province =
    cprm != null
      ? "Serviço Geológico do Brasil (CPRM/GeoSGB)"
      : localAnchor != null
        ? localAnchor.province
        : macro != null
          ? "Macrostrat + contexto Brasil"
          : fallback.province;

  return {
    regionName: regionName.length > 80 ? `${regionName.slice(0, 77)}…` : regionName,
    province,
    summary,
    formations: formations.length
      ? formations
      : localAnchor?.formations ?? fallback.formations,
    materials: materials.length ? materials : regionalMaterials,
    mapUnits,
    dataSources: dataSources.length ? dataSources : fallback.dataSources ?? ["Regras regionais"],
    source: cprm ? "geosgb" : localAnchor ? "hybrid" : macro ? "macrostrat" : "rules",
    anchorLat: lat,
    anchorLng: lng,
    resistivityNorm,
  };
}
