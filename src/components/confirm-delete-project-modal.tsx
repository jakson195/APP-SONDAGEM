"use client";

import { AlertTriangle } from "lucide-react";
import type { Project } from "@/lib/types";

type Props = {
  project: Project;
  boreholeCount: number;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDeleteProjectModal({
  project,
  boreholeCount,
  onConfirm,
  onCancel,
}: Props) {
  const hasBoreholes = boreholeCount > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        aria-label="Close dialog"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-project-title"
        aria-describedby="delete-project-desc"
        className="relative z-10 w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl"
      >
        <h2
          id="delete-project-title"
          className="text-lg font-semibold tracking-tight text-[var(--text)]"
        >
          Delete project?
        </h2>
        <p id="delete-project-desc" className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
          Are you sure you want to delete this project?
        </p>
        <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)]">
          <span className="font-mono text-xs text-[var(--muted)]">{project.code}</span>
          <p className="mt-0.5 font-medium">{project.name}</p>
        </div>
        {hasBoreholes && (
          <div
            className="mt-4 flex gap-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-3 text-sm text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100"
            role="alert"
          >
            <AlertTriangle
              className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden
            />
            <p>
              This project has{" "}
              <strong className="font-semibold">
                {boreholeCount} borehole{boreholeCount !== 1 ? "s" : ""}
              </strong>
              . Deleting it will permanently remove those borehole records from this browser.
            </p>
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
          >
            Delete project
          </button>
        </div>
      </div>
    </div>
  );
}
