import { demoProjects } from "@/lib/demo-projects";
import type { Project } from "@/lib/types";

/**
 * Built-in project catalog (API + server-safe).
 * Client apps merge this with user-added projects via `useProjects()` / localStorage.
 */
export function listProjects(): Project[] {
  return demoProjects;
}

/** Built-in demo projects cannot be deleted from the UI. */
export function isBuiltInProject(id: string): boolean {
  return demoProjects.some((p) => p.id === id);
}
