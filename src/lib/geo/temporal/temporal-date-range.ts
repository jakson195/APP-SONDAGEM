import type { TemporalProvider } from "./temporal-types";

/** Janela histórica por defeito (anos). */
export const TEMPORAL_HISTORY_YEARS = 50;

/** Landsat 1 — início do arquivo global USGS/GEE. */
export const LANDSAT_ARCHIVE_START = "1972-07-23";

/** Sentinel-2A operacional. */
export const SENTINEL2_START = "2015-06-23";

/** CBERS-1 (China-Brasil). */
export const CBERS_START = "1999-10-14";

export function defaultTemporalDateFrom(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - TEMPORAL_HISTORY_YEARS);
  return d.toISOString().slice(0, 10);
}

export function defaultTemporalDateTo(): string {
  return new Date().toISOString().slice(0, 10);
}

export function spanYears(from: string, to: string): number {
  const a = new Date(`${from.slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(`${to.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.max(0, (b - a) / (365.25 * 86_400_000));
}

/**
 * Amostragem adaptativa: anual para séries longas (ex. 50 anos),
 * trimestral (<15 a) ou mensal (<3 a).
 */
export function sampleTemporalDates(
  from: string,
  to: string,
  limit: number,
): string[] {
  const years = spanYears(from, to);
  let stepMonths = 12;
  if (years <= 3) stepMonths = 1;
  else if (years <= 15) stepMonths = 3;

  const out: string[] = [];
  const cur = new Date(`${from.slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${to.slice(0, 10)}T00:00:00Z`);

  while (cur <= end && out.length < limit) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCMonth(cur.getUTCMonth() + stepMonths);
  }

  const endStr = to.slice(0, 10);
  if (out.length > 0 && out[out.length - 1] !== endStr && out.length < limit) {
    out.push(endStr);
  }
  return out;
}

export function providerEarliestDate(provider: TemporalProvider): string {
  switch (provider) {
    case "landsat":
    case "gee":
      return LANDSAT_ARCHIVE_START;
    case "sentinel2":
    case "sentinel_hub":
      return SENTINEL2_START;
    case "cbers":
    case "inpe":
      return CBERS_START;
    case "srtm":
      return "2000-02-11";
    default:
      return LANDSAT_ARCHIVE_START;
  }
}

export function filterDatesForProvider(
  provider: TemporalProvider,
  dates: string[],
): string[] {
  const min = providerEarliestDate(provider);
  return dates.filter((d) => d >= min);
}

/** Missão Landsat coerente com o ano (arquivo 1972–presente). */
export function landsatMissionForDate(date: string): string {
  const y = Number(date.slice(0, 4));
  if (y < 1984) return "Landsat 1-3 MSS";
  if (y < 1999) return "Landsat 4-5 TM";
  if (y < 2013) return "Landsat 7 ETM+";
  if (y < 2021) return "Landsat 8 OLI/TIRS";
  return "Landsat 9 OLI-2";
}

export function cbersMissionForDate(date: string): string {
  const y = Number(date.slice(0, 4));
  if (y < 2007) return "CBERS-2";
  if (y < 2014) return "CBERS-2B";
  if (y < 2019) return "CBERS-4";
  return "CBERS-4A";
}

export function inpeMissionForDate(date: string): string {
  const y = Number(date.slice(0, 4));
  if (y >= 2021) return "Amazonia-1";
  return cbersMissionForDate(date);
}

/** Limite de cenas sugerido para cobrir ~50 anos (1/amostra anual × fontes). */
export function defaultCatalogLimit(dateFrom: string, dateTo: string): number {
  const years = Math.ceil(spanYears(dateFrom, dateTo));
  return Math.min(200, Math.max(60, years + 20));
}
