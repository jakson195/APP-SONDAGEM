"use client";

import { FormEvent, useEffect, useId, useMemo, useState } from "react";
import { Crosshair, FileDown, FolderInput, Layers } from "lucide-react";
import { BoreholeSptReport } from "@/components/borehole-spt-report";
import { CprmGeotechnicalReport } from "@/components/cprm-geotechnical-report";
import { BoreholeCoordinatesMap } from "@/components/borehole-coordinates-map";
import { NewProjectPanel } from "@/components/new-project-panel";
import { useProjects } from "@/hooks/use-projects";
import { emptySptRow, SptInputTable } from "@/components/spt-input-table";
import {
  BOREHOLES_CHANGED_EVENT,
  loadBoreholes,
  saveBoreholes,
} from "@/lib/borehole-storage";
import { formatProjectCreatedAt } from "@/lib/project-id";
import type { BoreholeInput, SptReading } from "@/lib/types";

export default function BoreholesPage() {
  const formId = useId();
  const { projects, addProject } = useProjects();
  const [projectId, setProjectId] = useState("");
  const [boreholeId, setBoreholeId] = useState("");
  const [depthM, setDepthM] = useState("");
  const [coordX, setCoordX] = useState("");
  const [coordY, setCoordY] = useState("");
  const [sptReadings, setSptReadings] = useState<SptReading[]>([emptySptRow()]);
  const [saved, setSaved] = useState<BoreholeInput[]>([]);
  const [boreholesStorageReady, setBoreholesStorageReady] = useState(false);
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const [reportLayout, setReportLayout] = useState<"cprm" | "standard">("cprm");

  useEffect(() => {
    setSaved(loadBoreholes());
    setBoreholesStorageReady(true);
    const sync = () => setSaved(loadBoreholes());
    window.addEventListener(BOREHOLES_CHANGED_EVENT, sync);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "vision-sondagem-boreholes") sync();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(BOREHOLES_CHANGED_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (!boreholesStorageReady) return;
    saveBoreholes(saved);
  }, [saved, boreholesStorageReady]);

  useEffect(() => {
    if (projects.length === 0) return;
    setProjectId((prev) =>
      prev && projects.some((p) => p.id === prev) ? prev : projects[0].id,
    );
  }, [projects]);

  const project = useMemo(
    () => projects.find((x) => x.id === projectId),
    [projects, projectId],
  );

  const effectiveBoreholeDepth = useMemo(() => {
    const d = parseFloat(depthM);
    return Math.max(
      Number.isFinite(d) ? d : 0,
      ...sptReadings.filter((r) => r.depthM > 0).map((r) => r.depthM),
      0,
      0.1,
    );
  }, [depthM, sptReadings]);

  const reportMeta = useMemo(() => {
    const d = parseFloat(depthM);
    const x = parseFloat(coordX);
    const y = parseFloat(coordY);
    return {
      projectName: project?.name ?? "—",
      projectLocation: project?.location ?? "—",
      clientName: project?.client ?? "—",
      boreholeId: boreholeId.trim() || "Draft",
      totalDepthM: Number.isFinite(d) ? d : effectiveBoreholeDepth,
      coordinateX: Number.isFinite(x) ? x : 0,
      coordinateY: Number.isFinite(y) ? y : 0,
    };
  }, [
    project,
    boreholeId,
    depthM,
    coordX,
    coordY,
    effectiveBoreholeDepth,
  ]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const depth = parseFloat(depthM);
    const x = parseFloat(coordX);
    const y = parseFloat(coordY);
    if (
      !projectId ||
      !boreholeId.trim() ||
      Number.isNaN(depth) ||
      Number.isNaN(x) ||
      Number.isNaN(y)
    ) {
      return;
    }
    const row: BoreholeInput = {
      id: crypto.randomUUID(),
      projectId,
      boreholeId: boreholeId.trim(),
      depthM: depth,
      x,
      y,
      sptReadings: sptReadings.map((r) => ({ ...r })),
    };
    setSaved((prev) => [row, ...prev]);
    setBoreholeId("");
    setDepthM("");
    setCoordX("");
    setCoordY("");
    setSptReadings([emptySptRow()]);
  }

  function loadBoreholeIntoForm(b: BoreholeInput) {
    setProjectId(b.projectId);
    setBoreholeId(b.boreholeId);
    setDepthM(String(b.depthM));
    setCoordX(String(b.x));
    setCoordY(String(b.y));
    setSptReadings(
      b.sptReadings.length > 0
        ? b.sptReadings.map((r) => ({ ...r }))
        : [emptySptRow()],
    );
    window.requestAnimationFrame(() => {
      document.getElementById(`${formId}-project`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)] sm:text-3xl">
            Boreholes
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Create a borehole for a project: ID, depth, coordinates, and SPT readings.
            Use the printable report below for table, NSPT chart, and stratigraphic profile.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm sm:p-6"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1">
              <label
                htmlFor={`${formId}-project`}
                className="mb-1.5 block text-sm font-medium text-[var(--text)]"
              >
                Project
              </label>
              <div className="relative max-w-xl">
                <Layers className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                <select
                  id={`${formId}-project`}
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  disabled={projects.length === 0}
                  required
                  className="w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-10 pr-10 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {projects.length === 0 && (
                    <option value="">No projects available</option>
                  )}
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
              {project && (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  <span className="font-medium text-[var(--text)]">{project.code}</span>
                  {" · "}
                  {project.location} · {project.client}
                  {" · "}
                  Created {formatProjectCreatedAt(project.createdAt)}
                </p>
              )}
            </div>
            <NewProjectPanel
              variant="toolbar"
              addProject={addProject}
              onCreated={(p) => setProjectId(p.id)}
              className="shrink-0 print:hidden"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:max-w-3xl">
            <div className="sm:col-span-2">
              <label
                htmlFor={`${formId}-bh-id`}
                className="mb-1.5 block text-sm font-medium text-[var(--text)]"
              >
                Borehole ID
              </label>
              <input
                id={`${formId}-bh-id`}
                value={boreholeId}
                onChange={(e) => setBoreholeId(e.target.value)}
                required
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]"
                placeholder="e.g. BH-01"
                autoComplete="off"
              />
            </div>
            <div>
              <label
                htmlFor={`${formId}-depth`}
                className="mb-1.5 block text-sm font-medium text-[var(--text)]"
              >
                Depth (m)
              </label>
              <input
                id={`${formId}-depth`}
                type="number"
                step="any"
                min={0}
                value={depthM}
                onChange={(e) => setDepthM(e.target.value)}
                required
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]"
                placeholder="0"
              />
            </div>
            <div className="sm:col-span-2">
              <p className="mb-2 text-sm font-medium text-[var(--text)]">Coordinates</p>
              <p className="mb-3 text-xs text-[var(--muted)]">
                For Google Maps: enter WGS84 decimal degrees — <strong className="font-medium text-[var(--text)]">X</strong> = longitude,{" "}
                <strong className="font-medium text-[var(--text)]">Y</strong> = latitude (e.g. Florianópolis ≈ −48.55, −27.59).
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor={`${formId}-x`}
                  className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-[var(--text)]"
                >
                  <Crosshair className="h-3.5 w-3.5 text-[var(--muted)]" aria-hidden />
                  X (longitude °)
                </label>
                <input
                  id={`${formId}-x`}
                  type="number"
                  step="any"
                  value={coordX}
                  onChange={(e) => setCoordX(e.target.value)}
                  required
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]"
                  placeholder="−48.55"
                />
              </div>
              <div>
                <label
                  htmlFor={`${formId}-y`}
                  className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-[var(--text)]"
                >
                  <Crosshair className="h-3.5 w-3.5 text-[var(--muted)]" aria-hidden />
                  Y (latitude °)
                </label>
                <input
                  id={`${formId}-y`}
                  type="number"
                  step="any"
                  value={coordY}
                  onChange={(e) => setCoordY(e.target.value)}
                  required
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]"
                  placeholder="−27.59"
                />
              </div>
              </div>
              <BoreholeCoordinatesMap
                className="mt-4 max-w-3xl print:hidden"
                coordX={coordX}
                coordY={coordY}
                onCoordinatesChange={(x, y) => {
                  setCoordX(x);
                  setCoordY(y);
                }}
              />
            </div>
          </div>

          <div className="border-t border-[var(--border)] pt-6">
            <h2 className="mb-4 text-sm font-semibold text-[var(--text)]">SPT input</h2>
            <SptInputTable
              rows={sptReadings}
              onRowsChange={setSptReadings}
              idPrefix={formId}
            />
          </div>

          <div className="flex justify-end border-t border-[var(--border)] pt-6">
            <button
              type="submit"
              disabled={!projectId || projects.length === 0}
              className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              Create borehole
            </button>
          </div>
        </form>

        {saved.length > 0 && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
            <div className="border-b border-[var(--border)] px-4 py-3 sm:px-5">
              <h2 className="text-sm font-semibold text-[var(--text)]">
                Saved boreholes
              </h2>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Stored in this browser. Load one into the form to edit or duplicate before saving again.
              </p>
            </div>
            <ul className="divide-y divide-[var(--border)]">
              {saved.map((b) => {
                const savedProject = projects.find((p) => p.id === b.projectId);
                return (
                  <li key={b.id} className="px-4 py-4 sm:px-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-medium text-[var(--text)]">{b.boreholeId}</p>
                        <p className="text-sm text-[var(--muted)]">
                          {savedProject
                            ? `${savedProject.code} · ${savedProject.name}`
                            : `Project ${b.projectId}`}
                          {" · "}
                          Depth {b.depthM} m · X {b.x}, Y {b.y}
                          {b.sptReadings.length > 0
                            ? ` · SPT: ${b.sptReadings.length} row(s)`
                            : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-2 self-start sm:flex-row sm:items-center">
                        <button
                          type="button"
                          onClick={() => loadBoreholeIntoForm(b)}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                        >
                          <FolderInput className="h-4 w-4" aria-hidden />
                          Load into form
                        </button>
                        <button
                          type="button"
                          disabled={pdfLoadingId === b.id || !savedProject}
                          onClick={async () => {
                            if (!savedProject) return;
                            setPdfLoadingId(b.id);
                            try {
                              const { downloadBoreholeReportPdf } = await import(
                                "@/lib/pdf/download-borehole-report"
                              );
                              await downloadBoreholeReportPdf(b, savedProject);
                            } finally {
                              setPdfLoadingId(null);
                            }
                          }}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text)] hover:bg-black/[0.04] disabled:opacity-50 dark:hover:bg-white/[0.06]"
                        >
                          <FileDown className="h-4 w-4" aria-hidden />
                          {pdfLoadingId === b.id ? "Generating…" : "Download PDF report"}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <section id="borehole-printable-report" aria-label="Printable SPT and soil profile report">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 print:hidden">
          <h2 className="text-sm font-semibold text-[var(--text)]">Printable report</h2>
          <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <span>Layout</span>
            <select
              value={reportLayout}
              onChange={(e) =>
                setReportLayout(e.target.value === "standard" ? "standard" : "cprm")
              }
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text)]"
            >
              <option value="cprm">CPRM-style (A4)</option>
              <option value="standard">Standard (N1–N3 table)</option>
            </select>
          </label>
        </div>
        {reportLayout === "cprm" ? (
          <CprmGeotechnicalReport
            projectName={reportMeta.projectName}
            projectLocation={reportMeta.projectLocation}
            clientName={reportMeta.clientName}
            boreholeId={reportMeta.boreholeId}
            totalDepthM={reportMeta.totalDepthM}
            coordinateX={reportMeta.coordinateX}
            coordinateY={reportMeta.coordinateY}
            readings={sptReadings}
            showPrintButton
          />
        ) : (
          <BoreholeSptReport
            projectName={reportMeta.projectName}
            projectLocation={reportMeta.projectLocation}
            clientName={reportMeta.clientName}
            boreholeId={reportMeta.boreholeId}
            totalDepthM={reportMeta.totalDepthM}
            coordinateX={reportMeta.coordinateX}
            coordinateY={reportMeta.coordinateY}
            readings={sptReadings}
            showPrintButton
          />
        )}
      </section>
    </div>
  );
}
