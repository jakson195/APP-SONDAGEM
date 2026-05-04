"use client";

import { FormEvent, useId, useState } from "react";
import { FolderPlus, X } from "lucide-react";
import type { Project } from "@/lib/types";
import type { NewProjectInput } from "@/hooks/use-projects";

type Props = {
  /** Called after a project is saved (e.g. select it on another screen). */
  onCreated?: (project: Project) => void;
  addProject: (input: NewProjectInput) => Project;
  /** Compact trigger next to other controls */
  variant?: "toolbar" | "section";
  className?: string;
};

export function NewProjectPanel({
  onCreated,
  addProject,
  variant = "section",
  className = "",
}: Props) {
  const baseId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [client, setClient] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setLocation("");
    setClient("");
    setError(null);
    setOpen(false);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    const l = location.trim();
    const c = client.trim();
    if (!n || !l || !c) {
      setError("Fill in all fields.");
      return;
    }
    const project = addProject({ name: n, location: l, client: c });
    onCreated?.(project);
    reset();
  }

  const triggerClass =
    variant === "toolbar"
      ? "inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
      : "inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90";

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setError(null);
        }}
        className={triggerClass}
      >
        <FolderPlus className="h-4 w-4 shrink-0" aria-hidden />
        New Project
      </button>

      {open && (
        <div
          className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm"
          role="dialog"
          aria-labelledby={`${baseId}-title`}
        >
          <div className="mb-3 flex items-start justify-between gap-2">
            <h2 id={`${baseId}-title`} className="text-sm font-semibold text-[var(--text)]">
              New project
            </h2>
            <button
              type="button"
              onClick={reset}
              className="rounded-md p-1 text-[var(--muted)] hover:bg-black/[0.06] hover:text-[var(--text)] dark:hover:bg-white/[0.08]"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <p className="text-[11px] leading-snug text-[var(--muted)]">
              A unique project ID (e.g. PRJ-… ) and creation timestamp are generated automatically
              when you create the project.
            </p>
            <div>
              <label
                htmlFor={`${baseId}-name`}
                className="mb-1 block text-xs font-medium text-[var(--text)]"
              >
                Project name
              </label>
              <input
                id={`${baseId}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="off"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]"
                placeholder="e.g. Viaduto Norte"
              />
            </div>
            <div>
              <label
                htmlFor={`${baseId}-location`}
                className="mb-1 block text-xs font-medium text-[var(--text)]"
              >
                Location
              </label>
              <input
                id={`${baseId}-location`}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
                autoComplete="off"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]"
                placeholder="City, state"
              />
            </div>
            <div>
              <label
                htmlFor={`${baseId}-client`}
                className="mb-1 block text-xs font-medium text-[var(--text)]"
              >
                Client
              </label>
              <input
                id={`${baseId}-client`}
                value={client}
                onChange={(e) => setClient(e.target.value)}
                required
                autoComplete="off"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]"
                placeholder="Company or department"
              />
            </div>
            {error && (
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            )}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={reset}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                Create project
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
