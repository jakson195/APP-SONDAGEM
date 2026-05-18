import type { AxiosInstance } from "axios";
import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import { dirname } from "path";
import { pipeline } from "stream/promises";

export type DownloadResult = {
  localPath: string;
  bytesWritten: bigint;
};

/**
 * Descarrega ficheiro do URL OData (mediaReadLink) com token Bearer.
 */
export async function downloadCopernicusProduct(input: {
  http: AxiosInstance;
  url: string;
  destPath: string;
}): Promise<DownloadResult> {
  await mkdir(dirname(input.destPath), { recursive: true });

  const res = await input.http.get(input.url, {
    responseType: "stream",
    maxRedirects: 10,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    validateStatus: (s) => s >= 200 && s < 400,
  });

  const writer = createWriteStream(input.destPath);
  await pipeline(res.data, writer);

  const stat = await import("fs/promises").then((fs) => fs.stat(input.destPath));
  return { localPath: input.destPath, bytesWritten: BigInt(stat.size) };
}
