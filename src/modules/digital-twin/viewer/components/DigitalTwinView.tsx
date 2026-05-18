"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { fetchProjects } from "../api/client";
import type { ProjectSummary } from "../api/types";
import { CesiumProvider, useCesium } from "../context/CesiumContext";
import { useProjectLayers } from "../hooks/useProjectLayers";
import { CesiumViewer } from "./cesium/CesiumViewer";
import { InsarProfessionalToolbar } from "./cesium/InsarProfessionalToolbar";
import { InsarTimelineBar } from "./cesium/InsarTimelineBar";
import { LayerPanel } from "./cesium/LayerPanel";
import { MouseCoordinateHud } from "./cesium/MouseCoordinateHud";
import { ViewerToolbar } from "./cesium/ViewerToolbar";

export type DigitalTwinViewerMode = "full" | "insar" | "lidar";

type Props = {
  viewerMode?: DigitalTwinViewerMode;
  onProjectIdChange?: (id: string | null) => void;
};

function TwinShellFallback() {
  return (
    <div className="twin-layout twin-layout--loading">
      <div className="twin-viewer-wrap">
        <div className="viewer-loading" style={{ pointerEvents: "none" }}>
          A preparar viewer…
        </div>
      </div>
      <aside className="layer-panel">
        <header className="panel-header">
          <h2>Camadas</h2>
        </header>
      </aside>
    </div>
  );
}

function TwinShellInner({
  viewerMode,
  onProjectIdChange,
}: {
  viewerMode: DigitalTwinViewerMode;
  onProjectIdChange?: (id: string | null) => void;
}) {
  const layoutRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const obraRaw = searchParams.get("obraId");
  const obraId =
    obraRaw != null &&
    obraRaw !== "" &&
    Number.isFinite(Number(obraRaw))
      ? Number(obraRaw)
      : null;

  const { ready, setProjectId, projectId } = useCesium();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<ProjectSummary | null>(null);

  useEffect(() => {
    fetchProjects()
      .then((res) => {
        setProjects(res.items);
        const byUrl =
          obraId != null
            ? res.items.find((p) => p.id === String(obraId))
            : null;
        const picked =
          byUrl ??
          res.items.find((p) => p.code === "DEMO-01") ??
          res.items[0] ??
          null;
        if (picked) {
          setProject(picked);
          setProjectId(picked.id);
          onProjectIdChange?.(picked.id);
        }
      })
      .catch(() => setProjects([]));
  }, [setProjectId, onProjectIdChange, obraId]);

  useProjectLayers(project);

  const onProjectChange = (id: string) => {
    const p = projects.find((x) => x.id === id) ?? null;
    setProject(p);
    const pid = p?.id ?? null;
    setProjectId(pid);
    onProjectIdChange?.(pid);
  };

  const isInsarPro = viewerMode === "insar";
  const layerViewerMode: "full" | "insar" | "lidar" | undefined =
    viewerMode === "insar"
      ? "insar"
      : viewerMode === "lidar"
        ? "lidar"
        : undefined;

  return (
    <div
      ref={isInsarPro ? layoutRef : undefined}
      className={[
        "twin-layout",
        isInsarPro ? "twin-layout--insar-pro" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="twin-viewer-wrap">
        <CesiumViewer chrome={isInsarPro ? "insar_pro" : "default"} />
        {isInsarPro ? (
          <>
            <MouseCoordinateHud />
            <InsarProfessionalToolbar
              project={project}
              layoutRef={layoutRef}
              obraId={obraId}
            />
          </>
        ) : (
          <ViewerToolbar project={project} />
        )}
        {!ready && <div className="viewer-loading">A iniciar Cesium…</div>}
      </div>
      <LayerPanel viewerMode={layerViewerMode} />
      {viewerMode !== "lidar" ? (
        <InsarTimelineBar projectId={projectId} />
      ) : null}
      <div className="project-select-wrap">
        <label>
          Projeto
          <select
            value={projectId ?? ""}
            onChange={(e) => onProjectChange(e.target.value)}
            disabled={projects.length === 0}
          >
            {projects.length === 0 && <option value="">—</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

export function DigitalTwinView({
  viewerMode = "full",
  onProjectIdChange,
}: Props) {
  return (
    <CesiumProvider>
      <Suspense fallback={<TwinShellFallback />}>
        <TwinShellInner
          viewerMode={viewerMode}
          onProjectIdChange={onProjectIdChange}
        />
      </Suspense>
    </CesiumProvider>
  );
}
