import { useEffect, useState } from "react";

import { fetchProjects } from "../api/client";
import type { ProjectSummary } from "../api/types";
import { CesiumProvider, useCesium } from "../context/CesiumContext";
import { useProjectLayers } from "../hooks/useProjectLayers";
import { CesiumViewer } from "./cesium/CesiumViewer";
import { LayerPanel } from "./cesium/LayerPanel";
import { InsarTimelineBar } from "./cesium/InsarTimelineBar";
import { ViewerToolbar } from "./cesium/ViewerToolbar";
function TwinShell({
  onProjectIdChange,
}: {
  onProjectIdChange?: (id: string | null) => void;
}) {
  const { ready, setProjectId, projectId } = useCesium();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<ProjectSummary | null>(null);

  useEffect(() => {
    fetchProjects()
      .then((res) => {
        setProjects(res.items);
        const demo =
          res.items.find((p) => p.code === "DEMO-01") ?? res.items[0] ?? null;
        if (demo) {
          setProject(demo);
          setProjectId(demo.id);
          onProjectIdChange?.(demo.id);
        }
      })
      .catch(() => setProjects([]));
  }, [setProjectId]);

  useProjectLayers(project);

  const onProjectChange = (id: string) => {
    const p = projects.find((x) => x.id === id) ?? null;
    setProject(p);
    const pid = p?.id ?? null;
    setProjectId(pid);
    onProjectIdChange?.(pid);
  };

  return (
    <div className="twin-layout">
      <div className="twin-viewer-wrap">
        <CesiumViewer />
        <ViewerToolbar project={project} />
        {!ready && <div className="viewer-loading">A iniciar Cesium…</div>}
      </div>
      <LayerPanel />
      <InsarTimelineBar projectId={projectId} />
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

type Props = {
  onProjectIdChange?: (id: string | null) => void;
};

export function DigitalTwinView({ onProjectIdChange }: Props) {
  return (
    <CesiumProvider>
      <TwinShell onProjectIdChange={onProjectIdChange} />
    </CesiumProvider>
  );
}
