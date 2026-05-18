import type { AxiosInstance } from "axios";
import {
  downloadSentinel1Safe,
  type DownloadSafeOptions,
  type DownloadSafeResult,
} from "./automatic-downloader";
import type { CopernicusSentinel1Product } from "./types";

export type Sentinel1DownloadQueue = {
  enqueue: (
    http: AxiosInstance,
    product: CopernicusSentinel1Product,
    opts?: DownloadSafeOptions,
  ) => Promise<DownloadSafeResult>;
  getPendingCount: () => number;
  getActiveCount: () => number;
};

/**
 * Fila de processamento com limite de descargas em paralelo (por defeito 1).
 */
export function createSentinel1DownloadQueue(
  maxConcurrent = 1,
): Sentinel1DownloadQueue {
  const cap = Math.max(1, maxConcurrent);
  let active = 0;

  type Job = {
    run: () => Promise<DownloadSafeResult>;
    resolve: (v: DownloadSafeResult) => void;
    reject: (e: unknown) => void;
  };

  const pending: Job[] = [];

  async function pump(): Promise<void> {
    if (active >= cap || pending.length === 0) return;
    const job = pending.shift()!;
    active += 1;
    try {
      const result = await job.run();
      job.resolve(result);
    } catch (e) {
      job.reject(e);
    } finally {
      active -= 1;
      void pump();
    }
  }

  return {
    enqueue(http, product, opts) {
      return new Promise((resolve, reject) => {
        pending.push({
          run: () => downloadSentinel1Safe(http, product, opts),
          resolve,
          reject,
        });
        void pump();
      });
    },
    getPendingCount: () => pending.length,
    getActiveCount: () => active,
  };
}
