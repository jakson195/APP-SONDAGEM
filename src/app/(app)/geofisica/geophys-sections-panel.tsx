"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  addGeophysSection,
  geophysProjectStorageKey,
  loadGeophysProject,
  loadGeophysProjectAsync,
  removeGeophysSection,
  setPendingQcLoad,
  setPendingVolumeLoad,
  suggestNextGeoCode,
  type GeophysProjectStore,
  type SavedGeophysSection,
} from "@/lib/geofisica/geophys-project/geophys-project-storage";

type GeophysSectionsPanelProps = {
  /** Obra activa — secções guardadas por obra no navegador */
  obraId?: number | null;
  /** Mensagem após guardar ou remover */
  onNotice?: (msg: string) => void;
  /** Mostrar botão para abrir secções no modelo 3D */
  showVolumeActions?: boolean;
  /** Mostrar botão para importar secções no QC */
  showQcActions?: boolean;
  /** Callback ao importar secções no QC (em vez de navegar) */
  onImportToQc?: (sections: SavedGeophysSection[]) => void;
  /** Incrementar para forçar recarga (mesma aba) */
  refreshKey?: number;
  className?: string;
};

export function GeophysSectionsPanel({
  obraId = null,
  onNotice,
  showVolumeActions = true,
  showQcActions = false,
  onImportToQc,
  refreshKey = 0,
  className = "",
}: GeophysSectionsPanelProps) {
  const storageKey = geophysProjectStorageKey(obraId);
  const [project, setProject] = useState<GeophysProjectStore>(() =>
    loadGeophysProject(obraId),
  );

  const refresh = useCallback(() => {
    if (obraId != null && obraId > 0) {
      void loadGeophysProjectAsync(obraId).then(setProject);
    } else {
      setProject(loadGeophysProject(obraId));
    }
  }, [obraId]);

  useEffect(() => {
    refresh();
  }, [refreshKey, refresh, obraId]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey) {
        refresh();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh, storageKey]);

  const handleRemove = (section: SavedGeophysSection) => {
    if (
      !window.confirm(
        `Remover ${section.code} (${section.name}) do projeto?`,
      )
    ) {
      return;
    }
    const next = removeGeophysSection(section.id, obraId);
    setProject(next);
    onNotice?.(`${section.code} removida do projeto.`);
  };

  const openInVolume = (ids: string[] | "all") => {
    setPendingVolumeLoad(ids);
    onNotice?.(
      ids === "all"
        ? "A abrir todas as secções no Modelo 3D…"
        : "A abrir secção no Modelo 3D…",
    );
  };

  const importToQc = (ids: string[] | "all") => {
    const selected =
      ids === "all"
        ? project.sections
        : project.sections.filter(
            (s) => ids.includes(s.id) || ids.includes(s.code),
          );
    if (selected.length === 0) {
      onNotice?.("Nenhuma secção encontrada.");
      return;
    }
    if (onImportToQc) {
      onImportToQc(selected);
      onNotice?.(
        `${selected.length} secção(ões) importada(s) para QC.`,
      );
      return;
    }
    setPendingQcLoad(ids);
    onNotice?.("A abrir secções no QC…");
  };

  if (obraId == null) {
    return (
      <div
        className={`rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100 ${className}`}
      >
        <p className="font-medium">Selecione a obra do projeto</p>
        <p className="mt-1 text-xs opacity-90">
          Use o selector «Obra (projeto)» no topo da página (ou em{" "}
          <Link href="/obras" className="underline">
            Obras
          </Link>
          ) para vincular secções ERT a esta obra.
        </p>
      </div>
    );
  }

  if (project.sections.length === 0) {
    return (
      <div
        className={`rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg)]/50 px-4 py-3 text-sm text-[var(--muted)] ${className}`}
      >
        <p className="font-medium text-[var(--text)]">
          Secções do projeto (GEO01, GEO02…)
        </p>
        <p className="mt-1 text-xs">
          Ainda não há secções guardadas nesta obra. Após calcular o modelo
          invertido no Dipolo-Dipolo, use «Guardar secção no projeto».
        </p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border border-[var(--border)] bg-[var(--surface)] ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text)]">
            Secções do projeto
          </h3>
          <p className="text-xs text-[var(--muted)]">
            {project.sections.length} secção(ões) — próximo código:{" "}
            {suggestNextGeoCode(project.sections)}
          </p>
        </div>
        {showVolumeActions && project.sections.length >= 1 && (
          <Link
            href="/geofisica/volume-3d"
            onClick={() => openInVolume("all")}
            className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800"
          >
            Abrir todas no Modelo 3D
          </Link>
        )}
        {showQcActions && project.sections.length >= 1 && (
          onImportToQc ? (
            <button
              type="button"
              onClick={() => importToQc("all")}
              className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800"
            >
              Importar todas no QC
            </button>
          ) : (
            <Link
              href="/geofisica/qc"
              onClick={() => importToQc("all")}
              className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800"
            >
              Importar todas no QC
            </Link>
          )
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--muted)]">
              <th className="px-3 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Nome</th>
              <th className="px-3 py-2 font-medium">Leituras</th>
              <th className="px-3 py-2 font-medium">RMS log₁₀</th>
              <th className="px-3 py-2 font-medium">Guardada</th>
              <th className="px-3 py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {[...project.sections]
              .sort((a, b) => a.code.localeCompare(b.code))
              .map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-[var(--border)]/60 last:border-0"
                >
                  <td className="px-3 py-2 font-mono font-semibold text-teal-800 dark:text-teal-300">
                    {s.code}
                  </td>
                  <td className="max-w-[140px] truncate px-3 py-2" title={s.name}>
                    {s.name}
                  </td>
                  <td className="px-3 py-2 font-mono">{s.readings.length}</td>
                  <td className="px-3 py-2 font-mono">
                    {s.invertSummary?.rmsLog10.toFixed(4) ?? "—"}
                    {s.invertResult ? (
                      <span className="ml-1 text-teal-700 dark:text-teal-400" title="Modelo invertido incluído">
                        ✓
                      </span>
                    ) : (
                      <span className="ml-1 text-amber-600" title="Sem modelo — volte a guardar no Dipolo-Dipolo">
                        !
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[var(--muted)]">
                    {new Date(s.savedAt).toLocaleDateString("pt-PT")}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {showQcActions &&
                        (onImportToQc ? (
                          <button
                            type="button"
                            onClick={() => onImportToQc([s])}
                            className="rounded border border-teal-600/40 px-2 py-0.5 text-teal-800 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-950/40"
                          >
                            QC
                          </button>
                        ) : (
                          <Link
                            href="/geofisica/qc"
                            onClick={() => importToQc([s.id])}
                            className="rounded border border-teal-600/40 px-2 py-0.5 text-teal-800 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-950/40"
                          >
                            QC
                          </Link>
                        ))}
                      {showVolumeActions && (
                        <Link
                          href="/geofisica/volume-3d"
                          onClick={() => openInVolume([s.id])}
                          className="rounded border border-teal-600/40 px-2 py-0.5 text-teal-800 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-950/40"
                        >
                          3D
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemove(s)}
                        className="rounded border border-red-500/30 px-2 py-0.5 text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        Remover
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Guarda secção e devolve o projeto actualizado. */
export function persistGeophysSection(
  section: SavedGeophysSection,
  obraId: number | null = null,
): GeophysProjectStore {
  return addGeophysSection(section, obraId);
}

export { suggestNextGeoCode, loadGeophysProject };
