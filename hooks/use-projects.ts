"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { removeBoreholesForProject } from "@/lib/borehole-storage";
import {
  loadCustomProjects,
  notifyProjectsChanged,
  PROJECTS_CHANGED_EVENT,
  saveCustomProjects,
} from "@/lib/project-storage";
import { generateProjectCode } from "@/lib/project-id";
import { isBuiltInProject, listProjects } from "@/lib/projects";
import type { Project } from "@/lib/types";

export type NewProjectInput = {
  name: string;
  location: string;
  client: string;
};

/**
 * Merges built-in projects with user-created ones (localStorage).
 * `ready` is true after the first client read of storage (keep same SSR/CSR first paint).
 */
export function useProjects() {
  const [customProjects, setCustomProjects] = useState<Project[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      setCustomProjects(loadCustomProjects());
      setReady(true);
    };
    sync();
    if (typeof window === "undefined") return;
    window.addEventListener(PROJECTS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(PROJECTS_CHANGED_EVENT, sync);
  }, []);

  const baseProjects = useMemo(() => listProjects(), []);

  const projects = useMemo(
    () => [...baseProjects, ...customProjects],
    [baseProjects, customProjects],
  );

  const addProject = useCallback((input: NewProjectInput): Project => {
    const createdAt = new Date().toISOString();
    const project: Project = {
      id: crypto.randomUUID(),
      code: generateProjectCode(),
      name: input.name.trim(),
      location: input.location.trim(),
      client: input.client.trim(),
      createdAt,
    };
    setCustomProjects((prev) => {
      const next = [...prev, project];
      saveCustomProjects(next);
      return next;
    });
    notifyProjectsChanged();
    return project;
  }, []);

  const deleteProject = useCallback((id: string): boolean => {
    if (isBuiltInProject(id)) return false;
    const current = loadCustomProjects();
    if (!current.some((p) => p.id === id)) return false;
    const next = current.filter((p) => p.id !== id);
    saveCustomProjects(next);
    removeBoreholesForProject(id);
    setCustomProjects(next);
    notifyProjectsChanged();
    return true;
  }, []);

  return { projects, addProject, deleteProject, ready };
}
