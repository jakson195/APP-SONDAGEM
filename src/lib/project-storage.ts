import type { Project } from "@/lib/types";

const STORAGE_KEY = "vision-sondagem-custom-projects";

export const PROJECTS_CHANGED_EVENT = "vision-sondagem-projects-changed";

export function notifyProjectsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PROJECTS_CHANGED_EVENT));
}

function normalizeProject(raw: unknown): Project | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.id !== "string" ||
    typeof o.name !== "string" ||
    typeof o.location !== "string" ||
    typeof o.client !== "string"
  ) {
    return null;
  }
  const id = o.id;
  const code =
    typeof o.code === "string" && o.code.trim().length > 0
      ? o.code.trim()
      : `PRJ-LEGACY-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const createdAt =
    typeof o.createdAt === "string" && o.createdAt.length > 0
      ? o.createdAt
      : new Date(0).toISOString();
  return {
    id,
    code,
    name: o.name.trim(),
    location: o.location.trim(),
    client: o.client.trim(),
    createdAt,
  };
}

/** User-created projects persisted in the browser (until a backend exists). */
export function loadCustomProjects(): Project[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: Project[] = [];
    for (const item of parsed) {
      const p = normalizeProject(item);
      if (p) out.push(p);
    }
    return out;
  } catch {
    return [];
  }
}

export function saveCustomProjects(projects: Project[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // quota / private mode — silent fail
  }
}
