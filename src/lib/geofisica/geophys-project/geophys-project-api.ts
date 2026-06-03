import type {
  GeophysProjectStore,
  SavedGeophysSection,
} from "./geophys-project-storage";

export async function fetchGeophysProjectFromApi(
  obraId: number,
): Promise<GeophysProjectStore | null> {
  try {
    const res = await fetch(`/api/geofisica/sections?obraId=${obraId}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as GeophysProjectStore & { source?: string };
    if (!Array.isArray(data.sections)) return null;
    return {
      projectName: data.projectName ?? "Levantamento ERT",
      sections: data.sections,
      updatedAt: data.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function saveGeophysSectionToApi(
  obraId: number,
  section: SavedGeophysSection,
): Promise<boolean> {
  try {
    const res = await fetch("/api/geofisica/sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ obraId, section }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteGeophysSectionFromApi(
  obraId: number,
  sectionId: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/geofisica/sections/${encodeURIComponent(sectionId)}?obraId=${obraId}`,
      { method: "DELETE", credentials: "include" },
    );
    return res.ok;
  } catch {
    return false;
  }
}
