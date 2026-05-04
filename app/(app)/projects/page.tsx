"use client";

import { useEffect, useState } from "react";
import { Calendar, MapPin, Trash2, User } from "lucide-react";
import { ConfirmDeleteProjectModal } from "@/components/confirm-delete-project-modal";
import { NewProjectPanel } from "@/components/new-project-panel";
import { useProjects } from "@/hooks/use-projects";
import { countBoreholesForProject } from "@/lib/borehole-storage";
import { formatProjectCreatedAt } from "@/lib/project-id";
import { isBuiltInProject } from "@/lib/projects";
import type { Project } from "@/lib/types";

export default function ProjectsPage() {
  const { projects, addProject, deleteProject } = useProjects();
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null);

  useEffect(() => {
    if (!pendingDelete) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPendingDelete(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingDelete]);

  function handleConfirmDelete() {
    if (!pendingDelete) return;
    deleteProject(pendingDelete.id);
    setPendingDelete(null);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {pendingDelete && (
        <ConfirmDeleteProjectModal
          project={pendingDelete}
          boreholeCount={countBoreholesForProject(pendingDelete.id)}
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)] sm:text-3xl">
            Projects
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Manage drilling campaigns, sites, and clients.
          </p>
        </div>
        <NewProjectPanel addProject={addProject} variant="section" />
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-black/[0.02] dark:bg-white/[0.03]">
                <th className="px-4 py-3 font-semibold text-[var(--text)] sm:px-5">
                  Project ID
                </th>
                <th className="px-4 py-3 font-semibold text-[var(--text)] sm:px-5">
                  Name
                </th>
                <th className="px-4 py-3 font-semibold text-[var(--text)] sm:px-5">
                  Location
                </th>
                <th className="px-4 py-3 font-semibold text-[var(--text)] sm:px-5">
                  Client
                </th>
                <th className="px-4 py-3 font-semibold text-[var(--text)] sm:px-5">
                  Created
                </th>
                <th className="px-4 py-3 text-right font-semibold text-[var(--text)] sm:px-5">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {projects.map((p) => {
                const canDelete = !isBuiltInProject(p.id);
                return (
                  <tr
                    key={p.id}
                    className="transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.04]"
                  >
                    <td className="whitespace-nowrap px-4 py-4 font-mono text-xs text-[var(--text)] sm:px-5">
                      {p.code}
                    </td>
                    <td className="px-4 py-4 font-medium text-[var(--text)] sm:px-5">
                      {p.name}
                    </td>
                    <td className="px-4 py-4 text-[var(--muted)] sm:px-5">
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0 opacity-70" />
                        {p.location}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-[var(--muted)] sm:px-5">
                      <span className="inline-flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 shrink-0 opacity-70" />
                        {p.client}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-[var(--muted)] sm:px-5">
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <Calendar className="h-3.5 w-3.5 shrink-0 opacity-70" />
                        {formatProjectCreatedAt(p.createdAt)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right sm:px-5">
                      {canDelete ? (
                        <button
                          type="button"
                          onClick={() => setPendingDelete(p)}
                          className="inline-flex items-center justify-center rounded-lg bg-red-600 p-2 text-white shadow-sm hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                          title="Delete project"
                          aria-label={`Delete project ${p.name}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      ) : (
                        <span className="text-xs text-[var(--muted)]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-center text-xs text-[var(--muted)] sm:text-left">
        {projects.length} project{projects.length !== 1 ? "s" : ""} · Demo projects plus any you add
        (saved in this browser until a server database is connected). Built-in demo projects cannot
        be deleted.
      </p>
    </div>
  );
}
