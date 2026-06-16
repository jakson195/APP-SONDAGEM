export interface LasProcessingStatus {
  status: string;
  progress: number;
  message: string;
  tileset_url?: string | null;
  point_count?: number | null;
}

export interface LasUploadResult {
  terrain_model_id: string;
  project_id: string;
  name: string;
  original_filename?: string | null;
  processing: LasProcessingStatus;
}

export interface LasStatusResult {
  terrain_model_id: string;
  project_id: string;
  name: string;
  model_type: string;
  processing: LasProcessingStatus;
  tileset_url?: string | null;
}

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export function resolveTilesetUrl(tilesetPath: string): string {
  if (tilesetPath.startsWith("http://") || tilesetPath.startsWith("https://")) {
    return tilesetPath;
  }
  return `${API_BASE}${tilesetPath}`;
}

export async function uploadLas(
  projectId: string,
  file: File,
  options?: { name?: string; acquisitionDate?: string },
): Promise<LasUploadResult> {
  const form = new FormData();
  form.append("file", file);
  if (options?.name) form.append("name", options.name);
  if (options?.acquisitionDate) {
    form.append("acquisition_date", options.acquisitionDate);
  }

  const res = await fetch(
    `${API_BASE}/api/v1/projects/${projectId}/uploads/las`,
    { method: "POST", body: form },
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail ?? `Upload falhou (${res.status})`);
  }
  return res.json() as Promise<LasUploadResult>;
}

export async function fetchLasStatus(
  projectId: string,
  terrainModelId: string,
): Promise<LasStatusResult> {
  const res = await fetch(
    `${API_BASE}/api/v1/projects/${projectId}/uploads/las/${terrainModelId}/status`,
  );
  if (!res.ok) {
    throw new Error(`Status LAS (${res.status})`);
  }
  return res.json() as Promise<LasStatusResult>;
}

export function pollLasUntilDone(
  projectId: string,
  terrainModelId: string,
  onTick?: (status: LasStatusResult) => void,
  intervalMs = 2000,
): Promise<LasStatusResult> {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const status = await fetchLasStatus(projectId, terrainModelId);
        onTick?.(status);
        if (status.processing.status === "completed") {
          resolve(status);
          return;
        }
        if (status.processing.status === "failed") {
          reject(new Error(status.processing.message || "Processamento falhou"));
          return;
        }
        setTimeout(() => void poll(), intervalMs);
      } catch (e) {
        reject(e);
      }
    };
    void poll();
  });
}
