import { join } from "path";
import { createAuthedAxios, getCopernicusAccessToken } from "./auth";
import { sentinel1DownloadDir } from "./config";
import { downloadCopernicusProduct } from "./download";
import { persistSentinel1Batch, upsertSentinel1Metadata } from "./persist";
import { searchSentinel1Slc } from "./search";
import type { CopernicusSentinel1Product, Wgs84BoundingBox } from "./types";

export {
  sentinelStorageRoot,
  sentinelArchivesDir,
  sentinelProductsDir,
  sentinel1DownloadDir,
} from "./config";
export {
  downloadSentinel1Safe,
  downloadSentinel1SafeByCatalogId,
  sentinel1RowToProduct,
  type DownloadSafeOptions,
  type DownloadSafeResult,
} from "./automatic-downloader";
export { createSentinel1DownloadQueue, type Sentinel1DownloadQueue } from "./download-queue";
export { isSentinel1DownloadDuplicate } from "./duplicate";
export { getCopernicusAccessToken, createAuthedAxios } from "./auth";
export {
  buildSentinel1SlcODataFilter,
  bboxToPolygonWkt4326,
  resolveSentinel1AreaWkt,
} from "./odata-filter";
export { searchSentinel1Slc } from "./search";
export { downloadCopernicusProduct } from "./download";
export {
  upsertSentinel1Metadata,
  persistSentinel1Batch,
} from "./persist";
export type { CopernicusSentinel1Product, Wgs84BoundingBox } from "./types";

/** Parâmetros da pipeline: SLC, bbox ou WKT, datas, órbita (ASC/DESC), persistência na BD. */
export type AutomaticSentinel1SearchOptions = {
  bbox?: Wgs84BoundingBox | null;
  aoiWkt?: string | null;
  dateFrom: Date;
  dateTo: Date;
  orbitDirection?: "ASC" | "DESC" | null;
  limit?: number;
  obraId?: number | null;
};

/**
 * Busca automática: OAuth2 → OData (filtros) → upsert na tabela `Sentinel1CatalogEntry`.
 * Campos gravados: id produto, data aquisição, footprint, polarização, download URL (e metadados JSON).
 */
export async function automaticSentinel1SlcSearchAndPersist(
  opts: AutomaticSentinel1SearchOptions,
): Promise<CopernicusSentinel1Product[]> {
  const { accessToken } = await getCopernicusAccessToken();
  const http = createAuthedAxios(accessToken);
  const products = await searchSentinel1Slc({
    http,
    aoiWkt: opts.aoiWkt,
    bbox: opts.bbox,
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    orbitDirection: opts.orbitDirection ?? null,
    limit: opts.limit,
  });
  await persistSentinel1Batch(products, { obraId: opts.obraId ?? null });
  return products;
}

export type SyncSentinel1SlcOptions = {
  aoiWkt?: string | null;
  bbox?: Wgs84BoundingBox | null;
  dateFrom: Date;
  dateTo: Date;
  orbitDirection?: "ASC" | "DESC" | null;
  limit?: number;
  obraId?: number | null;
  downloadFiles?: boolean;
};

/** Igual a `automaticSentinel1SlcSearchAndPersist` + descarga opcional de ZIP. */
export async function syncSentinel1SlcFromCopernicus(opts: SyncSentinel1SlcOptions): Promise<{
  products: CopernicusSentinel1Product[];
  downloaded: string[];
}> {
  const { accessToken } = await getCopernicusAccessToken();
  const http = createAuthedAxios(accessToken);

  const products = await searchSentinel1Slc({
    http,
    aoiWkt: opts.aoiWkt,
    bbox: opts.bbox,
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    orbitDirection: opts.orbitDirection ?? null,
    limit: opts.limit,
  });

  await persistSentinel1Batch(products, { obraId: opts.obraId ?? null });

  const downloaded: string[] = [];
  if (opts.downloadFiles) {
    const dir = sentinel1DownloadDir();
    for (const p of products) {
      if (!p.downloadUrl) continue;
      const safeName = p.productName.replace(/[/\\]/g, "_");
      const dest = join(dir, `${safeName}.zip`);
      const { localPath } = await downloadCopernicusProduct({
        http,
        url: p.downloadUrl,
        destPath: dest,
      });
      downloaded.push(localPath);
      await upsertSentinel1Metadata(p, {
        obraId: opts.obraId ?? null,
        localPath,
      });
    }
  }

  return { products, downloaded };
}
