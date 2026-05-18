import type { AxiosInstance } from "axios";
import { CDSE_ODATA_BASE } from "./config";
import { buildSentinel1SlcODataFilter, resolveSentinel1AreaWkt } from "./odata-filter";
import { rowToSentinel1Slc } from "./parse";
import type {
  CopernicusSentinel1Product,
  ODataProductsResponse,
  Wgs84BoundingBox,
} from "./types";

export type SearchSentinel1SlcParams = {
  /** WKT 4326. Alternativa a `bbox`. */
  aoiWkt?: string | null;
  /** Bounding box WGS84; convertido em POLYGON para o filtro espacial. */
  bbox?: Wgs84BoundingBox | null;
  dateFrom: Date;
  dateTo: Date;
  orbitDirection?: "ASC" | "DESC" | null;
  limit?: number;
  http: AxiosInstance;
};

/**
 * Catálogo OData CDSE: **SLC**, período, interseção (WKT ou bbox), órbita ASC/DESC opcional.
 */
export async function searchSentinel1Slc(
  params: SearchSentinel1SlcParams,
): Promise<CopernicusSentinel1Product[]> {
  const base = CDSE_ODATA_BASE.replace(/\/$/, "");
  const areaWkt = resolveSentinel1AreaWkt({
    aoiWkt: params.aoiWkt,
    bbox: params.bbox,
  });
  const filt = buildSentinel1SlcODataFilter({
    aoiWkt: areaWkt,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    orbitDirection: params.orbitDirection ?? null,
  });

  const { data } = await params.http.get<ODataProductsResponse>(
    `${base}/Products`,
    {
      params: {
        $filter: filt,
        $top: params.limit ?? 100,
        $orderby: "ContentDate/Start asc",
        $expand: "Attributes",
      },
    },
  );

  const out: CopernicusSentinel1Product[] = [];
  for (const row of data.value ?? []) {
    const p = rowToSentinel1Slc(row, params.dateFrom);
    if (p) out.push(p);
  }
  return out;
}
