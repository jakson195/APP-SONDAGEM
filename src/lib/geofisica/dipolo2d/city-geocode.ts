export type GeocodeResult = {
  lat: number;
  lng: number;
  label: string;
  city?: string;
  state?: string;
  source: string;
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Remove sufixo de UF (ex.: «Garuva SC» → «Garuva»). */
function cityQueryCore(query: string): string {
  return query
    .replace(
      /\s*[-–,]\s*(ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)\s*$/i,
      "",
    )
    .replace(/\s+(ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)\s*$/i, "")
    .trim();
}

/** Atalhos confiáveis (ERT / costa sul). */
const CITY_PRESETS: { keys: string[]; lat: number; lng: number; label: string }[] =
  [
    { keys: ["garuva"], lat: -26.283, lng: -48.67, label: "Garuva, SC" },
    { keys: ["joinville"], lat: -26.3044, lng: -48.8488, label: "Joinville, SC" },
    { keys: ["itapoa", "itapoá"], lat: -26.112, lng: -48.612, label: "Itapoá, SC" },
    { keys: ["florianopolis", "florianópolis"], lat: -27.595, lng: -48.548, label: "Florianópolis, SC" },
    { keys: ["curitiba"], lat: -25.4284, lng: -49.2733, label: "Curitiba, PR" },
    { keys: ["sao paulo", "são paulo"], lat: -23.5505, lng: -46.6333, label: "São Paulo, SP" },
    { keys: ["rio de janeiro"], lat: -22.9068, lng: -43.1729, label: "Rio de Janeiro, RJ" },
    { keys: ["blumenau"], lat: -26.9194, lng: -49.0661, label: "Blumenau, SC" },
    { keys: ["balneario camboriu", "balneário camboriú"], lat: -26.986, lng: -48.634, label: "Balneário Camboriú, SC" },
    { keys: ["chapeco", "chapecó"], lat: -27.1004, lng: -52.6152, label: "Chapecó, SC" },
    { keys: ["porto alegre"], lat: -30.0346, lng: -51.2177, label: "Porto Alegre, RS" },
    { keys: ["itajai", "itajaí"], lat: -26.9078, lng: -48.6619, label: "Itajaí, SC" },
    { keys: ["palhoca", "palhoça"], lat: -27.6453, lng: -48.6698, label: "Palhoça, SC" },
    { keys: ["sao jose", "são josé"], lat: -27.6136, lng: -48.6366, label: "São José, SC" },
    { keys: ["jaragua do sul", "jaraguá do sul"], lat: -26.4851, lng: -49.0713, label: "Jaraguá do Sul, SC" },
    { keys: ["lages"], lat: -27.816, lng: -50.326, label: "Lages, SC" },
    { keys: ["tubarao", "tubarão"], lat: -28.467, lng: -49.006, label: "Tubarão, SC" },
    { keys: ["criciuma", "criciúma"], lat: -28.6775, lng: -49.3697, label: "Criciúma, SC" },
    { keys: ["navegantes"], lat: -26.8989, lng: -48.6542, label: "Navegantes, SC" },
    { keys: ["penha"], lat: -26.769, lng: -48.645, label: "Penha, SC" },
    { keys: ["barra velha"], lat: -26.632, lng: -48.684, label: "Barra Velha, SC" },
    { keys: ["guaratuba"], lat: -25.883, lng: -48.575, label: "Guaratuba, PR" },
    { keys: ["paranagua", "paranaguá"], lat: -25.516, lng: -48.522, label: "Paranaguá, PR" },
    { keys: ["londrina"], lat: -23.3045, lng: -51.1696, label: "Londrina, PR" },
    { keys: ["maringa", "maringá"], lat: -23.4205, lng: -51.9333, label: "Maringá, PR" },
    { keys: ["brasilia", "brasília"], lat: -15.7939, lng: -47.8828, label: "Brasília, DF" },
    { keys: ["belem", "belém"], lat: -1.4558, lng: -48.4902, label: "Belém, PA" },
    { keys: ["manaus"], lat: -3.119, lng: -60.0217, label: "Manaus, AM" },
    { keys: ["salvador"], lat: -12.9777, lng: -38.5016, label: "Salvador, BA" },
    { keys: ["fortaleza"], lat: -3.7319, lng: -38.5267, label: "Fortaleza, CE" },
    { keys: ["recife"], lat: -8.0476, lng: -34.877, label: "Recife, PE" },
    { keys: ["goiania", "goiânia"], lat: -16.6869, lng: -49.2648, label: "Goiânia, GO" },
    { keys: ["belo horizonte"], lat: -19.9167, lng: -43.9345, label: "Belo Horizonte, MG" },
    { keys: ["campinas"], lat: -22.9056, lng: -47.0608, label: "Campinas, SP" },
    { keys: ["cuiaba", "cuiabá"], lat: -15.601, lng: -56.0974, label: "Cuiabá, MT" },
    { keys: ["porto velho"], lat: -8.7612, lng: -63.9039, label: "Porto Velho, RO" },
    { keys: ["macapa", "macapá"], lat: 0.0349, lng: -51.0694, label: "Macapá, AP" },
    { keys: ["boa vista"], lat: 2.8235, lng: -60.6758, label: "Boa Vista, RR" },
    { keys: ["natal"], lat: -5.7945, lng: -35.211, label: "Natal, RN" },
    { keys: ["teresina"], lat: -5.0892, lng: -42.8019, label: "Teresina, PI" },
    { keys: ["sao luis", "são luís"], lat: -2.5387, lng: -44.2825, label: "São Luís, MA" },
    { keys: ["vitoria", "vitória"], lat: -20.3155, lng: -40.3128, label: "Vitória, ES" },
  ];

export function searchCityPresets(query: string): GeocodeResult[] {
  const nq = norm(cityQueryCore(query));
  const out: GeocodeResult[] = [];
  for (const p of CITY_PRESETS) {
    if (p.keys.some((k) => nq.includes(norm(k)) || norm(k).includes(nq))) {
      out.push({
        lat: p.lat,
        lng: p.lng,
        label: p.label,
        city: p.label.split(",")[0]?.trim(),
        state: p.label.split(",")[1]?.trim(),
        source: "preset",
      });
    }
  }
  return out;
}

/** Open-Meteo — geocodificação gratuita, boa cobertura BR. */
export async function searchOpenMeteo(query: string): Promise<GeocodeResult[]> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query);
  url.searchParams.set("count", "8");
  url.searchParams.set("language", "pt");
  url.searchParams.set("countryCode", "BR");

  const res = await fetch(url.toString(), {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return [];

  const json = (await res.json()) as {
    results?: Array<{
      name: string;
      latitude: number;
      longitude: number;
      admin1?: string;
      country_code?: string;
    }>;
  };

  return (json.results ?? [])
    .filter((r) => r.country_code === "BR" || !r.country_code)
    .map((r) => ({
      lat: r.latitude,
      lng: r.longitude,
      label: r.admin1 ? `${r.name}, ${r.admin1}` : r.name,
      city: r.name,
      state: r.admin1,
      source: "open-meteo",
    }));
}

/** Photon (Komoot / OSM). */
export async function searchPhoton(query: string): Promise<GeocodeResult[]> {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", `${query}, Brasil`);
  url.searchParams.set("limit", "8");
  url.searchParams.set("lang", "default");

  const res = await fetch(url.toString(), {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return [];

  const json = (await res.json()) as {
    features?: Array<{
      geometry: { coordinates: [number, number] };
      properties: {
        name?: string;
        city?: string;
        state?: string;
        country?: string;
      };
    }>;
  };

  return (json.features ?? [])
    .filter((f) => !f.properties.country || f.properties.country === "Brazil")
    .map((f) => {
      const [lng, lat] = f.geometry.coordinates;
      const city = f.properties.name ?? f.properties.city ?? "Local";
      const state = f.properties.state ?? "";
      return {
        lat,
        lng,
        label: state ? `${city}, ${state}` : city,
        city,
        state: state || undefined,
        source: "photon",
      };
    });
}

/** Nominatim OSM. */
export async function searchNominatim(query: string): Promise<GeocodeResult[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", `${query}, Brasil`);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "6");
  url.searchParams.set("countrycodes", "br");
  url.searchParams.set("addressdetails", "1");

  const res = await fetch(url.toString(), {
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
    headers: {
      "User-Agent": "DataGeoDigital/1.0 (geofisica; https://datageo.local)",
      Accept: "application/json",
    },
  });
  if (!res.ok) return [];

  const raw = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name?: string;
    address?: {
      city?: string;
      town?: string;
      village?: string;
      municipality?: string;
      state?: string;
    };
  }>;

  return raw
    .map((item) => {
      const lat = Number(item.lat);
      const lng = Number(item.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const a = item.address;
      const city = a?.city ?? a?.town ?? a?.village ?? a?.municipality ?? "";
      const state = a?.state ?? "";
      const label =
        city && state
          ? `${city}, ${state}`
          : (item.display_name?.split(",").slice(0, 2).join(",").trim() ?? "Local");
      return {
        lat,
        lng,
        label,
        city: city || undefined,
        state: state || undefined,
        source: "nominatim",
      };
    })
    .filter((r): r is GeocodeResult => r != null);
}

export function dedupeGeocodeResults(results: GeocodeResult[]): GeocodeResult[] {
  const seen = new Set<string>();
  const out: GeocodeResult[] = [];
  for (const r of results) {
    const key = `${r.label.toLowerCase()}|${r.lat.toFixed(3)}|${r.lng.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** Busca cidade com várias fontes (presets → Open-Meteo → Photon → Nominatim). */
export async function searchBrazilCity(query: string): Promise<{
  results: GeocodeResult[];
  sourcesTried: string[];
}> {
  const q = query.trim();
  const sourcesTried: string[] = [];
  let merged: GeocodeResult[] = [];

  const presets = searchCityPresets(q);
  if (presets.length) {
    sourcesTried.push("preset");
    merged = [...presets, ...merged];
  }

  for (const [name, fn] of [
    ["open-meteo", searchOpenMeteo],
    ["photon", searchPhoton],
    ["nominatim", searchNominatim],
  ] as const) {
    try {
      const part = await fn(q);
      sourcesTried.push(name);
      if (part.length) merged = dedupeGeocodeResults([...merged, ...part]);
      if (merged.length >= 6) break;
    } catch {
      sourcesTried.push(`${name}(erro)`);
    }
  }

  return { results: merged.slice(0, 8), sourcesTried };
}

export type CitySearchHit = Pick<GeocodeResult, "lat" | "lng" | "label">;

/** Busca no browser (presets + Open-Meteo + Photon) — contorna falhas SSL no servidor Node. */
export async function searchBrazilCityInBrowser(
  query: string,
): Promise<CitySearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  let merged: GeocodeResult[] = [...searchCityPresets(q)];

  for (const fn of [searchOpenMeteo, searchPhoton] as const) {
    try {
      const part = await fn(q);
      if (part.length) merged = dedupeGeocodeResults([...merged, ...part]);
      if (merged.length >= 8) break;
    } catch {
      /* rede / CORS */
    }
  }

  return merged.slice(0, 8).map(({ lat, lng, label }) => ({ lat, lng, label }));
}

/** Busca de cidade (presets + APIs no browser; não depende do servidor Node). */
export async function resolveBrazilCitySearch(query: string): Promise<{
  results: CitySearchHit[];
  via: "preset" | "browser" | "none";
}> {
  const q = query.trim();
  const presets = searchCityPresets(q);
  if (presets.length === 1) {
    return {
      results: presets.map(({ lat, lng, label }) => ({ lat, lng, label })),
      via: "preset",
    };
  }

  const browserHits = await searchBrazilCityInBrowser(q);
  const merged = dedupeGeocodeResults(
    [...presets, ...browserHits].map((r) => ({ ...r, source: "merge" })),
  ).map(({ lat, lng, label }) => ({ lat, lng, label }));

  if (!merged.length) return { results: [], via: "none" };
  if (presets.length > 0 && browserHits.length === 0) {
    return { results: merged, via: "preset" };
  }
  return { results: merged, via: "browser" };
}
