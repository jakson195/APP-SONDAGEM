import { prisma } from "@/lib/prisma";
import type { CopernicusSentinel1Product } from "./types";

export async function upsertSentinel1Metadata(
  product: CopernicusSentinel1Product,
  options?: { obraId?: number | null; localPath?: string | null },
): Promise<void> {
  const len = product.contentLength;
  await prisma.sentinel1CatalogEntry.upsert({
    where: { copernicusId: product.copernicusId },
    create: {
      copernicusId: product.copernicusId,
      productName: product.productName,
      productType: product.productType,
      acquisitionAt: product.acquisitionAt,
      orbitDirection: product.orbitDirection,
      polarization: product.polarization,
      footprintWkt: product.footprintWkt,
      s3Path: product.s3Path,
      contentLength: len,
      downloadUrl: product.downloadUrl,
      localPath: options?.localPath ?? null,
      obraId: options?.obraId ?? null,
      metadata: product.raw as object,
    },
    update: {
      productName: product.productName,
      acquisitionAt: product.acquisitionAt,
      orbitDirection: product.orbitDirection,
      polarization: product.polarization,
      footprintWkt: product.footprintWkt,
      s3Path: product.s3Path,
      contentLength: len,
      downloadUrl: product.downloadUrl,
      ...(options?.localPath != null ? { localPath: options.localPath } : {}),
      ...(options?.obraId != null ? { obraId: options.obraId } : {}),
      metadata: product.raw as object,
    },
  });
}

export async function persistSentinel1Batch(
  products: CopernicusSentinel1Product[],
  options?: { obraId?: number | null },
): Promise<number> {
  let n = 0;
  for (const p of products) {
    await upsertSentinel1Metadata(p, { obraId: options?.obraId });
    n++;
  }
  return n;
}
