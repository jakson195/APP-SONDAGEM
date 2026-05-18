import { join } from "path";
import { mkdir, rename, stat, unlink } from "fs/promises";
import type { AxiosInstance } from "axios";
import type { Sentinel1CatalogEntry } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sentinelArchivesDir, sentinelProductsDir } from "./config";
import { downloadCopernicusProduct } from "./download";
import { isSentinel1DownloadDuplicate } from "./duplicate";
import {
  readChecksumFromODataRaw,
  sha256FileHex,
  verifyAgainstCatalogChecksum,
} from "./integrity";
import { extractZipToDir, findSafeDirectory } from "./safe-extract";
import type { CopernicusSentinel1Product } from "./types";

function fsSafeSegment(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 200);
}

export function sentinel1RowToProduct(row: Sentinel1CatalogEntry): CopernicusSentinel1Product {
  return {
    copernicusId: row.copernicusId,
    productName: row.productName,
    productType: "SLC",
    acquisitionAt: row.acquisitionAt,
    orbitDirection: row.orbitDirection ?? "UNK",
    footprintWkt: row.footprintWkt,
    polarization: row.polarization,
    s3Path: row.s3Path,
    contentLength: row.contentLength,
    downloadUrl: row.downloadUrl,
    raw: (row.metadata as Record<string, unknown>) ?? {},
  };
}

export type DownloadSafeOptions = {
  deleteArchiveAfterExtract?: boolean;
};

export type DownloadSafeResult =
  | { status: "duplicate"; localPath: string }
  | { status: "ready"; localPath: string; archiveSha256: string; archiveKept: boolean }
  | { status: "failed"; error: string };

/**
 * Descarrega arquivo Copernicus, verifica tamanho/checksum, extrai `.SAFE` para `storage/sentinel/products/`.
 */
export async function downloadSentinel1Safe(
  http: AxiosInstance,
  product: CopernicusSentinel1Product,
  options?: DownloadSafeOptions,
): Promise<DownloadSafeResult> {
  const id = product.copernicusId;
  const delArchive = options?.deleteArchiveAfterExtract !== false;

  const row = await prisma.sentinel1CatalogEntry.findUnique({
    where: { copernicusId: id },
  });
  if (!row) {
    return {
      status: "failed",
      error: "Produto não está no catálogo local (grave metadados com a busca primeiro).",
    };
  }

  if (await isSentinel1DownloadDuplicate(id)) {
    return { status: "duplicate", localPath: row.localPath! };
  }

  if (!product.downloadUrl) {
    return { status: "failed", error: "Sem URL de download (mediaReadLink)." };
  }

  await prisma.sentinel1CatalogEntry.update({
    where: { copernicusId: id },
    data: {
      downloadStatus: "downloading",
      integrityOk: null,
    },
  });

  const seg = fsSafeSegment(id);
  const archives = sentinelArchivesDir();
  const productsRoot = sentinelProductsDir();
  const partPath = join(archives, `${seg}.part`);
  const zipPath = join(archives, `${seg}.zip`);
  const extractRoot = join(productsRoot, seg);

  try {
    await mkdir(archives, { recursive: true });
    await mkdir(extractRoot, { recursive: true });

    await downloadCopernicusProduct({
      http,
      url: product.downloadUrl,
      destPath: partPath,
    });

    await rename(partPath, zipPath);

    const st = await stat(zipPath);
    if (product.contentLength != null && BigInt(st.size) !== product.contentLength) {
      throw new Error(
        `Tamanho incorreto: catálogo ${product.contentLength}, ficheiro ${st.size}`,
      );
    }

    const catChecksum = readChecksumFromODataRaw(product.raw);
    if (catChecksum) {
      const ok = await verifyAgainstCatalogChecksum(zipPath, catChecksum);
      if (!ok) {
        throw new Error(
          `Checksum do catálogo (${catChecksum.Algorithm}) não coincide com o ficheiro.`,
        );
      }
    }

    const sha = await sha256FileHex(zipPath);

    extractZipToDir(zipPath, extractRoot);
    const safeDir = await findSafeDirectory(extractRoot);
    if (!safeDir) {
      throw new Error("Extração concluída mas não foi encontrada pasta .SAFE.");
    }

    let archiveKept = true;
    if (delArchive) {
      await unlink(zipPath).catch(() => {});
      archiveKept = false;
    }

    await prisma.sentinel1CatalogEntry.update({
      where: { copernicusId: id },
      data: {
        localPath: safeDir,
        archiveSha256: sha,
        downloadStatus: "ready",
        integrityOk: true,
      },
    });

    return {
      status: "ready",
      localPath: safeDir,
      archiveSha256: sha,
      archiveKept,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.sentinel1CatalogEntry.update({
      where: { copernicusId: id },
      data: {
        downloadStatus: "failed",
        integrityOk: false,
      },
    });
    await unlink(partPath).catch(() => {});
    await unlink(zipPath).catch(() => {});
    return { status: "failed", error: msg };
  }
}

export async function downloadSentinel1SafeByCatalogId(
  http: AxiosInstance,
  copernicusId: string,
  options?: DownloadSafeOptions,
): Promise<DownloadSafeResult> {
  const row = await prisma.sentinel1CatalogEntry.findUnique({
    where: { copernicusId },
  });
  if (!row) {
    return { status: "failed", error: "Registo inexistente." };
  }
  return downloadSentinel1Safe(http, sentinel1RowToProduct(row), options);
}
