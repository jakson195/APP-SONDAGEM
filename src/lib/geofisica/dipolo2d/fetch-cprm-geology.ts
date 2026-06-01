import { fetchGeosgbGeologyForInterpret } from "@/lib/geofisica/geodata/geosgb-client";
import type { GeologicMapUnit } from "./interpret-types";

export type CprmGeologyResult = {
  units: GeologicMapUnit[];
  serviceUsed: string;
};

/** Consulta GeoSGB/CPRM no ponto (catálogo unificado). */
export async function fetchCprmGeology(
  lat: number,
  lng: number,
  maxServices = 6,
): Promise<CprmGeologyResult | null> {
  return fetchGeosgbGeologyForInterpret(lat, lng, maxServices);
}
