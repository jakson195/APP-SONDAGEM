/** Configuração da API Copernicus Data Space (CDSE). */
import { join } from "path";

export const CDSE_TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";

export const CDSE_ODATA_BASE =
  process.env.COPERNICUS_ODATA_URL ?? "https://catalogue.dataspace.copernicus.eu/odata/v1";

export const CDSE_OAUTH_CLIENT_ID =
  process.env.COPERNICUS_OAUTH_CLIENT_ID ?? "cdse-public";

export function copernicusCredentials(): {
  username: string;
  password: string;
} | null {
  const username =
    process.env.COPERNICUS_USER?.trim() ||
    process.env.COPERNICUS_USERNAME?.trim() ||
    "";
  const password =
    process.env.COPERNICUS_PASSWORD?.trim() ||
    process.env.COPERNICUS_PASS?.trim() ||
    "";
  if (!username || !password) return null;
  return { username, password };
}

export function sentinelStorageRoot(): string {
  return (
    process.env.SENTINEL_STORAGE_DIR?.trim() ?? join(process.cwd(), "storage", "sentinel")
  );
}

/** Arquivos compactados descarregados (antes de extrair .SAFE). */
export function sentinelArchivesDir(): string {
  if (process.env.SENTINEL1_DOWNLOAD_DIR?.trim()) {
    return process.env.SENTINEL1_DOWNLOAD_DIR.trim();
  }
  return join(sentinelStorageRoot(), "archives");
}

/** Pastas `.SAFE` extraídas (uma por `copernicusId`). */
export function sentinelProductsDir(): string {
  return join(sentinelStorageRoot(), "products");
}

/** @deprecated Use `sentinelArchivesDir()`. */
export function sentinel1DownloadDir(): string {
  return sentinelArchivesDir();
}
